// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

/**
 * Lógica pura de la actividad de canales (ADR 0023). Sin DOM.
 * Se carga tras hidden-channels.js (usa groups.js y avatars.js).
 */
const YouTubeGroupsChannelActivity = (() => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const MONTH_MS = 30 * DAY_MS;
  const THRESHOLD_MONTHS = Object.freeze([3, 6, 12]);
  const DEFAULT_THRESHOLD_MONTHS = 6;
  const FEED_GAP_MS = 30 * DAY_MS;
  const FEED_MARK_INTERVAL_MS = 12 * 60 * 60 * 1000;
  const MIN_ADVANCE_MS = DAY_MS;

  /**
   * @param {*} value - Valor a comprobar.
   * @returns {boolean} true si es un objeto plano (no null, no array).
   */
  function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  /**
   * Calcula la clave de canal de una URL sin lanzar.
   * @param {*} url - URL candidata.
   * @returns {string|null} Clave del canal o null si la URL no es de canal.
   */
  function safeChannelKey(url) {
    if (typeof url !== "string") {
      return null;
    }
    try {
      return YouTubeGroups.getChannelKey(
        YouTubeGroups.normalizeChannelUrl(url),
      );
    } catch {
      return null;
    }
  }

  /**
   * Normaliza el estado de actividad guardado, descartando lo no válido.
   * @param {*} value - Valor guardado ({ lastFeedAt, channels }).
   * @returns {{ lastFeedAt: number|null, channels: Object<string, { trackedSince: number, lastPublished: number|null }> }} Estado nuevo.
   */
  function normalizeActivity(value) {
    const source = isPlainObject(value) ? value : {};
    const lastFeedAt = Number.isFinite(source.lastFeedAt)
      ? source.lastFeedAt
      : null;
    const channels = {};
    if (isPlainObject(source.channels)) {
      for (const [key, entry] of Object.entries(source.channels)) {
        if (
          !isPlainObject(entry) ||
          safeChannelKey(key) !== key ||
          !Number.isFinite(entry.trackedSince) ||
          (entry.lastPublished !== null &&
            !Number.isFinite(entry.lastPublished))
        ) {
          continue;
        }
        channels[key] = {
          trackedSince: entry.trackedSince,
          lastPublished: entry.lastPublished,
        };
      }
    }
    return { lastFeedAt, channels };
  }

  /**
   * Aplica observaciones al estado guardado sin mutarlo.
   * @param {*} stored - Estado guardado.
   * @param {Map<string, number>} observations - URL de canal -> fecha de publicación (ms).
   * @param {{ now: number, groups?: Array, subscriptions?: Object, feedVisited?: boolean }} options - Contexto.
   * @returns {{ state: { lastFeedAt: number|null, channels: Object }, changed: boolean }} Estado resultante.
   */
  function applyObservations(
    stored,
    observations,
    { now, groups = [], subscriptions = {}, feedVisited = false },
  ) {
    const before = normalizeActivity(stored);
    const state = normalizeActivity(before);

    if (
      feedVisited &&
      (state.lastFeedAt === null || now - state.lastFeedAt > FEED_GAP_MS)
    ) {
      for (const entry of Object.values(state.channels)) {
        entry.trackedSince = now;
      }
    }
    if (
      feedVisited &&
      (state.lastFeedAt === null ||
        now - state.lastFeedAt >= FEED_MARK_INTERVAL_MS)
    ) {
      state.lastFeedAt = now;
    }

    const kept = YouTubeGroupsAvatars.getKeptChannelKeys(groups, subscriptions);
    for (const key of kept) {
      if (!state.channels[key]) {
        state.channels[key] = { trackedSince: now, lastPublished: null };
      }
    }

    if (observations && typeof observations.entries === "function") {
      for (const [url, publishedAt] of observations.entries()) {
        const key = safeChannelKey(url);
        if (key === null || !kept.has(key) || !Number.isFinite(publishedAt)) {
          continue;
        }
        const entry = state.channels[key];
        const value = Math.min(publishedAt, now);
        if (
          entry.lastPublished === null ||
          value > entry.lastPublished + MIN_ADVANCE_MS
        ) {
          entry.lastPublished = value;
        }
      }
    }

    for (const key of Object.keys(state.channels)) {
      if (!kept.has(key)) {
        delete state.channels[key];
      }
    }

    return {
      state,
      changed: JSON.stringify(before) !== JSON.stringify(state),
    };
  }

  /**
   * Grupos y subgrupos (en preorden) que contienen directamente un canal.
   * @param {Array} groups - Árbol de grupos.
   * @returns {Map<string, Array<{ id: string, name: string }>>} Clave -> grupos.
   */
  function mapChannelGroups(groups) {
    const map = new Map();
    const visit = (list) => {
      for (const group of Array.isArray(list) ? list : []) {
        const seen = new Set();
        for (const channel of Array.isArray(group.channels)
          ? group.channels
          : []) {
          const key = safeChannelKey(channel && channel.url);
          if (key === null || seen.has(key)) {
            continue;
          }
          seen.add(key);
          if (!map.has(key)) {
            map.set(key, []);
          }
          map.get(key).push({ id: group.id, name: group.name });
        }
        visit(group.subgroups);
      }
    };
    visit(groups);
    return map;
  }

  /**
   * Lista los canales inactivos con el umbral dado.
   * @param {*} state - Estado de actividad guardado.
   * @param {Array} groups - Árbol de grupos.
   * @param {Object} subscriptions - Suscripciones conocidas.
   * @param {{ now: number, thresholdMonths?: number }} options - Contexto.
   * @returns {{ status: string, observingSince: number|null, channels: Array }} Resultado.
   */
  function listInactiveChannels(
    state,
    groups,
    subscriptions,
    { now, thresholdMonths = DEFAULT_THRESHOLD_MONTHS },
  ) {
    const activity = normalizeActivity(state);
    let status = "ready";
    if (activity.lastFeedAt === null) {
      status = "no-feed";
    } else if (now - activity.lastFeedAt > FEED_GAP_MS) {
      status = "stale";
    }
    const months = THRESHOLD_MONTHS.includes(thresholdMonths)
      ? thresholdMonths
      : DEFAULT_THRESHOLD_MONTHS;
    const limit = months * MONTH_MS;
    const subs =
      YouTubeGroupsSubscriptions.normalizeSubscriptions(subscriptions);
    const groupsByKey = mapChannelGroups(groups);

    let observingSince = null;
    let anyPublished = false;
    const channels = [];
    for (const key of YouTubeGroupsAvatars.getGroupedChannelKeys(groups)) {
      const sub = subs[key];
      const entry = activity.channels[key];
      if (!sub || !entry) {
        continue;
      }
      const observedSince = Math.max(entry.trackedSince, sub.firstSeen);
      if (observingSince === null || observedSince < observingSince) {
        observingSince = observedSince;
      }
      if (entry.lastPublished !== null) {
        anyPublished = true;
      }
      if (
        now - observedSince >= limit &&
        (entry.lastPublished === null || now - entry.lastPublished >= limit)
      ) {
        channels.push({
          key,
          name: sub.name,
          url: sub.url,
          lastPublished: entry.lastPublished,
          observedSince,
          groups: groupsByKey.get(key) || [],
        });
      }
    }
    // Sin ningún vídeo visto entre los evaluados, no se puede distinguir un
    // canal inactivo de una antigüedad que no se ha podido leer.
    if (status === "ready" && observingSince !== null && !anyPublished) {
      status = "no-data";
    }
    if (status !== "ready") {
      channels.length = 0;
    }
    channels.sort(
      (a, b) =>
        (a.lastPublished ?? a.observedSince) -
          (b.lastPublished ?? b.observedSince) ||
        a.name.localeCompare(b.name, "es"),
    );
    return { status, observingSince, channels };
  }

  /**
   * Describe cuánto hace que no se ve un vídeo del canal.
   * @param {{ lastPublished: number|null, observedSince?: number }} item - Elemento de la lista.
   * @param {number} now - Marca de tiempo actual (ms).
   * @returns {string} Texto para la fila.
   */
  function describeInactivity(item, now) {
    const since = item.lastPublished ?? item.observedSince;
    const months = Math.floor((now - since) / MONTH_MS);
    const label = months === 1 ? "1 mes" : `${months} meses`;
    return item.lastPublished === null
      ? `Nunca se ha visto un vídeo suyo (observado ${label}; revisa antes de quitar)`
      : `Último vídeo visto hace ${label}`;
  }

  /**
   * Quita canales de la actividad. No muta la entrada.
   * @param {*} state - Estado guardado.
   * @param {Iterable<string>} keys - Claves de canal a olvidar.
   * @returns {{ state: { lastFeedAt: (number|null), channels: Object }, changed: boolean }} Estado nuevo.
   */
  function forgetChannels(state, keys) {
    const result = normalizeActivity(state);
    let changed = false;
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(result.channels, key)) {
        delete result.channels[key];
        changed = true;
      }
    }
    return { state: result, changed };
  }

  /**
   * Aplica observaciones a la actividad guardada bajo bloqueo; escribe solo si cambia.
   * @param {Map<string, number>} observations - URL de canal -> marca de publicación (ms).
   * @param {{ feedVisited?: boolean }} [options] - `feedVisited`: se ha visto el feed de suscripciones.
   * @returns {Promise<{ state: { lastFeedAt: (number|null), channels: Object }, changed: boolean }>} Resultado.
   */
  function saveObservations(observations, { feedVisited = false } = {}) {
    const storage = YouTubeGroupsStorage;
    return storage.withLock(storage.KEYS.channelActivity, async () => {
      const [stored, groups, subscriptions] = await Promise.all([
        storage.getChannelActivity(),
        storage.getGroups(),
        storage.getSubscriptions(),
      ]);
      const result = applyObservations(stored, observations, {
        now: Date.now(),
        groups,
        subscriptions,
        feedVisited,
      });
      if (result.changed) {
        await storage.saveChannelActivity(result.state);
      }
      return result;
    });
  }

  return {
    DAY_MS,
    MONTH_MS,
    THRESHOLD_MONTHS,
    DEFAULT_THRESHOLD_MONTHS,
    FEED_GAP_MS,
    FEED_MARK_INTERVAL_MS,
    MIN_ADVANCE_MS,
    normalizeActivity,
    applyObservations,
    forgetChannels,
    listInactiveChannels,
    describeInactivity,
    saveObservations,
  };
})();
