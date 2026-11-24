// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

const YouTubeGroupsStorage = (() => {
  /** Nombres reales de las claves de almacenamiento (ADR 0005). */
  const KEYS = Object.freeze({
    groups: "youtubeGroups",
    watched: "youtubeWatched",
    settings: "youtubeSettings",
    playlists: "youtubePlaylists",
    avatars: "youtubeAvatars",
    subscriptions: "youtubeSubscriptions",
    newVideos: "youtubeNewVideos",
    hiddenChannels: "youtubeHiddenChannels",
    channelActivity: "youtubeChannelActivity",
    pendingUnsubscribes: "youtubePendingUnsubscribes",
    recentUnsubscribes: "youtubeRecentUnsubscribes",
    sync: "youtubeSync",
    backgroundRefresh: "youtubeBackgroundRefresh",
  });
  const STORAGE_KEY = KEYS.groups;
  const WATCHED_KEY = KEYS.watched;
  const SETTINGS_KEY = KEYS.settings;
  const PLAYLISTS_KEY = KEYS.playlists;
  const AVATARS_KEY = KEYS.avatars;
  const SUBSCRIPTIONS_KEY = KEYS.subscriptions;
  const NEW_VIDEOS_KEY = KEYS.newVideos;
  const HIDDEN_CHANNELS_KEY = KEYS.hiddenChannels;
  const CHANNEL_ACTIVITY_KEY = KEYS.channelActivity;
  const PENDING_UNSUBSCRIBES_KEY = KEYS.pendingUnsubscribes;
  const RECENT_UNSUBSCRIBES_KEY = KEYS.recentUnsubscribes;
  /** Caducidad de las bajas recientes (30 días, ADR 0035). */
  const RECENT_UNSUBSCRIBES_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
  const SYNC_KEY = KEYS.sync;
  const SYNC_STATUSES = ["off", "ok", "too-big", "error"];
  const BACKGROUND_REFRESH_KEY = KEYS.backgroundRefresh;
  const REFRESH_RESULTS = ["ok", "no-session", "account-mismatch", "error"];
  const REFRESH_ERRORS = ["network", "http", "unrecognized", "unsupported"];
  let groupsInitializationPromise = null;
  const lockQueues = new Map();

  /**
   * Ejecuta `fn` cuando han terminado todas las llamadas anteriores con la misma clave (cola FIFO, ADR 0005).
   * Un error de `fn` rechaza la promesa devuelta y no bloquea la cola. No es reentrante.
   * @param {string} key Clave de la cola (normalmente un valor de KEYS).
   * @param {Function} fn Función síncrona o asíncrona.
   * @returns {Promise<*>} Resultado de `fn`.
   */
  function withLock(key, fn) {
    const previous = lockQueues.get(key) || Promise.resolve();
    const run = previous.then(() => fn());
    const tail = run.then(
      () => undefined,
      () => undefined,
    );

    lockQueues.set(key, tail);
    tail.then(() => {
      if (lockQueues.get(key) === tail) {
        lockQueues.delete(key);
      }
    });

    return run;
  }

  /**
   * Extrae los grupos de un valor guardado (o de un `newValue` de onChanged).
   * @param {*} data Valor guardado bajo la clave de grupos.
   * @returns {Array} Grupos, o [] si el formato no es válido.
   */
  function readGroupsValue(data) {
    return data && Array.isArray(data.groups) ? data.groups : [];
  }

  /**
   * Extrae el mapa de vídeos vistos de un valor guardado.
   * @param {*} data Valor guardado bajo la clave de vistos.
   * @returns {Object} Mapa de vídeos, o {} si el formato no es válido.
   */
  function readWatchedValue(data) {
    return data && isPlainObject(data.videos) ? data.videos : {};
  }

  /**
   * Extrae los ajustes de un valor guardado.
   * @param {*} data Valor guardado bajo la clave de ajustes.
   * @returns {Object} Ajustes, o {} si el formato no es válido.
   */
  function readSettingsValue(data) {
    return data && isPlainObject(data.settings) ? data.settings : {};
  }

  /**
   * Extrae las listas de un valor guardado.
   * @param {*} data Valor guardado bajo la clave de listas.
   * @returns {Array} Listas, o [] si el formato no es válido.
   */
  function readPlaylistsValue(data) {
    return data && Array.isArray(data.playlists) ? data.playlists : [];
  }

  /**
   * Extrae el mapa de avatares de un valor guardado (ADR 0016).
   * @param {*} data Valor guardado bajo la clave de avatares.
   * @returns {Object} Mapa clave de canal -> URL de imagen, o {} si el formato no es válido.
   */
  function readAvatarsValue(data) {
    return data && isPlainObject(data.avatars) ? data.avatars : {};
  }

  /**
   * Extrae el mapa de canales ocultos de un valor guardado (ADR 0021).
   * @param {*} data Valor guardado bajo la clave de canales ocultos.
   * @returns {Object} Mapa clave de canal -> { name, url, hiddenAt }, o {} si el formato no es válido.
   */
  function readHiddenChannelsValue(data) {
    return data && isPlainObject(data.channels) ? data.channels : {};
  }

  /**
   * Extrae la actividad observada de los canales de un valor guardado (ADR 0023).
   * @param {*} data Valor guardado bajo la clave de actividad de canales.
   * @returns {{lastFeedAt: (number|null), channels: Object}} Actividad; vacía si el formato no es válido.
   */
  function readChannelActivityValue(data) {
    const valid = isPlainObject(data);

    return {
      lastFeedAt:
        valid && Number.isFinite(data.lastFeedAt) ? data.lastFeedAt : null,
      channels: valid && isPlainObject(data.channels) ? data.channels : {},
    };
  }

  /**
   * Extrae las bajas aplazadas de un valor guardado (ADR 0035).
   * @param {*} data Valor guardado bajo la clave de bajas pendientes.
   * @returns {{keys: string[], since: (number|null)}} Bajas aplazadas; vacías si el formato no es válido.
   */
  function readPendingUnsubscribesValue(data) {
    const valid = isPlainObject(data);

    return {
      keys:
        valid && Array.isArray(data.keys)
          ? data.keys.filter((key) => typeof key === "string")
          : [],
      since: valid && Number.isFinite(data.since) ? data.since : null,
    };
  }

  /**
   * Extrae las bajas recientes de un valor guardado (ADR 0035).
   * @param {*} data Valor guardado bajo la clave de bajas recientes.
   * @returns {Object} Mapa clave de canal -> marca de tiempo de la baja; {} si el formato no es válido.
   */
  function readRecentUnsubscribesValue(data) {
    const result = {};

    if (isPlainObject(data) && isPlainObject(data.keys)) {
      for (const [key, at] of Object.entries(data.keys)) {
        if (Number.isFinite(at)) {
          result[key] = at;
        }
      }
    }

    return result;
  }

  /**
   * Extrae el mapa de suscripciones conocidas de un valor guardado (ADR 0018).
   * @param {*} data Valor guardado bajo la clave de suscripciones.
   * @returns {Object} Mapa clave de canal -> entrada, o {} si el formato no es válido.
   */
  function readSubscriptionsValue(data) {
    return data && isPlainObject(data.channels) ? data.channels : {};
  }

  /**
   * Extrae el estado de vídeos nuevos de un valor guardado (ADR 0019).
   * @param {*} data Valor guardado bajo la clave de vídeos nuevos.
   * @returns {{since: (number|null), videos: Object, visits: Object}} Estado; vacío si el formato no es válido.
   */
  function readNewVideosValue(data) {
    const valid = isPlainObject(data);

    return {
      since: valid && typeof data.since === "number" ? data.since : null,
      videos: valid && isPlainObject(data.videos) ? data.videos : {},
      visits: valid && isPlainObject(data.visits) ? data.visits : {},
    };
  }

  /**
   * Extrae el estado de sincronización de este dispositivo de un valor guardado (ADR 0028).
   * Cada campo con tipo incorrecto toma su valor por defecto.
   * @param {*} data Valor guardado bajo la clave de sincronización.
   * @returns {{enabled: boolean, deviceId: (string|null), lastHash: (string|null), lastSentAt: (number|null),
   *   lastReceivedAt: (number|null), dirtySince: (number|null), status: string, bytes: (number|null),
   *   error: string}} Estado completo; el de por defecto si el formato no es válido.
   */
  function readSyncValue(data) {
    const valid = isPlainObject(data);
    const text = (value) =>
      typeof value === "string" && value !== "" ? value : null;
    const number = (value) => (Number.isFinite(value) ? value : null);

    return {
      enabled: valid && data.enabled === true,
      deviceId: valid ? text(data.deviceId) : null,
      lastHash: valid ? text(data.lastHash) : null,
      lastSentAt: valid ? number(data.lastSentAt) : null,
      lastReceivedAt: valid ? number(data.lastReceivedAt) : null,
      dirtySince: valid ? number(data.dirtySince) : null,
      status:
        valid && SYNC_STATUSES.includes(data.status) ? data.status : "off",
      bytes: valid ? number(data.bytes) : null,
      error: valid && typeof data.error === "string" ? data.error : "",
    };
  }

  /**
   * Extrae el estado de la actualización en segundo plano de un valor guardado (ADR 0042).
   * Cada campo con tipo incorrecto toma su valor por defecto.
   * @param {*} data Valor guardado bajo la clave de la actualización en segundo plano.
   * @returns {{version: number, lease: ({owner: string, until: number}|null), lastAttemptAt: (number|null),
   *   lastSuccessAt: (number|null), lastResult: (string|null), lastError: (string|null),
   *   accountHash: (string|null)}} Estado completo; el de por defecto si el formato no es válido. Un `lastStats`
   *   guardado por versiones anteriores se ignora.
   */
  function readBackgroundRefreshValue(data) {
    const valid = isPlainObject(data);
    const number = (value) => (Number.isFinite(value) ? value : null);
    const lease =
      valid &&
      isPlainObject(data.lease) &&
      typeof data.lease.owner === "string" &&
      data.lease.owner !== "" &&
      Number.isFinite(data.lease.until)
        ? { owner: data.lease.owner, until: data.lease.until }
        : null;

    return {
      version: 1,
      lease,
      lastAttemptAt: valid ? number(data.lastAttemptAt) : null,
      lastSuccessAt: valid ? number(data.lastSuccessAt) : null,
      lastResult:
        valid && REFRESH_RESULTS.includes(data.lastResult)
          ? data.lastResult
          : null,
      lastError:
        valid && REFRESH_ERRORS.includes(data.lastError)
          ? data.lastError
          : null,
      accountHash:
        valid && typeof data.accountHash === "string" && data.accountHash !== ""
          ? data.accountHash
          : null,
    };
  }

  /**
   * Nombres lógicos de KEYS cuya clave real aparece en un evento storage.onChanged.
   * @param {Object} changes Objeto `changes` del evento.
   * @param {string} areaName Área del evento.
   * @returns {string[]} Nombres lógicos, en el orden de KEYS; [] si el área no es "local".
   */
  function getChangedKeys(changes, areaName) {
    if (areaName !== "local" || !changes) {
      return [];
    }

    return Object.keys(KEYS).filter((name) =>
      Object.prototype.hasOwnProperty.call(changes, KEYS[name]),
    );
  }

  async function getGroups() {
    const stored = await browser.storage.local.get(STORAGE_KEY);
    const data = stored[STORAGE_KEY];

    if (!data || !Array.isArray(data.groups)) {
      if (!groupsInitializationPromise) {
        const emptyGroups = [];
        groupsInitializationPromise = saveGroups(emptyGroups)
          .then(() => emptyGroups)
          .finally(() => {
            groupsInitializationPromise = null;
          });
      }

      return groupsInitializationPromise;
    }

    return readGroupsValue(data);
  }

  async function saveGroups(groups) {
    if (!Array.isArray(groups)) {
      throw new TypeError("Los grupos deben ser un array.");
    }

    await browser.storage.local.set({
      [STORAGE_KEY]: {
        version: 1,
        groups,
      },
    });
  }

  /**
   * Lee el mapa de vídeos vistos (ADR 0002). Sin datos válidos devuelve {} y no escribe.
   * @returns {Promise<Object>} Mapa ID de vídeo -> entrada.
   */
  async function getWatchedVideos() {
    const stored = await browser.storage.local.get(WATCHED_KEY);
    const data = stored[WATCHED_KEY];

    return readWatchedValue(data);
  }

  /**
   * Guarda el mapa de vídeos vistos con el formato versión 1 (ADR 0002).
   * @param {Object} videos Mapa ID de vídeo -> entrada.
   */
  async function saveWatchedVideos(videos) {
    if (!isPlainObject(videos)) {
      throw new TypeError("Los vídeos vistos deben ser un objeto.");
    }

    await browser.storage.local.set({
      [WATCHED_KEY]: {
        version: 1,
        videos,
      },
    });
  }

  /**
   * Lee los ajustes guardados (ADR 0003). Sin datos válidos devuelve {} y no escribe.
   * @returns {Promise<Object>} Objeto de ajustes tal como se guardó.
   */
  async function getSettings() {
    const stored = await browser.storage.local.get(SETTINGS_KEY);
    const data = stored[SETTINGS_KEY];

    return readSettingsValue(data);
  }

  /**
   * Guarda los ajustes con el formato versión 1 (ADR 0003).
   * @param {Object} settings Objeto de ajustes.
   */
  async function saveSettings(settings) {
    if (!isPlainObject(settings)) {
      throw new TypeError("Los ajustes deben ser un objeto.");
    }

    await browser.storage.local.set({
      [SETTINGS_KEY]: {
        version: 1,
        settings,
      },
    });
  }

  /**
   * Lee las listas de vídeos (ADR 0004). Sin datos válidos devuelve [] y no escribe.
   * @returns {Promise<Array>} Listas tal como se guardaron.
   */
  async function getPlaylists() {
    const stored = await browser.storage.local.get(PLAYLISTS_KEY);
    const data = stored[PLAYLISTS_KEY];

    return readPlaylistsValue(data);
  }

  /**
   * Guarda las listas de vídeos con el formato versión 1 (ADR 0004).
   * @param {Array} playlists Listas con sus vídeos.
   */
  async function savePlaylists(playlists) {
    if (!Array.isArray(playlists)) {
      throw new TypeError("Las listas deben ser un array.");
    }

    await browser.storage.local.set({
      [PLAYLISTS_KEY]: {
        version: 1,
        playlists,
      },
    });
  }

  /**
   * Lee los avatares de canal (ADR 0016). Sin datos válidos devuelve {} y no escribe.
   * @returns {Promise<Object>} Mapa clave de canal -> URL de imagen.
   */
  async function getAvatars() {
    const stored = await browser.storage.local.get(AVATARS_KEY);

    return readAvatarsValue(stored[AVATARS_KEY]);
  }

  /**
   * Guarda los avatares de canal con el formato versión 1 (ADR 0016).
   * @param {Object} avatars Mapa clave de canal -> URL de imagen.
   */
  async function saveAvatars(avatars) {
    if (!isPlainObject(avatars)) {
      throw new TypeError("Los avatares deben ser un objeto.");
    }

    await browser.storage.local.set({
      [AVATARS_KEY]: {
        version: 1,
        avatars,
      },
    });
  }

  /**
   * Lee las suscripciones conocidas (ADR 0018). Sin datos válidos devuelve {} y no escribe.
   * @returns {Promise<Object>} Mapa clave de canal -> { name, url, firstSeen, description? }.
   */
  async function getSubscriptions() {
    const stored = await browser.storage.local.get(SUBSCRIPTIONS_KEY);

    return readSubscriptionsValue(stored[SUBSCRIPTIONS_KEY]);
  }

  /**
   * Guarda las suscripciones conocidas con el formato versión 1 (ADR 0018).
   * @param {Object} channels Mapa clave de canal -> { name, url, firstSeen, description? }.
   */
  async function saveSubscriptions(channels) {
    if (!isPlainObject(channels)) {
      throw new TypeError("Las suscripciones deben ser un objeto.");
    }

    await browser.storage.local.set({
      [SUBSCRIPTIONS_KEY]: {
        version: 1,
        channels,
      },
    });
  }

  /**
   * Lee las bajas aplazadas (ADR 0035). Sin datos válidos devuelve el valor vacío y no escribe.
   * @returns {Promise<{keys: string[], since: (number|null)}>} Bajas aplazadas.
   */
  async function getPendingUnsubscribes() {
    const stored = await browser.storage.local.get(PENDING_UNSUBSCRIBES_KEY);

    return readPendingUnsubscribesValue(stored[PENDING_UNSUBSCRIBES_KEY]);
  }

  /**
   * Guarda las bajas aplazadas con el formato versión 1 (ADR 0035). Con `keys` vacío borra la clave.
   * @param {string[]} keys Claves de canal aplazadas.
   * @param {number} since Marca de tiempo de la primera lectura que las aplazó.
   */
  async function savePendingUnsubscribes(keys, since) {
    if (!Array.isArray(keys)) {
      throw new TypeError("Las bajas pendientes deben ser un array.");
    }

    if (keys.length === 0) {
      await browser.storage.local.remove(PENDING_UNSUBSCRIBES_KEY);
      return;
    }

    await browser.storage.local.set({
      [PENDING_UNSUBSCRIBES_KEY]: { version: 1, keys, since },
    });
  }

  /**
   * Lee las bajas recientes vigentes (ADR 0035): las de más de 30 días se ignoran.
   * @param {{ now?: number }} [options]
   * @returns {Promise<Object>} Mapa clave de canal -> marca de tiempo de la baja.
   */
  async function getRecentUnsubscribes({ now = Date.now() } = {}) {
    const stored = await browser.storage.local.get(RECENT_UNSUBSCRIBES_KEY);
    const all = readRecentUnsubscribesValue(stored[RECENT_UNSUBSCRIBES_KEY]);

    return Object.fromEntries(
      Object.entries(all).filter(
        ([, at]) => now - at <= RECENT_UNSUBSCRIBES_MAX_AGE_MS,
      ),
    );
  }

  /**
   * Guarda las bajas recientes con el formato versión 1 (ADR 0035). Con el mapa vacío borra la clave.
   * @param {Object} keys Mapa clave de canal -> marca de tiempo de la baja.
   */
  async function saveRecentUnsubscribes(keys) {
    if (!isPlainObject(keys)) {
      throw new TypeError("Las bajas recientes deben ser un objeto.");
    }

    if (Object.keys(keys).length === 0) {
      await browser.storage.local.remove(RECENT_UNSUBSCRIBES_KEY);
      return;
    }

    await browser.storage.local.set({
      [RECENT_UNSUBSCRIBES_KEY]: { version: 1, keys },
    });
  }

  /**
   * Lee el estado de vídeos nuevos (ADR 0019). Sin datos válidos devuelve el estado vacío y no escribe.
   * @returns {Promise<{since: (number|null), videos: Object, visits: Object}>} Estado.
   */
  async function getNewVideos() {
    const stored = await browser.storage.local.get(NEW_VIDEOS_KEY);

    return readNewVideosValue(stored[NEW_VIDEOS_KEY]);
  }

  /**
   * Guarda el estado de vídeos nuevos con el formato versión 1 (ADR 0019).
   * @param {{since: (number|null), videos: Object, visits: Object}} state Estado.
   */
  async function saveNewVideos(state) {
    if (!isPlainObject(state)) {
      throw new TypeError("El estado de vídeos nuevos debe ser un objeto.");
    }

    const { since, videos, visits } = readNewVideosValue(state);

    await browser.storage.local.set({
      [NEW_VIDEOS_KEY]: {
        version: 1,
        since,
        videos,
        visits,
      },
    });
  }

  /**
   * Lee los canales ocultos (ADR 0021). Sin datos válidos devuelve {} y no escribe.
   * @returns {Promise<Object>} Mapa clave de canal -> { name, url, hiddenAt }.
   */
  async function getHiddenChannels() {
    const stored = await browser.storage.local.get(HIDDEN_CHANNELS_KEY);

    return readHiddenChannelsValue(stored[HIDDEN_CHANNELS_KEY]);
  }

  /**
   * Guarda los canales ocultos con el formato versión 1 (ADR 0021).
   * @param {Object} channels Mapa clave de canal -> { name, url, hiddenAt }.
   */
  async function saveHiddenChannels(channels) {
    if (!isPlainObject(channels)) {
      throw new TypeError("Los canales ocultos deben ser un objeto.");
    }

    await browser.storage.local.set({
      [HIDDEN_CHANNELS_KEY]: {
        version: 1,
        channels,
      },
    });
  }

  /**
   * Lee la actividad observada de los canales (ADR 0023). Sin datos válidos devuelve el valor vacío y no escribe.
   * @returns {Promise<{lastFeedAt: (number|null), channels: Object}>} Actividad.
   */
  async function getChannelActivity() {
    const stored = await browser.storage.local.get(CHANNEL_ACTIVITY_KEY);

    return readChannelActivityValue(stored[CHANNEL_ACTIVITY_KEY]);
  }

  /**
   * Guarda la actividad observada con el formato versión 1 (ADR 0023).
   * @param {{lastFeedAt: (number|null), channels: Object}} state Actividad a guardar.
   */
  async function saveChannelActivity(state) {
    if (!isPlainObject(state)) {
      throw new TypeError("La actividad de canales debe ser un objeto.");
    }

    const { lastFeedAt, channels } = readChannelActivityValue(state);

    await browser.storage.local.set({
      [CHANNEL_ACTIVITY_KEY]: {
        version: 1,
        lastFeedAt,
        channels,
      },
    });
  }

  /**
   * Lee el estado de sincronización de este dispositivo (ADR 0028). Sin datos válidos devuelve el de
   * por defecto y no escribe.
   * @returns {Promise<Object>} Estado completo (ver readSyncValue).
   */
  async function getSyncState() {
    const stored = await browser.storage.local.get(SYNC_KEY);

    return readSyncValue(stored[SYNC_KEY]);
  }

  /**
   * Guarda el estado de sincronización con el formato versión 1, normalizado (ADR 0028).
   * @param {Object} state Estado (los campos ausentes o no válidos toman su valor por defecto).
   */
  async function saveSyncState(state) {
    await browser.storage.local.set({
      [SYNC_KEY]: {
        version: 1,
        ...readSyncValue(state),
      },
    });
  }

  /**
   * Lee el estado de la actualización en segundo plano (ADR 0042). Sin datos válidos devuelve el de
   * por defecto y no escribe.
   * @returns {Promise<Object>} Estado completo (ver readBackgroundRefreshValue).
   */
  async function getBackgroundRefresh() {
    const stored = await browser.storage.local.get(BACKGROUND_REFRESH_KEY);

    return readBackgroundRefreshValue(stored[BACKGROUND_REFRESH_KEY]);
  }

  /**
   * Guarda el estado de la actualización en segundo plano con el formato versión 1, normalizado.
   * @param {Object} state Estado (los campos ausentes o no válidos toman su valor por defecto).
   */
  async function saveBackgroundRefresh(state) {
    await browser.storage.local.set({
      [BACKGROUND_REFRESH_KEY]: readBackgroundRefreshValue(state),
    });
  }

  function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  return {
    KEYS,
    withLock,
    readGroupsValue,
    readWatchedValue,
    readSettingsValue,
    readPlaylistsValue,
    readAvatarsValue,
    readSubscriptionsValue,
    readPendingUnsubscribesValue,
    readRecentUnsubscribesValue,
    readNewVideosValue,
    readHiddenChannelsValue,
    readChannelActivityValue,
    readSyncValue,
    readBackgroundRefreshValue,
    getChangedKeys,
    getGroups,
    saveGroups,
    getWatchedVideos,
    saveWatchedVideos,
    getSettings,
    saveSettings,
    getPlaylists,
    savePlaylists,
    getAvatars,
    saveAvatars,
    getSubscriptions,
    saveSubscriptions,
    getPendingUnsubscribes,
    savePendingUnsubscribes,
    getRecentUnsubscribes,
    saveRecentUnsubscribes,
    getNewVideos,
    saveNewVideos,
    getHiddenChannels,
    saveHiddenChannels,
    getChannelActivity,
    saveChannelActivity,
    getSyncState,
    saveSyncState,
    getBackgroundRefresh,
    saveBackgroundRefresh,
  };
})();
