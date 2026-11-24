// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

/**
 * Lógica pura de los vídeos nuevos por grupo (ADR 0019). Sin DOM.
 * Se carga tras subscriptions.js (usa groups.js, avatars.js y storage.js).
 */
const YouTubeGroupsNewVideos = (() => {
  const VIDEO_ID_PATTERN = /^[\w-]{11}$/;
  const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
  const MAX_VIDEOS = 1000;
  const MAX_EXIT_ACKS = 500;
  /** Clave de `sessionStorage` con los reconocimientos aún sin guardar al salir de la página. */
  const EXIT_ACK_KEY = "youtubeGroupsExitAcks";

  function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  /** Clave de canal de una URL (normalizada o no), o null si no es de un canal. */
  function toChannelKey(url) {
    if (typeof url !== "string") {
      return null;
    }
    try {
      const normalized = YouTubeGroups.normalizeChannelUrl(url);
      return normalized ? YouTubeGroups.getChannelKey(normalized) : null;
    } catch {
      return null;
    }
  }

  function isChannelKey(value) {
    return toChannelKey(value) === value;
  }

  function isValidVideo(id, entry) {
    return (
      VIDEO_ID_PATTERN.test(id) &&
      isPlainObject(entry) &&
      isChannelKey(entry.channel) &&
      isFiniteNumber(entry.seenAt) &&
      (entry.publishedBefore === null || isFiniteNumber(entry.publishedBefore))
    );
  }

  /**
   * Descarta lo no válido de un estado guardado.
   * @param {*} value Valor guardado bajo `youtubeNewVideos`.
   * @returns {{since: (number|null), videos: Object, visits: Object}} Copia limpia.
   */
  function normalizeNewVideos(value) {
    const source = isPlainObject(value) ? value : {};
    const videos = {};
    const visits = {};

    if (isPlainObject(source.videos)) {
      for (const [id, entry] of Object.entries(source.videos)) {
        if (isValidVideo(id, entry)) {
          videos[id] = {
            channel: entry.channel,
            seenAt: entry.seenAt,
            publishedBefore: entry.publishedBefore,
          };
        }
      }
    }
    if (isPlainObject(source.visits)) {
      for (const [groupId, time] of Object.entries(source.visits)) {
        if (isFiniteNumber(time)) {
          visits[groupId] = time;
        }
      }
    }

    return {
      since: isFiniteNumber(source.since) ? source.since : null,
      videos,
      visits,
    };
  }

  /**
   * Aplica un lote de vídeos observados y reconocimientos. No muta la entrada.
   * @param {*} stored Estado guardado.
   * @param {Map<string, {channelUrl: string, seenAt: number, ageSeconds: (number|null)}>} batch
   * @param {{now: number, ackGroupIds?: Iterable<string>, acks?: Iterable<[string, number]>, groups: Array}} options
   *   `ackGroupIds` reconoce con `now`; `acks` son pares `[grupo, ms]` con su
   *   instante (limitado a `now`). Las visitas solo avanzan.
   * @returns {{state: Object, changed: boolean}}
   */
  function applyFeedBatch(
    stored,
    batch,
    { now, ackGroupIds = [], acks = [], groups = [] } = {},
  ) {
    const before = normalizeNewVideos(stored);
    const state = normalizeNewVideos(stored);
    const groupedKeys = YouTubeGroupsAvatars.getGroupedChannelKeys(groups);
    const groupIds = new Set(
      YouTubeGroups.flattenGroups(groups).map((g) => g.id),
    );

    if (state.since === null) {
      state.since = now;
    }

    const entries =
      batch && typeof batch.entries === "function" ? [...batch.entries()] : [];
    for (const [id, item] of entries) {
      if (!VIDEO_ID_PATTERN.test(id) || !isPlainObject(item)) {
        continue;
      }
      const seenAt = isFiniteNumber(item.seenAt) ? item.seenAt : now;
      const hasAge = isFiniteNumber(item.ageSeconds) && item.ageSeconds >= 0;
      const publishedBefore = hasAge ? seenAt - item.ageSeconds * 1000 : null;
      const existing = state.videos[id];

      if (existing) {
        if (existing.publishedBefore === null && publishedBefore !== null) {
          existing.publishedBefore = publishedBefore;
        }
        continue;
      }
      const channel = toChannelKey(item.channelUrl);
      // Un vídeo publicado antes de `since` nunca puede contar como nuevo.
      const tooOld = publishedBefore !== null && publishedBefore <= state.since;
      if (channel && groupedKeys.has(channel) && !tooOld) {
        state.videos[id] = { channel, seenAt, publishedBefore };
      }
    }

    const advanceVisit = (groupId, ms) => {
      const previous = state.visits[groupId];
      state.visits[groupId] = isFiniteNumber(previous)
        ? Math.max(previous, ms)
        : ms;
    };
    for (const groupId of ackGroupIds) {
      if (groupIds.has(groupId)) {
        advanceVisit(groupId, now);
      }
    }
    for (const [groupId, ms] of acks) {
      if (groupIds.has(groupId) && isFiniteNumber(ms)) {
        advanceVisit(groupId, Math.min(ms, now));
      }
    }

    for (const [id, entry] of Object.entries(state.videos)) {
      if (entry.seenAt < now - MAX_AGE_MS || !groupedKeys.has(entry.channel)) {
        delete state.videos[id];
      }
    }
    const ids = Object.keys(state.videos);
    if (ids.length > MAX_VIDEOS) {
      ids
        .sort(
          (a, b) =>
            state.videos[b].seenAt - state.videos[a].seenAt || (a < b ? -1 : 1),
        )
        .slice(MAX_VIDEOS)
        .forEach((id) => delete state.videos[id]);
    }
    for (const groupId of Object.keys(state.visits)) {
      if (!groupIds.has(groupId)) {
        delete state.visits[groupId];
      }
    }

    const changed = JSON.stringify(before) !== JSON.stringify(state);
    return { state, changed };
  }

  /**
   * Estado nuevo con las visitas de esos grupos a `now` (sin retrasar una visita
   * posterior). No muta la entrada.
   * @param {*} state Estado.
   * @param {Iterable<string>} groupIds Ids de grupo.
   * @param {number} now Marca de tiempo en ms.
   * @returns {{since: (number|null), videos: Object, visits: Object}}
   */
  function acknowledgeGroups(state, groupIds, now) {
    const result = normalizeNewVideos(state);
    for (const groupId of groupIds) {
      const previous = result.visits[groupId];
      result.visits[groupId] = isFiniteNumber(previous)
        ? Math.max(previous, now)
        : now;
    }
    return result;
  }

  /**
   * Ids de un grupo y de todos sus descendientes, en preorden.
   * @param {Array} groups Árbol de grupos.
   * @param {string} groupId Id del grupo.
   * @returns {string[]} Vacío si el grupo no existe.
   */
  function getSubtreeGroupIds(groups, groupId) {
    const find = (list) => {
      for (const group of Array.isArray(list) ? list : []) {
        if (group.id === groupId) {
          return group;
        }
        const found = find(group.subgroups);
        if (found) {
          return found;
        }
      }
      return null;
    };
    const root = find(groups);
    if (!root) {
      return [];
    }
    const ids = [];
    const visit = (group) => {
      ids.push(group.id);
      for (const child of Array.isArray(group.subgroups)
        ? group.subgroups
        : []) {
        visit(child);
      }
    };
    visit(root);
    return ids;
  }

  /**
   * Texto para `sessionStorage` con reconocimientos pendientes de guardar.
   * @param {Iterable<[string, number]>} acks Pares `[grupo, ms]`.
   * @param {number} now Marca de tiempo en ms (reservado para futuras reglas).
   * @returns {string} JSON `{ version: 1, acks: { id: ms } }`.
   */
  function serializeExitAcks(acks, now) {
    const result = {};
    for (const [id, ms] of acks) {
      if (typeof id === "string" && isFiniteNumber(ms) && ms <= now) {
        result[id] = ms;
      }
    }
    return JSON.stringify({ version: 1, acks: result });
  }

  /**
   * Interpreta lo escrito por `serializeExitAcks`.
   * @param {*} text Texto de `sessionStorage`.
   * @param {number} now Marca de tiempo en ms.
   * @returns {Map<string, number>} Vacío si no es válido; solo entradas
   *   válidas (no futuras ni más antiguas que 30 días), hasta 500.
   */
  function parseExitAcks(text, now) {
    const result = new Map();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return result;
    }
    if (
      !isPlainObject(data) ||
      data.version !== 1 ||
      !isPlainObject(data.acks)
    ) {
      return result;
    }
    for (const [id, ms] of Object.entries(data.acks)) {
      if (result.size >= MAX_EXIT_ACKS) {
        break;
      }
      if (isFiniteNumber(ms) && ms <= now && ms >= now - MAX_AGE_MS) {
        result.set(id, ms);
      }
    }
    return result;
  }

  /**
   * Quita los vídeos de los canales indicados. No muta la entrada.
   * @param {*} state Estado.
   * @param {Iterable<string>} keys Claves de canal a olvidar.
   * @returns {{state: {since: (number|null), videos: Object, visits: Object}, changed: boolean}}
   */
  function forgetChannels(state, keys) {
    const result = normalizeNewVideos(state);
    const wanted = new Set(keys);
    let changed = false;
    for (const [id, entry] of Object.entries(result.videos)) {
      if (wanted.has(entry.channel)) {
        delete result.videos[id];
        changed = true;
      }
    }
    return { state: result, changed };
  }

  /**
   * Reconocimiento de un grupo: su última visita o, sin ella, `since` (o 0).
   * @param {*} state Estado guardado.
   * @param {string} groupId Id del grupo.
   * @returns {number}
   */
  function getGroupAck(state, groupId) {
    const { since, visits } = normalizeNewVideos(state);
    return isFiniteNumber(visits[groupId]) ? visits[groupId] : (since ?? 0);
  }

  /**
   * Por qué un vídeo guardado cuenta o no como nuevo para un `ack`.
   * @param {string} id Id del vídeo.
   * @param {{seenAt: number, publishedBefore: (number|null)}} entry
   * @param {number} ack Reconocimiento del grupo.
   * @param {Object} [watched] Mapa de vídeos vistos.
   * @returns {"new"|"watched"|"no-age"|"seen-before-filter"|"published-before-filter"}
   */
  function getNewVideoStatus(id, entry, ack, watched = {}) {
    if (isPlainObject(watched) && watched[id]) {
      return "watched";
    }
    // Sin edad legible (directos, estrenos, tarjetas sin fecha) no cuenta
    if (entry.publishedBefore === null) {
      return "no-age";
    }
    if (!(entry.seenAt > ack)) {
      return "seen-before-filter";
    }
    if (!(entry.publishedBefore > ack)) {
      return "published-before-filter";
    }
    return "new";
  }

  /**
   * Vídeos nuevos por grupo (con sus subgrupos), sin red.
   * Nuevo: no visto, `seenAt > ack` y `publishedBefore` no nulo y `> ack`, con
   * `ack` la visita del propio grupo (o `since` si no tiene), sin herencia
   * entre padres, hijos ni grupos con canales en común (ADR 0038).
   * @param {*} state Estado guardado.
   * @param {Array} groups Árbol de grupos.
   * @param {Object} [watched] Mapa de vídeos vistos.
   * @returns {Map<string, number>} Id de grupo -> número (solo los > 0).
   */
  function countNewVideos(state, groups, watched = {}) {
    const { since, videos, visits } = normalizeNewVideos(state);
    const seen = isPlainObject(watched) ? watched : {};
    const counts = new Map();
    const channelVideos = new Map();

    for (const [id, entry] of Object.entries(videos)) {
      if (!channelVideos.has(entry.channel)) {
        channelVideos.set(entry.channel, []);
      }
      channelVideos.get(entry.channel).push(id);
    }

    const isNew = (id, entry, ack) =>
      getNewVideoStatus(id, entry, ack, seen) === "new";

    // Vídeos de los canales del subárbol de un grupo, nuevos según `ack`.
    const collectIds = (group, ack, ids) => {
      for (const channel of Array.isArray(group.channels)
        ? group.channels
        : []) {
        const key = YouTubeGroups.getChannelKey(channel.url);
        for (const id of channelVideos.get(key) || []) {
          if (isNew(id, videos[id], ack)) {
            ids.add(id);
          }
        }
      }
      for (const child of Array.isArray(group.subgroups)
        ? group.subgroups
        : []) {
        collectIds(child, ack, ids);
      }
    };

    // Cada grupo usa su propio reconocimiento, sin herencia entre grupos.
    const gather = (group) => {
      const ack = getGroupAck({ since, visits }, group.id);
      const ids = new Set();
      collectIds(group, ack, ids);
      if (ids.size > 0) {
        counts.set(group.id, ids.size);
      }
      for (const child of Array.isArray(group.subgroups)
        ? group.subgroups
        : []) {
        gather(child);
      }
    };
    for (const group of Array.isArray(groups) ? groups : []) {
      gather(group);
    }
    return counts;
  }

  /**
   * Ids de los vídeos nuevos para algún grupo que contiene **directamente**
   * su canal (no cuenta el grupo padre), con el reconocimiento de ese grupo
   * (ADR 0043). Es el conjunto que lleva la marca "Nuevo".
   * @param {*} state Estado guardado.
   * @param {Array} groups Árbol de grupos.
   * @param {Object} [watched] Mapa de vídeos vistos.
   * @returns {Set<string>}
   */
  function getNewVideoIds(state, groups, watched = {}) {
    const { since, videos, visits } = normalizeNewVideos(state);
    const seen = isPlainObject(watched) ? watched : {};
    const channelVideos = new Map();
    for (const [id, entry] of Object.entries(videos)) {
      if (!channelVideos.has(entry.channel)) {
        channelVideos.set(entry.channel, []);
      }
      channelVideos.get(entry.channel).push(id);
    }

    const result = new Set();
    const visit = (group) => {
      const ack = getGroupAck({ since, visits }, group.id);
      for (const channel of Array.isArray(group.channels)
        ? group.channels
        : []) {
        const key = YouTubeGroups.getChannelKey(channel.url);
        for (const id of channelVideos.get(key) || []) {
          if (getNewVideoStatus(id, videos[id], ack, seen) === "new") {
            result.add(id);
          }
        }
      }
      for (const child of Array.isArray(group.subgroups)
        ? group.subgroups
        : []) {
        visit(child);
      }
    };
    for (const group of Array.isArray(groups) ? groups : []) {
      visit(group);
    }
    return result;
  }

  /**
   * Guarda un lote de vídeos observados y reconocimientos, solo si algo cambia.
   * @param {Map} batch Ver `applyFeedBatch`.
   * @param {{ackGroupIds?: Iterable<string>, acks?: Iterable<[string, number]>}} [options]
   * @returns {Promise<{state: Object, changed: boolean}>}
   */
  function saveFeedBatch(batch, { ackGroupIds = [], acks = [] } = {}) {
    const storage = YouTubeGroupsStorage;
    return storage.withLock(storage.KEYS.newVideos, async () => {
      const [stored, groups] = await Promise.all([
        storage.getNewVideos(),
        storage.getGroups(),
      ]);
      const result = applyFeedBatch(stored, batch, {
        now: Date.now(),
        ackGroupIds,
        acks,
        groups,
      });
      if (result.changed) {
        await storage.saveNewVideos(result.state);
      }
      return result;
    });
  }

  return {
    normalizeNewVideos,
    applyFeedBatch,
    acknowledgeGroups,
    forgetChannels,
    countNewVideos,
    getNewVideoIds,
    getNewVideoStatus,
    getGroupAck,
    saveFeedBatch,
    getSubtreeGroupIds,
    serializeExitAcks,
    parseExitAcks,
    EXIT_ACK_KEY,
  };
})();
