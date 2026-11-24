// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

/**
 * Lógica pura de los canales ocultos (ADR 0021). Sin DOM.
 * Se carga tras new-videos.js (usa groups.js y storage.js). Las escrituras
 * (…AndSave) usan withLock y escriben solo si algo cambia.
 */
const YouTubeGroupsHiddenChannels = (() => {
  const MAX_NAME_LENGTH = 100;

  /**
   * @param {*} value - Valor a comprobar.
   * @returns {boolean} true si es un objeto plano (no null, no array).
   */
  function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  /**
   * Normaliza una URL de canal sin lanzar.
   * @param {*} url - URL candidata.
   * @returns {string|null} URL normalizada o null.
   */
  function safeNormalizeUrl(url) {
    if (typeof url !== "string") {
      return null;
    }
    try {
      return YouTubeGroups.normalizeChannelUrl(url);
    } catch {
      return null;
    }
  }

  /**
   * Devuelve un mapa nuevo con solo las entradas válidas.
   * @param {*} raw - Mapa guardado (clave → { name, url, hiddenAt }).
   * @param {{ dropped: number }} [counter] - Suma 1 por cada entrada descartada.
   * @returns {Object<string, { name: string, url: string, hiddenAt: number }>} Mapa limpio.
   */
  function normalizeHiddenChannels(raw, counter) {
    const result = {};
    if (!isPlainObject(raw)) {
      return result;
    }
    for (const [key, entry] of Object.entries(raw)) {
      const url = isPlainObject(entry) ? entry.url : null;
      if (
        !isPlainObject(entry) ||
        typeof url !== "string" ||
        safeNormalizeUrl(url) !== url ||
        YouTubeGroups.getChannelKey(url) !== key
      ) {
        if (counter) {
          counter.dropped += 1;
        }
        continue;
      }
      result[key] = {
        name:
          typeof entry.name === "string"
            ? entry.name.trim().slice(0, MAX_NAME_LENGTH)
            : "",
        url,
        hiddenAt:
          typeof entry.hiddenAt === "number" && Number.isFinite(entry.hiddenAt)
            ? entry.hiddenAt
            : 0,
      };
    }
    return result;
  }

  /**
   * @param {Object} channels - Mapa de canales ocultos.
   * @returns {Set<string>} Claves de los canales ocultos.
   */
  function getHiddenKeys(channels) {
    return new Set(Object.keys(channels || {}));
  }

  /**
   * @param {Set<string>} keys - Claves ocultas.
   * @param {string} url - URL del canal.
   * @returns {boolean} true si el canal está oculto.
   */
  function isChannelHidden(keys, url) {
    if (!url) {
      return false;
    }
    return keys.has(YouTubeGroups.getChannelKey(url));
  }

  /**
   * Lista los canales ocultos, del más reciente al más antiguo.
   * @param {Object} channels - Mapa de canales ocultos.
   * @returns {Array<{ key: string, name: string, url: string, hiddenAt: number }>} Lista ordenada.
   */
  function listHiddenChannels(channels) {
    return Object.entries(channels || {})
      .map(([key, entry]) => ({
        key,
        name: entry.name,
        url: entry.url,
        hiddenAt: entry.hiddenAt,
      }))
      .sort(
        (a, b) => b.hiddenAt - a.hiddenAt || a.name.localeCompare(b.name, "es"),
      );
  }

  /**
   * Oculta un canal sin mutar el mapa recibido.
   * @param {Object} channels - Mapa actual.
   * @param {{ name?: string, url: string }} channel - Canal a ocultar.
   * @param {number} now - Marca de tiempo.
   * @returns {{ channels: Object, changed: boolean, key: string, entry: Object }} Resultado.
   */
  function hideChannel(channels, channel, now) {
    const url = safeNormalizeUrl(channel && channel.url);
    if (url === null) {
      throw new Error("URL de canal no válida.");
    }
    const key = YouTubeGroups.getChannelKey(url);
    if (Object.hasOwn(channels, key)) {
      return { channels, changed: false, key, entry: channels[key] };
    }
    const name =
      typeof channel.name === "string"
        ? channel.name.trim().slice(0, MAX_NAME_LENGTH)
        : "";
    const entry = { name, url, hiddenAt: now };
    return {
      channels: { ...channels, [key]: entry },
      changed: true,
      key,
      entry,
    };
  }

  /**
   * Deja de ocultar canales sin mutar el mapa recibido.
   * @param {Object} channels - Mapa actual.
   * @param {string[]} keys - Claves a quitar.
   * @returns {{ channels: Object, removed: Array<Object> }} Mapa nuevo y entradas quitadas.
   */
  function unhideChannels(channels, keys) {
    const next = { ...channels };
    const removed = [];
    for (const key of keys) {
      if (Object.hasOwn(next, key)) {
        removed.push({ key, ...next[key] });
        delete next[key];
      }
    }
    return { channels: next, removed };
  }

  /**
   * Devuelve al mapa entradas quitadas (con su hiddenAt original).
   * @param {Object} channels - Mapa actual.
   * @param {Array<{ key: string, name: string, url: string, hiddenAt: number }>} entries - Entradas.
   * @returns {{ channels: Object, changed: boolean }} Mapa nuevo y si cambió.
   */
  function restoreHiddenChannels(channels, entries) {
    const next = { ...channels };
    let changed = false;
    for (const { key, name, url, hiddenAt } of entries) {
      if (!Object.hasOwn(next, key)) {
        next[key] = { name, url, hiddenAt };
        changed = true;
      }
    }
    return { channels: next, changed };
  }

  /**
   * Lee, transforma y guarda el mapa bajo bloqueo; escribe solo si cambia.
   * @param {function(Object): { channels: Object, changed: boolean, result: Object }} transform - Cambio puro.
   * @returns {Promise<Object>} El `result` de la transformación junto con `changed`.
   */
  function updateHiddenChannels(transform) {
    const storage = YouTubeGroupsStorage;
    return storage.withLock(storage.KEYS.hiddenChannels, async () => {
      const current = normalizeHiddenChannels(
        await storage.getHiddenChannels(),
      );
      const { channels, changed, result } = transform(current);
      if (changed) {
        await storage.saveHiddenChannels(channels);
      }
      return { changed, ...result };
    });
  }

  /**
   * Oculta un canal y lo guarda.
   * @param {{ name?: string, url: string }} channel - Canal a ocultar.
   * @returns {Promise<{ changed: boolean, key: string, entry: Object }>} Resultado.
   */
  function hideChannelAndSave(channel) {
    return updateHiddenChannels((current) => {
      const { channels, changed, key, entry } = hideChannel(
        current,
        channel,
        Date.now(),
      );
      return { channels, changed, result: { key, entry } };
    });
  }

  /**
   * Deja de ocultar canales y lo guarda.
   * @param {string[]} keys - Claves a quitar.
   * @returns {Promise<{ removed: Array<Object> }>} Entradas quitadas.
   */
  async function unhideChannelsAndSave(keys) {
    const { removed } = await updateHiddenChannels((current) => {
      const { channels, removed: gone } = unhideChannels(current, keys);
      return {
        channels,
        changed: gone.length > 0,
        result: { removed: gone },
      };
    });
    return { removed };
  }

  /**
   * Devuelve entradas quitadas al mapa guardado.
   * @param {Array<Object>} entries - Entradas de `removed`.
   * @returns {Promise<{ changed: boolean }>} Si algo cambió.
   */
  async function restoreHiddenChannelsAndSave(entries) {
    const { changed } = await updateHiddenChannels((current) => {
      const { channels, changed: didChange } = restoreHiddenChannels(
        current,
        entries,
      );
      return { channels, changed: didChange, result: {} };
    });
    return { changed };
  }

  return {
    MAX_NAME_LENGTH,
    normalizeHiddenChannels,
    getHiddenKeys,
    isChannelHidden,
    listHiddenChannels,
    hideChannel,
    unhideChannels,
    restoreHiddenChannels,
    hideChannelAndSave,
    unhideChannelsAndSave,
    restoreHiddenChannelsAndSave,
  };
})();
