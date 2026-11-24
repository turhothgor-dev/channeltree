// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

/**
 * Recolector de vídeos nuevos por grupo (ADR 0019): anota, sin red, los vídeos
 * de las tarjetas de las páginas que admite `shouldNoteNewVideos` (inicio,
 * suscripciones, búsqueda, watch y canal) de canales agrupados, los guarda en
 * lotes cada pocos segundos y mantiene en `ctx.state.newVideoCounts` el número
 * de vídeos nuevos de cada grupo. Se crea con `create(ctx)`; no toca el DOM al
 * crearse.
 */
const YouTubeGroupsNewVideosUi = (() => {
  const FLUSH_DELAY_MS = 2000;
  /** Tope de vídeos recordados por pestaña en `noted`. */
  const MAX_NOTED = 2000;

  /**
   * Crea el recolector.
   * @param {Object} ctx - Contexto compartido de `content.js`; usa
   *   `ctx.state` (`activeSelection`, `watchedVideos`, `newVideoCounts`) y
   *   `ctx.guide.updateNewVideoBullets` si existe.
   * @returns {Readonly<Object>} API: `noteVideo`, `acknowledgeExit`,
   *   `restoreAcks`, `getUnsavedAcks`, `flushPending`, `setGroups`, `applyStoredValue`, `recount` y `start`.
   */
  function create(ctx) {
    const N = YouTubeGroupsNewVideos;
    const { normalizeChannelUrl, getChannelKey } = YouTubeGroups;

    let groups = null;
    let groupedKeys = null;
    let state = N.normalizeNewVideos(null);
    /** Vídeos ya anotados en esta pestaña: id -> si se anotó con edad. */
    const noted = new Map();
    /** Vídeos por guardar en el próximo volcado. */
    const pending = new Map();
    /** Reconocimientos aún no volcados: id de grupo -> ms. */
    const pendingAcks = new Map();
    /** Reconocimientos de volcados en curso (hasta que termina el guardado). */
    const inFlightAcks = new Set();
    let flushTimer = null;

    const shouldNoteHere = () =>
      YouTubeGroupsPages.shouldNoteNewVideos(
        YouTubeGroupsPages.getPageType(window.location.pathname),
      );

    function scheduleFlush() {
      if (flushTimer === null) {
        flushTimer = setTimeout(() => {
          flushPending();
        }, FLUSH_DELAY_MS);
      }
    }

    function isGroupedChannel(channelUrl) {
      if (groupedKeys === null) {
        return true;
      }
      try {
        const normalized = normalizeChannelUrl(channelUrl);
        return (
          normalized !== null && groupedKeys.has(getChannelKey(normalized))
        );
      } catch {
        return false;
      }
    }

    /**
     * Anota un vídeo visto en una tarjeta. Solo en las páginas de
     * `shouldNoteNewVideos` y de canales agrupados; una vez por pestaña (si se
     * anotó sin edad, se reintenta la edad en procesados posteriores).
     * @param {string|null} videoId - Id del vídeo.
     * @param {string|undefined} channelUrl - URL del canal de la tarjeta.
     * @param {Function} getAgeSeconds - Devuelve la edad en segundos o null.
     */
    function noteVideo(videoId, channelUrl, getAgeSeconds) {
      if (!videoId || !channelUrl || !shouldNoteHere()) {
        return;
      }
      if (!isGroupedChannel(channelUrl)) {
        return;
      }
      const known = noted.get(videoId);
      if (known === true) {
        return;
      }
      const age = getAgeSeconds();
      const hasAge = typeof age === "number" && Number.isFinite(age);
      if (known === false) {
        if (hasAge) {
          // Antigüedad tardía: si ya se volcó sin ella, se vuelve a anotar
          // (el lote completa `publishedBefore` sin tocar `seenAt`).
          const entry = pending.get(videoId);
          if (entry) {
            entry.ageSeconds = age;
          } else {
            pending.set(videoId, {
              channelUrl,
              seenAt: Date.now(),
              ageSeconds: age,
            });
            scheduleFlush();
          }
          noted.set(videoId, true);
        }
        return;
      }
      noted.set(videoId, hasAge);
      // Se descartan los más antiguos (el Map conserva el orden de inserción)
      while (noted.size > MAX_NOTED) {
        const oldest = noted.keys().next().value;
        noted.delete(oldest);
      }
      pending.set(videoId, {
        channelUrl,
        seenAt: Date.now(),
        ageSeconds: hasAge ? age : null,
      });
      scheduleFlush();
    }

    function groupIdsOf(selection) {
      const ids = [];
      for (const key of Array.isArray(selection) ? selection : []) {
        const filter = YouTubeGroupsFilter.parseFilterKey(key);
        if (filter && filter.type === "group") {
          ids.push(filter.id);
        }
      }
      return ids;
    }

    /**
     * Anota reconocimientos (id -> ms): los pone a 0 al momento y los deja
     * pendientes para el siguiente volcado. Las visitas solo avanzan.
     * @param {Iterable<[string, number]>} entries - Pares id de grupo, ms.
     */
    function recordAcks(entries) {
      let any = false;
      for (const [id, at] of entries) {
        if (!Number.isFinite(at)) {
          continue;
        }
        pendingAcks.set(id, Math.max(pendingAcks.get(id) ?? -Infinity, at));
        state = N.acknowledgeGroups(state, [id], at);
        any = true;
      }
      if (any) {
        recount();
        scheduleFlush();
      }
    }

    /**
     * Reconoce al salir de una selección: cada grupo y todo su subárbol, con
     * el instante de salida (ADR 0043).
     * @param {string[]} selection - Selección que se abandona.
     * @param {number} [at] - Instante de salida (ms).
     * @param {string[]} [nextSelection] - Selección a la que se pasa: el
     *   subárbol de sus grupos (o del grupo de sus canales) no se reconoce
     *   ahora, sino al salir de ella.
     * @returns {string[]} Ids de grupo reconocidos.
     */
    function acknowledgeExit(selection, at = Date.now(), nextSelection = []) {
      const keep = new Set();
      for (const key of Array.isArray(nextSelection) ? nextSelection : []) {
        const filter = YouTubeGroupsFilter.parseFilterKey(key);
        const id =
          filter?.type === "group"
            ? filter.id
            : filter?.type === "channel"
              ? filter.containerId
              : null;
        if (id) {
          keep.add(id);
          for (const subId of N.getSubtreeGroupIds(groups ?? [], id)) {
            keep.add(subId);
          }
        }
      }
      const ids = new Set();
      for (const id of groupIdsOf(selection)) {
        const subtree = N.getSubtreeGroupIds(groups ?? [], id);
        if (subtree.length === 0) {
          ids.add(id);
        }
        for (const subId of subtree) {
          ids.add(subId);
        }
      }
      for (const id of keep) {
        ids.delete(id);
      }
      recordAcks([...ids].map((id) => [id, at]));
      return [...ids];
    }

    /**
     * Restaura reconocimientos de una recarga anterior (ya expandidos).
     * @param {Iterable<[string, number]>} acks - Pares id de grupo, ms.
     */
    function restoreAcks(acks) {
      recordAcks(acks);
    }

    /**
     * Reconocimientos aún no guardados (pendientes y en vuelo).
     * @returns {Map<string, number>} Id de grupo -> ms (el mayor).
     */
    function getUnsavedAcks() {
      const result = new Map();
      for (const acks of [pendingAcks, ...inFlightAcks]) {
        for (const [id, time] of acks) {
          result.set(id, Math.max(result.get(id) ?? -Infinity, time));
        }
      }
      return result;
    }

    /**
     * Guarda los vídeos y reconocimientos pendientes; los errores se
     * registran sin relanzar.
     * @returns {Promise<void>}
     */
    async function flushPending() {
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (pending.size === 0 && pendingAcks.size === 0) {
        return;
      }
      const batch = new Map(pending);
      const flushedAcks = new Map(pendingAcks);
      pending.clear();
      pendingAcks.clear();
      inFlightAcks.add(flushedAcks);
      try {
        const result = await N.saveFeedBatch(batch, { acks: flushedAcks });
        inFlightAcks.delete(flushedAcks);
        state = result.state;
        applyStoredValue(state);
      } catch (error) {
        inFlightAcks.delete(flushedAcks);
        // Para que se reintente con la próxima tarjeta.
        for (const id of batch.keys()) {
          noted.delete(id);
        }
        for (const [id, time] of flushedAcks) {
          pendingAcks.set(id, Math.max(pendingAcks.get(id) ?? -Infinity, time));
        }
        console.error(
          "[ChannelTree] No se pudieron guardar vídeos nuevos",
          error,
        );
      }
    }

    function sameCounts(a, b) {
      if (a.size !== b.size) {
        return false;
      }
      for (const [id, count] of a) {
        if (b.get(id) !== count) {
          return false;
        }
      }
      return true;
    }

    /**
     * Recalcula los números por grupo; solo si cambian los guarda y avisa a
     * la guía.
     */
    function recount() {
      if (groups === null) {
        return;
      }
      const counts = N.countNewVideos(
        state,
        groups,
        ctx.state.watchedVideos ?? {},
      );
      const previous = ctx.state.newVideoCounts ?? new Map();
      const countsChanged = !sameCounts(previous, counts);
      if (countsChanged) {
        ctx.state.newVideoCounts = counts;
      }

      const ids = N.getNewVideoIds(
        state,
        groups,
        ctx.state.watchedVideos ?? {},
      );
      const previousIds = ctx.state.newVideoIds ?? new Set();
      const idsChanged =
        ids.size !== previousIds.size ||
        [...ids].some((id) => !previousIds.has(id));
      if (idsChanged) {
        ctx.state.newVideoIds = ids;
      }

      if (countsChanged) {
        ctx.guide?.updateNewVideoBullets?.();
      }
      if (idsChanged) {
        ctx.cards?.applyNewVideoBadgesToAllCards?.();
      }
    }

    /**
     * Aplica un valor guardado, conservando en memoria los reconocimientos
     * aún no volcados.
     * @param {*} newValue - Valor de `youtubeNewVideos`.
     */
    function applyStoredValue(newValue) {
      let next = N.normalizeNewVideos(newValue);
      const unsaved = [pendingAcks, ...inFlightAcks];
      for (const acks of unsaved) {
        for (const [id, time] of acks) {
          if (!(next.visits[id] >= time)) {
            next = N.acknowledgeGroups(next, [id], time);
          }
        }
      }
      state = next;
      recount();
    }

    /**
     * Fija el árbol de grupos y recuenta.
     * @param {Array} newGroups - Grupos.
     */
    function setGroups(newGroups) {
      groups = Array.isArray(newGroups) ? newGroups : [];
      const previousKeys = groupedKeys;
      groupedKeys = YouTubeGroupsAvatars.getGroupedChannelKeys(groups);
      const changed =
        previousKeys !== null &&
        (previousKeys.size !== groupedKeys.size ||
          [...previousKeys].some((key) => !groupedKeys.has(key)));
      if (changed) {
        // Un canal que vuelve a un grupo debe anotarse de nuevo: los vídeos
        // anotados antes pudieron podarse del almacenamiento.
        for (const id of [...noted.keys()]) {
          if (!pending.has(id)) {
            noted.delete(id);
          }
        }
      }
      recount();
    }

    /** Lee las claves guardadas y recuenta. */
    function start() {
      YouTubeGroupsStorage.getNewVideos()
        .then((value) => {
          applyStoredValue(value);
        })
        .catch((error) => {
          console.error(
            "[ChannelTree] No se pudieron leer los vídeos nuevos",
            error,
          );
        });
    }

    return Object.freeze({
      noteVideo,
      acknowledgeExit,
      restoreAcks,
      getUnsavedAcks,
      flushPending,
      setGroups,
      applyStoredValue,
      recount,
      start,
    });
  }

  return Object.freeze({ create });
})();
