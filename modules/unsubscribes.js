// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

/**
 * Lógica pura de las bajas de suscripción (ADR 0035). Sin DOM.
 * Se carga tras channel-activity.js.
 */
const YouTubeGroupsUnsubscribes = (() => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const MASS_MIN = 10;
  const MASS_RATIO = 0.25;
  const PENDING_MAX_AGE_MS = 30 * DAY_MS;

  /**
   * @param {*} value - Valor a comprobar.
   * @returns {boolean} true si es un objeto plano (no null, no array).
   */
  function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  /**
   * Normaliza un nombre para compararlo: recortado, espacios colapsados y minúsculas.
   * @param {*} name - Nombre de canal.
   * @returns {string} Nombre normalizado, o "" si no es una cadena.
   */
  function normalizeName(name) {
    return typeof name === "string"
      ? name.replace(/\s+/g, " ").trim().toLowerCase()
      : "";
  }

  /**
   * Claves de un conjunto de canales vistos (Map, Set, array u objeto).
   * @param {*} seen - Canales vistos.
   * @returns {Set<string>} Claves.
   */
  function toKeySet(seen) {
    const tag = Object.prototype.toString.call(seen);
    if (tag === "[object Map]" || tag === "[object Set]") {
      return new Set(seen.keys());
    }
    if (Array.isArray(seen)) {
      return new Set(seen);
    }
    return new Set(isPlainObject(seen) ? Object.keys(seen) : []);
  }

  /**
   * Claves guardadas como suscripción que no aparecen en la lectura.
   * @param {Object} stored - Mapa guardado de suscripciones (clave -> entrada).
   * @param {*} seen - Canales vistos en la lectura completa (Map, Set o array de claves).
   * @returns {string[]} Claves dadas de baja, en el orden guardado.
   */
  function findGoneKeys(stored, seen) {
    const visible = toKeySet(seen);
    return Object.keys(isPlainObject(stored) ? stored : {}).filter(
      (key) => !visible.has(key),
    );
  }

  /**
   * Separa las bajas que en realidad son un canal renombrado (mismo nombre con otra clave).
   * @param {string[]} gone - Claves dadas de baja.
   * @param {Object} stored - Mapa guardado de suscripciones.
   * @param {Iterable<string>} seenNames - Nombres de los canales vistos en la lectura.
   * @returns {{ gone: string[], renamed: string[] }} Bajas reales y renombrados.
   */
  function splitRenamed(gone, stored, seenNames) {
    const names = new Set();
    for (const name of seenNames || []) {
      const normalized = normalizeName(name);
      if (normalized) {
        names.add(normalized);
      }
    }
    const source = isPlainObject(stored) ? stored : {};
    const result = { gone: [], renamed: [] };
    for (const key of gone) {
      const entry = source[key];
      const name = normalizeName(entry && entry.name);
      (name && names.has(name) ? result.renamed : result.gone).push(key);
    }
    return result;
  }

  /**
   * Normaliza las bajas aplazadas guardadas; las mal formadas o de más de 30 días se ignoran.
   * @param {*} value - Valor leído ({ keys, since }).
   * @param {number} now - Marca de tiempo actual.
   * @returns {{ keys: string[], since: number|null }} Pendiente vigente, o vacío.
   */
  function normalizePending(value, now) {
    const empty = { keys: [], since: null };
    if (
      !isPlainObject(value) ||
      !Array.isArray(value.keys) ||
      !Number.isFinite(value.since) ||
      now - value.since > PENDING_MAX_AGE_MS
    ) {
      return empty;
    }
    const keys = [
      ...new Set(value.keys.filter((key) => typeof key === "string" && key)),
    ];
    return keys.length > 0 ? { keys, since: value.since } : empty;
  }

  /**
   * Decide qué bajas se aplican y cuáles se aplazan (salvaguarda de baja masiva).
   * @param {Object} params
   * @param {number} params.knownCount - Suscripciones conocidas antes de la lectura.
   * @param {string[]} params.gone - Bajas detectadas (sin renombrados).
   * @param {*} params.pending - Bajas aplazadas guardadas.
   * @param {number} params.now - Marca de tiempo actual.
   * @returns {{ apply: string[], defer: string[] }} Bajas a aplicar y a aplazar.
   */
  function planUnsubscribes({ knownCount, gone, pending, now }) {
    const confirmed = new Set(normalizePending(pending, now).keys);
    const apply = gone.filter((key) => confirmed.has(key));
    const rest = gone.filter((key) => !confirmed.has(key));
    const massive =
      rest.length > MASS_MIN && rest.length > MASS_RATIO * knownCount;
    if (massive) {
      return { apply, defer: rest };
    }
    return { apply: [...apply, ...rest], defer: [] };
  }

  /**
   * Claves de `wanted` que están en algún grupo o subgrupo.
   * @param {Array} groups - Grupos guardados.
   * @param {Set<string>} wanted - Claves de canal buscadas.
   * @returns {string[]} Claves encontradas.
   */
  function findGroupedKeys(groups, wanted) {
    const found = new Set();
    const visit = (list) => {
      for (const group of list) {
        for (const channel of Array.isArray(group.channels)
          ? group.channels
          : []) {
          const key = YouTubeGroups.getChannelKey(channel.url);
          if (wanted.has(key)) {
            found.add(key);
          }
        }
        visit(Array.isArray(group.subgroups) ? group.subgroups : []);
      }
    };
    visit(Array.isArray(groups) ? groups : []);
    return [...found];
  }

  /**
   * Aplica una lectura completa de /feed/channels: quita las bajas de grupos, actividad, vídeos
   * nuevos, avatares y suscripciones (en ese orden, cada clave una vez bajo su bloqueo). Si una
   * escritura falla se relanza el error y las suscripciones no se tocan, así que la siguiente
   * lectura completa lo reintenta. No toca los canales ocultos.
   * @param {Map<string, string>} seen - Canales vistos (clave -> nombre).
   * @param {{ now?: number }} [options]
   * @returns {Promise<{ removed: string[], deferred: string[], renamed: string[] }>} Resultado.
   */
  async function applyUnsubscribes(seen, { now = Date.now() } = {}) {
    const storage = YouTubeGroupsStorage;
    const [stored, rawPending] = await Promise.all([
      storage.getSubscriptions(),
      storage.getPendingUnsubscribes(),
    ]);
    const pending = normalizePending(rawPending, now);
    const split = splitRenamed(
      findGoneKeys(stored, seen),
      stored,
      seen.values(),
    );
    const { apply, defer } = planUnsubscribes({
      knownCount: Object.keys(stored).length,
      gone: split.gone,
      pending,
      now,
    });

    if (defer.length > 0) {
      console.warn(
        `Bajas de suscripción aplazadas (${defer.length}): se aplicarán si la siguiente lectura completa las confirma.`,
      );
    }

    // Bajas recientes (antes de tocar los grupos): lo que sale de los grupos se anota para que la
    // sincronización no lo reintroduzca, y lo que vuelve a verse en la lista sale de la anotación.
    const leaving =
      apply.length > 0
        ? findGroupedKeys(await storage.getGroups(), new Set(apply))
        : [];
    await storage.withLock(storage.KEYS.recentUnsubscribes, async () => {
      const recent = await storage.getRecentUnsubscribes({ now });
      const next = {};
      for (const [key, at] of Object.entries(recent)) {
        if (!seen.has(key)) {
          next[key] = at;
        }
      }
      for (const key of leaving) {
        next[key] = now;
      }
      const same =
        Object.keys(recent).length === Object.keys(next).length &&
        Object.entries(next).every(([key, at]) => recent[key] === at);
      if (!same) {
        await storage.saveRecentUnsubscribes(next);
      }
    });

    if (apply.length > 0) {
      await storage.withLock(storage.KEYS.groups, async () => {
        const groups = await storage.getGroups();
        const result = YouTubeGroups.removeChannelsEverywhere(groups, apply);
        if (result.removedEntries > 0) {
          await storage.saveGroups(result.groups);
        }
      });
      await storage.withLock(storage.KEYS.channelActivity, async () => {
        const result = YouTubeGroupsChannelActivity.forgetChannels(
          await storage.getChannelActivity(),
          apply,
        );
        if (result.changed) {
          await storage.saveChannelActivity(result.state);
        }
      });
      await storage.withLock(storage.KEYS.newVideos, async () => {
        const result = YouTubeGroupsNewVideos.forgetChannels(
          await storage.getNewVideos(),
          apply,
        );
        if (result.changed) {
          await storage.saveNewVideos(result.state);
        }
      });
      await storage.withLock(storage.KEYS.avatars, async () => {
        const result = YouTubeGroupsAvatars.forgetChannels(
          await storage.getAvatars(),
          apply,
        );
        if (result.changed) {
          await storage.saveAvatars(result.avatars);
        }
      });
    }

    // `since` es la lectura que aplazó este lote. Un lote aplazado nunca contiene claves del
    // pendiente anterior (las confirmadas se aplican), así que siempre es un lote nuevo.
    const since = now;
    const samePending =
      rawPending.keys.length === defer.length &&
      rawPending.keys.every((key, index) => key === defer[index]) &&
      (defer.length === 0 || rawPending.since === since);
    if (!samePending) {
      await storage.withLock(storage.KEYS.pendingUnsubscribes, () =>
        storage.savePendingUnsubscribes(defer, since),
      );
    }

    await storage.withLock(storage.KEYS.subscriptions, async () => {
      const current = await storage.getSubscriptions();
      const { channels, changed } =
        YouTubeGroupsSubscriptions.mergeSubscriptions(
          current,
          {},
          {
            now,
            reconcileKeys: new Set([...seen.keys(), ...defer]),
          },
        );
      if (changed) {
        await storage.saveSubscriptions(channels);
      }
    });

    return { removed: apply, deferred: defer, renamed: split.renamed };
  }

  return {
    applyUnsubscribes,
    MASS_MIN,
    MASS_RATIO,
    PENDING_MAX_AGE_MS,
    findGoneKeys,
    splitRenamed,
    planUnsubscribes,
    normalizePending,
  };
})();
