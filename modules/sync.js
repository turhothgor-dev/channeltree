// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

/**
 * Sincronización con storage.sync (ADR 0028). Sin DOM; solo se carga en el
 * fondo, tras backup.js. Este bloque contiene las funciones puras: texto
 * canónico, hash, troceado, réplica y decisión de recepción.
 */
const YouTubeGroupsSync = (() => {
  const FORMAT = "youtube-groups-sync";
  const VERSION = 1;
  const META_KEY = "ygSync:meta";
  const CHUNK_PREFIX = "ygSync:";
  const ITEM_BUDGET_BYTES = 8000;
  const TOTAL_BUDGET_BYTES = 97280;
  const DEBOUNCE_MS = 5000;

  /**
   * Serializa a JSON sin espacios, con las claves de los objetos ordenadas y
   * los arrays en su orden, para que el mismo dato dé siempre el mismo texto.
   *
   * @param {*} value - Valor serializable.
   * @returns {string} Texto canónico.
   */
  function stableStringify(value) {
    if (Array.isArray(value)) {
      return `[${value.map((item) => stableStringify(item === undefined ? null : item)).join(",")}]`;
    }
    if (typeof value === "object" && value !== null) {
      const parts = [];
      for (const key of Object.keys(value).sort()) {
        if (value[key] === undefined) {
          continue;
        }
        parts.push(`${JSON.stringify(key)}:${stableStringify(value[key])}`);
      }
      return `{${parts.join(",")}}`;
    }
    return JSON.stringify(value);
  }

  /**
   * Hash FNV-1a de 32 bits sobre las unidades UTF-16 del texto.
   *
   * @param {string} text - Texto a resumir.
   * @returns {string} "fnv1a32:<8 hex>:<longitud>".
   */
  function hashText(text) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `fnv1a32:${hash.toString(16).padStart(8, "0")}:${text.length}`;
  }

  /**
   * Bytes UTF-8 de una cadena (los sustitutos sueltos cuentan como 3).
   *
   * @param {string} text - Cadena.
   * @returns {number} Bytes.
   */
  function utf8Length(text) {
    let bytes = 0;
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      if (code < 0x80) {
        bytes += 1;
      } else if (code < 0x800) {
        bytes += 2;
      } else if (code >= 0xd800 && code <= 0xdbff) {
        const next = text.charCodeAt(i + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          bytes += 4;
          i += 1;
        } else {
          bytes += 3;
        }
      } else {
        bytes += 3;
      }
    }
    return bytes;
  }

  /**
   * Tamaño que storage.sync cuenta para un elemento.
   *
   * @param {string} key - Clave.
   * @param {*} value - Valor.
   * @returns {number} Bytes UTF-8 de la clave más su JSON.
   */
  function measureItem(key, value) {
    return utf8Length(key) + utf8Length(JSON.stringify(value));
  }

  /**
   * Parte el texto en trozos que caben en un elemento de storage.sync, sin
   * partir pares sustitutos.
   *
   * @param {string} text - Texto canónico.
   * @param {number} [maxItemBytes] - Máximo por elemento (clave incluida).
   * @returns {string[]} Trozos (vacío si el texto es "").
   */
  function chunkText(text, maxItemBytes = ITEM_BUDGET_BYTES) {
    const chunks = [];
    let current = "";
    let currentBytes = 0;
    let base = 0;
    const startChunk = () => {
      current = "";
      base = utf8Length(`${CHUNK_PREFIX}${chunks.length}`) + 2;
      currentBytes = base;
    };
    startChunk();
    for (const char of text) {
      const cost = utf8Length(JSON.stringify(char)) - 2;
      if (currentBytes + cost > maxItemBytes && current !== "") {
        chunks.push(current);
        startChunk();
      }
      current += char;
      currentBytes += cost;
    }
    if (current !== "") {
      chunks.push(current);
    }
    return chunks;
  }

  /**
   * Construye los elementos a escribir en storage.sync.
   *
   * @param {string} text - Texto canónico.
   * @param {{ deviceId: string, now: number }} options - Origen y marca de tiempo.
   * @returns {{ items: Object<string, *>, bytes: number }} Elementos y su tamaño total.
   */
  function buildReplica(text, { deviceId, now }) {
    const chunks = chunkText(text);
    const items = {};
    const meta = {
      format: FORMAT,
      version: VERSION,
      deviceId,
      hash: hashText(text),
      chunks: chunks.length,
      bytes: 0,
      updatedAt: now,
    };
    items[META_KEY] = meta;
    chunks.forEach((chunk, index) => {
      items[`${CHUNK_PREFIX}${index}`] = chunk;
    });
    const total = () =>
      Object.entries(items).reduce(
        (sum, [key, value]) => sum + measureItem(key, value),
        0,
      );
    // meta.bytes forma parte de lo que mide: se itera hasta que se estabiliza.
    let bytes = total();
    for (let i = 0; i < 5; i += 1) {
      meta.bytes = bytes;
      const next = total();
      if (next === bytes) {
        break;
      }
      bytes = next;
    }
    return { items, bytes };
  }

  /**
   * @param {*} value - Valor a comprobar.
   * @returns {boolean} true si es un número finito.
   */
  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  /**
   * Lee y valida la réplica de un volcado completo de storage.sync.
   *
   * @param {Object<string, *>} all - Resultado de sync.get(null).
   * @returns {{ status: "empty"|"incomplete"|"invalid"|"ok", meta: Object|null, text: string }}
   */
  function readReplica(all) {
    const meta = all ? all[META_KEY] : undefined;
    if (meta === undefined) {
      return { status: "empty", meta: null, text: "" };
    }
    if (
      typeof meta !== "object" ||
      meta === null ||
      Array.isArray(meta) ||
      meta.format !== FORMAT ||
      meta.version !== VERSION ||
      typeof meta.deviceId !== "string" ||
      meta.deviceId === "" ||
      typeof meta.hash !== "string" ||
      !Number.isInteger(meta.chunks) ||
      meta.chunks < 0 ||
      !isFiniteNumber(meta.bytes) ||
      !isFiniteNumber(meta.updatedAt)
    ) {
      return { status: "invalid", meta: null, text: "" };
    }
    const parts = [];
    for (let i = 0; i < meta.chunks; i += 1) {
      const part = all[`${CHUNK_PREFIX}${i}`];
      if (typeof part !== "string") {
        return { status: "incomplete", meta, text: "" };
      }
      parts.push(part);
    }
    const text = parts.join("");
    if (hashText(text) !== meta.hash) {
      return { status: "incomplete", meta, text: "" };
    }
    return { status: "ok", meta, text };
  }

  /**
   * Decide qué hacer con la réplica leída.
   *
   * @param {{ replica: { status: string, meta: Object|null }, state: Object }} input - Réplica y estado local.
   * @returns {"ignore"|"push"|"pull"} Acción.
   */
  function decideIncoming({ replica, state }) {
    if (replica.status !== "ok") {
      return "ignore";
    }
    const { meta } = replica;
    if (meta.deviceId === state.deviceId || meta.hash === state.lastHash) {
      return "ignore";
    }
    if (state.dirtySince !== null && state.dirtySince > meta.updatedAt) {
      return "push";
    }
    return "pull";
  }

  /**
   * @returns {Object|null} browser.storage.sync, o null si no existe.
   */
  function getArea() {
    return typeof browser !== "undefined" &&
      browser.storage &&
      browser.storage.sync
      ? browser.storage.sync
      : null;
  }

  /**
   * Actualiza campos del estado local de sincronización.
   *
   * @param {Object} patch - Campos a cambiar.
   * @returns {Promise<Object>} Estado resultante.
   */
  async function updateState(patch) {
    const state = await YouTubeGroupsStorage.getSyncState();
    const next = { ...state, ...patch };
    await YouTubeGroupsStorage.saveSyncState(next);
    return next;
  }

  /**
   * Lee los datos locales, los valida y los serializa en el texto canónico.
   *
   * @returns {Promise<{ text: string, hash: string, data: Object }>}
   */
  async function buildLocalPayload() {
    const [groups, settings, hiddenChannels] = await Promise.all([
      YouTubeGroupsStorage.getGroups(),
      YouTubeGroupsStorage.getSettings(),
      YouTubeGroupsStorage.getHiddenChannels(),
    ]);
    const { data } = YouTubeGroupsBackup.parseSyncData({
      groups,
      settings,
      hiddenChannels,
    });
    const text = stableStringify(data);
    return { text, hash: hashText(text), data };
  }

  /**
   * @param {{ groups: Array, hiddenChannels: Object }} data - Datos validados.
   * @returns {boolean} true si no hay grupos ni canales ocultos.
   */
  function isEmptyTree(data) {
    return (
      data.groups.length === 0 && Object.keys(data.hiddenChannels).length === 0
    );
  }

  /**
   * Resume el estado para la página de opciones.
   *
   * @returns {Promise<Object>} available, state, localBytes, limitBytes y remote.
   */
  async function inspect() {
    const area = getArea();
    const state = await YouTubeGroupsStorage.getSyncState();
    const { text, hash } = await buildLocalPayload();
    const localBytes = buildReplica(text, {
      deviceId: state.deviceId || "",
      now: 0,
    }).bytes;
    let remote = {
      status: "empty",
      updatedAt: null,
      fromThisDevice: false,
      sameAsLocal: false,
    };
    if (area) {
      const replica = readReplica(await area.get(null));
      const meta = replica.meta;
      remote = {
        status: replica.status,
        updatedAt: meta ? meta.updatedAt : null,
        fromThisDevice: Boolean(meta) && meta.deviceId === state.deviceId,
        sameAsLocal: replica.status === "ok" && meta.hash === hash,
      };
    }
    return {
      available: area !== null,
      state,
      localBytes,
      limitBytes: TOTAL_BUDGET_BYTES,
      remote,
    };
  }

  /**
   * Marca la sincronización como desactivada por falta de cuota.
   */
  async function markTooBig(bytes) {
    await updateState({
      enabled: false,
      status: "too-big",
      bytes,
      dirtySince: null,
    });
    return { result: "too-big", bytes, limitBytes: TOTAL_BUDGET_BYTES };
  }

  /**
   * Escribe la réplica local en storage.sync.
   *
   * @param {{ force?: boolean, now?: Function }} [options]
   * @returns {Promise<Object>} { result: "unavailable"|"unchanged"|"too-big"|"sent"|"error" }.
   */
  async function push({ force = false, now = Date.now } = {}) {
    const area = getArea();
    if (!area) {
      return { result: "unavailable" };
    }
    const state = await YouTubeGroupsStorage.getSyncState();
    const { text, hash } = await buildLocalPayload();
    if (!force && hash === state.lastHash) {
      if (state.dirtySince !== null) {
        await updateState({ dirtySince: null });
      }
      return { result: "unchanged" };
    }
    const stamp = now();
    const deviceId = state.deviceId || crypto.randomUUID();
    const { items, bytes } = buildReplica(text, { deviceId, now: stamp });
    if (bytes > TOTAL_BUDGET_BYTES) {
      return markTooBig(bytes);
    }
    try {
      await area.set(items);
      const chunks = items[META_KEY].chunks;
      const stale = Object.keys(await area.get(null)).filter((key) => {
        const match = /^ygSync:(\d+)$/.exec(key);
        return match !== null && Number(match[1]) >= chunks;
      });
      if (stale.length > 0) {
        await area.remove(stale);
      }
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      if (/quota/i.test(message)) {
        return markTooBig(bytes);
      }
      await updateState({
        deviceId,
        status: "error",
        error: message,
        dirtySince: state.dirtySince === null ? stamp : state.dirtySince,
      });
      return { result: "error", message };
    }
    await updateState({
      deviceId,
      lastHash: hash,
      lastSentAt: stamp,
      dirtySince: null,
      status: "ok",
      bytes,
      error: "",
    });
    return { result: "sent", bytes };
  }

  /**
   * Importa la réplica de storage.sync a los datos locales.
   *
   * @param {{ now?: Function, guardEmpty?: boolean }} [options] - Con
   *   `guardEmpty`, una réplica sin grupos ni ocultos no sustituye a un árbol
   *   local con datos (devuelve "skipped-empty" sin escribir).
   * @returns {Promise<Object>} { result: "unavailable"|"empty"|"incomplete"|"invalid"|"skipped-empty"|"imported"|"error" }.
   */
  async function pull({ now = Date.now, guardEmpty = false } = {}) {
    const area = getArea();
    if (!area) {
      return { result: "unavailable" };
    }
    const replica = readReplica(await area.get(null));
    if (replica.status !== "ok") {
      return { result: replica.status };
    }
    let parsed;
    try {
      parsed = YouTubeGroupsBackup.parseSyncData(JSON.parse(replica.text));
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      await updateState({ status: "error", error: message });
      return { result: "error", message };
    }
    const { data, dropped } = parsed;
    if (guardEmpty && isEmptyTree(data)) {
      const local = await buildLocalPayload();
      if (!isEmptyTree(local.data)) {
        return { result: "skipped-empty" };
      }
    }
    // Las bajas de suscripción recientes no se reintroducen (ADR 0035): se quitan de los grupos
    // importados. El hash es el de la réplica recibida, así que la diferencia se reenvía corregida.
    const recentKeys = Object.keys(
      await YouTubeGroupsStorage.getRecentUnsubscribes({ now: now() }),
    );
    const groupsToSave =
      recentKeys.length > 0
        ? YouTubeGroups.removeChannelsEverywhere(data.groups, recentKeys).groups
        : data.groups;
    // Primero el hash: así el cambio local que provoca esta escritura no se reenvía.
    await updateState({
      lastHash: hashText(stableStringify(data)),
      lastReceivedAt: now(),
      dirtySince: null,
      status: "ok",
      error: "",
    });
    const keys = YouTubeGroupsStorage.KEYS;
    try {
      await YouTubeGroupsStorage.withLock(keys.settings, () =>
        YouTubeGroupsStorage.saveSettings(data.settings),
      );
      await YouTubeGroupsStorage.withLock(keys.groups, () =>
        YouTubeGroupsStorage.saveGroups(groupsToSave),
      );
      await YouTubeGroupsStorage.withLock(keys.hiddenChannels, () =>
        YouTubeGroupsStorage.saveHiddenChannels(data.hiddenChannels),
      );
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      // Importación a medias: lastHash ya no describe lo local.
      await updateState({ lastHash: null, status: "error", error: message });
      return { result: "error", message };
    }
    return { result: "imported", dropped };
  }

  /**
   * Activa la sincronización en este dispositivo y envía o importa.
   *
   * @param {{ direction?: "push"|"pull", now?: Function }} [options]
   * @returns {Promise<Object>} Resultado de push o pull.
   */
  async function enable({ direction = "push", now = Date.now } = {}) {
    if (!getArea()) {
      return { result: "unavailable" };
    }
    const state = await YouTubeGroupsStorage.getSyncState();
    await updateState({
      enabled: true,
      deviceId: state.deviceId || crypto.randomUUID(),
      status: "ok",
      error: "",
    });
    return direction === "pull" ? pull({ now }) : push({ force: true, now });
  }

  /**
   * Desactiva la sincronización en este dispositivo sin borrar la réplica.
   */
  async function disable() {
    await updateState({ enabled: false, status: "off", dirtySince: null });
  }

  const LOCAL_DATA_KEYS = () => {
    const keys = YouTubeGroupsStorage.KEYS;
    return [keys.groups, keys.settings, keys.hiddenChannels];
  };

  /**
   * Crea el replicador del fondo: envío con debounce, recepción, conciliación
   * y mensajes de la página de opciones. Todas sus operaciones van en una cola
   * propia para que envío e importación no se intercalen.
   *
   * @param {{ setTimer?: Function, clearTimer?: Function, now?: Function }} [options]
   * @returns {{ onStorageChanged: Function, reconcile: Function, handleMessage: Function }}
   */
  function createReplicator({
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    now = Date.now,
  } = {}) {
    let timer = null;

    const locked = (fn) =>
      YouTubeGroupsStorage.withLock("youtubeSync:engine", fn);

    const cancelTimer = () => {
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
    };

    const armTimer = () => {
      cancelTimer();
      timer = setTimer(() => {
        timer = null;
        locked(async () => {
          const state = await YouTubeGroupsStorage.getSyncState();
          if (state.enabled) {
            await push({ now });
          }
        }).catch((error) => {
          console.error("Error al sincronizar:", error);
        });
      }, DEBOUNCE_MS);
    };

    const readRemote = async (area) => readReplica(await area.get(null));

    /**
     * Si lo local difiere de lo último sincronizado y no está marcado como
     * pendiente, lo marca (un cambio hecho con el fondo parado no se pierde
     * por una importación). Un árbol vacío recién activado sin réplica no
     * cuenta como cambio.
     */
    async function markPendingIfChanged(state) {
      if (state.dirtySince !== null) {
        return state;
      }
      const { hash, data } = await buildLocalPayload();
      if (
        hash === state.lastHash ||
        (state.lastHash === null && isEmptyTree(data))
      ) {
        return state;
      }
      return updateState({ dirtySince: now() });
    }

    /**
     * Importa de forma automática; una réplica vacía no pisa datos locales:
     * se marcan como pendientes y se envían.
     */
    async function autoPull() {
      const outcome = await pull({ now, guardEmpty: true });
      if (outcome.result === "skipped-empty") {
        await updateState({ dirtySince: now() });
        await push({ force: true, now });
      }
    }

    async function handleLocalChange() {
      const state = await YouTubeGroupsStorage.getSyncState();
      if (!state.enabled) {
        return;
      }
      const { hash } = await buildLocalPayload();
      if (hash === state.lastHash) {
        return;
      }
      if (state.dirtySince === null) {
        await updateState({ dirtySince: now() });
      }
      armTimer();
    }

    async function handleRemoteChange() {
      const area = getArea();
      let state = await YouTubeGroupsStorage.getSyncState();
      if (!area || !state.enabled) {
        return;
      }
      const replica = await readRemote(area);
      if (replica.status === "ok") {
        state = await markPendingIfChanged(state);
      }
      const action = decideIncoming({ replica, state });
      if (action === "push") {
        cancelTimer();
        await push({ now });
      } else if (action === "pull") {
        cancelTimer();
        await autoPull();
      }
    }

    function onStorageChanged(changes, areaName) {
      if (!changes) {
        return Promise.resolve();
      }
      let task = null;
      if (areaName === "local") {
        const watched = LOCAL_DATA_KEYS();
        if (Object.keys(changes).some((key) => watched.includes(key))) {
          task = handleLocalChange;
        }
      } else if (areaName === "sync") {
        if (Object.keys(changes).some((key) => key.startsWith(CHUNK_PREFIX))) {
          task = handleRemoteChange;
        }
      }
      if (!task) {
        return Promise.resolve();
      }
      return locked(task).catch((error) => {
        console.error("Error al sincronizar:", error);
      });
    }

    function reconcile() {
      return locked(async () => {
        const area = getArea();
        let state = await YouTubeGroupsStorage.getSyncState();
        if (!area || !state.enabled) {
          return;
        }
        const replica = await readRemote(area);
        if (replica.status === "empty" || replica.status === "invalid") {
          const { data } = await buildLocalPayload();
          if (!(state.lastHash === null && isEmptyTree(data))) {
            await push({ force: true, now });
          }
          return;
        }
        if (replica.status !== "ok") {
          return;
        }
        state = await markPendingIfChanged(state);
        const action = decideIncoming({ replica, state });
        if (action === "push") {
          await push({ now });
        } else if (action === "pull") {
          await autoPull();
        } else {
          const { hash } = await buildLocalPayload();
          if (hash !== state.lastHash) {
            await push({ now });
          }
        }
      });
    }

    function toEnableResponse(outcome) {
      switch (outcome.result) {
        case "sent":
        case "imported":
        case "unchanged":
          return { result: "enabled" };
        case "too-big":
          return {
            result: "too-big",
            bytes: outcome.bytes,
            limitBytes: outcome.limitBytes,
          };
        case "unavailable":
          return { result: "unavailable" };
        case "error":
          return { result: "error", message: outcome.message };
        default:
          return {
            result: "error",
            message: `No se pudo importar la réplica (${outcome.result})`,
          };
      }
    }

    async function enableFromMessage(direction) {
      const area = getArea();
      if (!area) {
        return { result: "unavailable" };
      }
      if (direction === "push" || direction === "pull") {
        const outcome = await enable({ direction, now });
        const response = toEnableResponse(outcome);
        if (response.result === "error" && direction === "pull") {
          await disable();
        }
        return response;
      }
      const state = await YouTubeGroupsStorage.getSyncState();
      const deviceId = state.deviceId || crypto.randomUUID();
      if (!state.deviceId) {
        await updateState({ deviceId });
      }
      const replica = await readRemote(area);
      if (replica.status === "ok" && replica.meta.deviceId !== deviceId) {
        const { hash } = await buildLocalPayload();
        if (replica.meta.hash !== hash) {
          return { result: "choose", remoteUpdatedAt: replica.meta.updatedAt };
        }
        await updateState({
          enabled: true,
          lastHash: hash,
          dirtySince: null,
          status: "ok",
          error: "",
        });
        return { result: "enabled" };
      }
      if (replica.status === "empty" || replica.status === "invalid") {
        const { data } = await buildLocalPayload();
        if (isEmptyTree(data)) {
          // Nada que enviar: se activa y se espera a la réplica o a un cambio local.
          await updateState({
            enabled: true,
            deviceId,
            lastHash: null,
            dirtySince: null,
            status: "ok",
            error: "",
          });
          return { result: "enabled" };
        }
      }
      return toEnableResponse(await enable({ direction: "push", now }));
    }

    function handleMessage(message) {
      if (
        !message ||
        message.type !== "youtube-groups:sync" ||
        typeof message.action !== "string"
      ) {
        return undefined;
      }
      switch (message.action) {
        case "status":
          return locked(() => inspect());
        case "enable":
          return locked(() => enableFromMessage(message.direction)).catch(
            (error) => ({
              result: "error",
              message: error && error.message ? error.message : String(error),
            }),
          );
        case "disable":
          return locked(async () => {
            cancelTimer();
            await disable();
            return { result: "disabled" };
          });
        default:
          return undefined;
      }
    }

    return { onStorageChanged, reconcile, handleMessage };
  }

  return {
    createReplicator,
    buildLocalPayload,
    inspect,
    push,
    pull,
    enable,
    disable,
    FORMAT,
    VERSION,
    META_KEY,
    CHUNK_PREFIX,
    ITEM_BUDGET_BYTES,
    TOTAL_BUDGET_BYTES,
    DEBOUNCE_MS,
    stableStringify,
    hashText,
    measureItem,
    chunkText,
    buildReplica,
    readReplica,
    decideIncoming,
  };
})();
