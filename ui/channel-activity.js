// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

/**
 * Recolector de actividad de canales (ADR 0023): anota, sin red, la antigüedad
 * de los vídeos de las tarjetas que procesa `ui/cards.js` en cualquier página,
 * y las visitas a `/feed/subscriptions`. Guarda en lotes, como mucho cada pocos
 * segundos, solo lo que adelanta lo ya conocido. Se crea con `create(ctx)`; no
 * toca el DOM al crearse.
 */
const YouTubeGroupsChannelActivityUi = (() => {
  const FLUSH_DELAY_MS = 2000;
  /** Tope de vídeos recordados por pestaña en `noted`. */
  const MAX_NOTED = 2000;

  /**
   * Crea el recolector.
   * @param {Object} ctx - Contexto compartido de `content.js` (no se usa hoy,
   *   se acepta por coherencia con el resto de módulos de `ui/`).
   * @returns {Readonly<Object>} API: `noteVideo`, `flushPending`,
   *   `setChannels` y `start`.
   */
  function create(ctx) {
    const A = YouTubeGroupsChannelActivity;
    const { normalizeChannelUrl, getChannelKey } = YouTubeGroups;

    /** Claves de canales conservados; `null` hasta conocerlos. */
    let keptKeys = null;
    /** `lastPublished` conocido: clave de canal -> ms o null. */
    let knownPublished = new Map();
    /** Última marca de visita al feed conocida o anotada, en ms. */
    let lastMark = null;
    /** Hay una visita al feed por volcar. */
    let feedPending = false;
    /** Vídeos ya procesados en esta pestaña: id -> si tenía edad. */
    const noted = new Map();
    /** Lote por volcar: clave de canal -> { url, publishedAt }. */
    let pending = new Map();
    let flushTimer = null;

    /** Indica si la página actual es el feed de suscripciones. */
    const isSubscriptionsPage = () =>
      YouTubeGroupsPages.getPageType(window.location.pathname) ===
      "subscriptions";

    /** Programa un volcado si no hay uno programado. */
    function scheduleFlush() {
      if (flushTimer === null) {
        flushTimer = setTimeout(() => {
          flushPending();
        }, FLUSH_DELAY_MS);
      }
    }

    /**
     * Clave de canal de una URL, o `null` si no es válida.
     * @param {string} channelUrl - URL del canal.
     * @returns {string|null}
     */
    function keyOf(channelUrl) {
      try {
        const normalized = normalizeChannelUrl(channelUrl);
        return normalized === null ? null : getChannelKey(normalized);
      } catch {
        return null;
      }
    }

    /**
     * Añade una observación al lote conservando el máximo por canal.
     * @param {Map} batch - Lote destino.
     * @param {string} key - Clave del canal.
     * @param {string} url - URL del canal.
     * @param {number} publishedAt - Fecha de publicación en ms.
     */
    function addToBatch(batch, key, url, publishedAt) {
      const current = batch.get(key);
      if (!current || publishedAt > current.publishedAt) {
        batch.set(key, { url, publishedAt });
      }
    }

    /**
     * Anota la visita al feed (si toca) y la antigüedad de un vídeo visto en
     * una tarjeta.
     * @param {string|null} videoId - Id del vídeo.
     * @param {string|undefined} channelUrl - URL del canal de la tarjeta.
     * @param {Function} getAgeSeconds - Devuelve la edad en segundos o null.
     */
    function noteVideo(videoId, channelUrl, getAgeSeconds) {
      const now = Date.now();
      if (
        isSubscriptionsPage() &&
        (lastMark === null || now - lastMark >= A.FEED_MARK_INTERVAL_MS)
      ) {
        lastMark = now;
        feedPending = true;
        scheduleFlush();
      }
      if (!videoId || !channelUrl) {
        return;
      }
      const key = keyOf(channelUrl);
      if (key === null || (keptKeys !== null && !keptKeys.has(key))) {
        return;
      }
      if (noted.get(videoId) === true) {
        return;
      }
      const age = getAgeSeconds();
      const hasAge = typeof age === "number" && Number.isFinite(age);
      noted.delete(videoId);
      noted.set(videoId, hasAge);
      // Se descartan los más antiguos (el Map conserva el orden de inserción)
      while (noted.size > MAX_NOTED) {
        noted.delete(noted.keys().next().value);
      }
      if (!hasAge) {
        return;
      }
      const publishedAt = now - age * 1000;
      const known = knownPublished.get(key);
      if (
        typeof known === "number" &&
        publishedAt <= known + A.MIN_ADVANCE_MS
      ) {
        return;
      }
      addToBatch(pending, key, channelUrl, publishedAt);
      scheduleFlush();
    }

    /**
     * Guarda el lote y la visita al feed pendientes; los errores se
     * registran sin relanzar y el lote vuelve a pendiente.
     * @returns {Promise<void>}
     */
    async function flushPending() {
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (pending.size === 0 && !feedPending) {
        return;
      }
      const batch = pending;
      const feedVisited = feedPending;
      pending = new Map();
      feedPending = false;
      const observations = new Map();
      for (const { url, publishedAt } of batch.values()) {
        observations.set(url, publishedAt);
      }
      try {
        const { state } = await A.saveObservations(observations, {
          feedVisited,
        });
        knownPublished = new Map(
          Object.entries(state.channels).map(([key, value]) => [
            key,
            value.lastPublished,
          ]),
        );
        if (typeof state.lastFeedAt === "number") {
          lastMark = Math.max(lastMark ?? 0, state.lastFeedAt);
        }
      } catch (error) {
        for (const [key, { url, publishedAt }] of batch) {
          addToBatch(pending, key, url, publishedAt);
        }
        feedPending = feedPending || feedVisited;
        console.error(
          "[ChannelTree] No se pudo guardar la actividad de canales",
          error,
        );
      }
    }

    /**
     * Fija los canales conservados (agrupados o suscripciones conocidas).
     * @param {Array} groups - Grupos.
     * @param {Object} subscriptions - Suscripciones conocidas.
     */
    function setChannels(groups, subscriptions) {
      keptKeys = YouTubeGroupsAvatars.getKeptChannelKeys(
        Array.isArray(groups) ? groups : [],
        subscriptions,
      );
    }

    /** Lee la clave guardada para conocer lo ya anotado. */
    function start() {
      YouTubeGroupsStorage.getChannelActivity()
        .then((value) => {
          const state = A.normalizeActivity(value);
          const stored = new Map(
            Object.entries(state.channels).map(([key, entry]) => [
              key,
              entry.lastPublished,
            ]),
          );
          // Lo anotado en esta pestaña antes de leer prevalece si es mayor
          for (const [key, known] of knownPublished) {
            const read = stored.get(key);
            if (typeof known === "number" && !(read >= known)) {
              stored.set(key, known);
            }
          }
          knownPublished = stored;
          if (typeof state.lastFeedAt === "number") {
            lastMark = Math.max(lastMark ?? 0, state.lastFeedAt);
          }
        })
        .catch((error) => {
          console.error(
            "[ChannelTree] No se pudo leer la actividad de canales",
            error,
          );
        });
    }

    return Object.freeze({ noteVideo, flushPending, setChannels, start });
  }

  return Object.freeze({ create });
})();
