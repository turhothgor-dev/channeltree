// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

/**
 * Lógica pura de las suscripciones conocidas (ADR 0018). Sin DOM.
 * Se carga tras avatars.js y storage.js.
 */
const YouTubeGroupsSubscriptions = (() => {
  const CHANNELS_FEED_PATH = "/feed/channels";
  const YOUTUBE_HOSTS = ["www.youtube.com", "youtube.com"];
  const MAX_DESCRIPTION_LENGTH = 500;
  const DISPLAY_DESCRIPTION_LENGTH = 240;

  /**
   * Corta un texto a `max` puntos de código, con "…" al final si se pasa.
   * @param {string} text Texto ya normalizado.
   * @param {number} max Máximo de puntos de código, incluida la elipsis.
   * @param {number} [visible] Puntos de código que se conservan al cortar.
   * @returns {string}
   */
  function truncate(text, max, visible = max - 1) {
    const points = Array.from(text);
    if (points.length <= max) {
      return text;
    }
    return `${points.slice(0, visible).join("").trimEnd()}…`;
  }

  /**
   * Normaliza una descripción de canal: espacios colapsados y tope de 500.
   * @param {*} value Descripción leída.
   * @returns {string} Texto normalizado, o `""` si no es cadena o queda vacío.
   */
  function normalizeDescription(value) {
    if (typeof value !== "string") {
      return "";
    }
    return truncate(value.replace(/\s+/g, " ").trim(), MAX_DESCRIPTION_LENGTH);
  }

  /**
   * Prepara una descripción para mostrarla en las listas.
   * @param {string} text Descripción (normalizada).
   * @param {number} [max] Máximo de puntos de código visibles.
   * @returns {{text: string, title: string}} `title` es el texto completo si
   *   se ha truncado y `""` si no.
   */
  function formatDescription(text, max = DISPLAY_DESCRIPTION_LENGTH) {
    const full = typeof text === "string" ? text : "";
    if (Array.from(full).length <= max) {
      return { text: full, title: "" };
    }
    return { text: truncate(full, max, max), title: full };
  }

  /**
   * Descripción guardada de una suscripción.
   * @param {Object} subscriptions Mapa de suscripciones conocidas.
   * @param {string} key Clave del canal.
   * @returns {string} Descripción normalizada, o `""`.
   */
  function getSubscriptionDescription(subscriptions, key) {
    if (!subscriptions || typeof subscriptions !== "object") {
      return "";
    }
    if (!Object.prototype.hasOwnProperty.call(subscriptions, key)) {
      return "";
    }
    const entry = subscriptions[key];
    return normalizeDescription(entry && entry.description);
  }

  /**
   * Indica si una entrada de suscripción es válida para la clave dada.
   * La descripción opcional nunca invalida una entrada.
   * @param {*} key Clave del mapa.
   * @param {*} entry Entrada `{ name, url, firstSeen, description? }`.
   * @returns {boolean}
   */
  function isValidEntry(key, entry) {
    if (!entry || typeof entry !== "object") {
      return false;
    }
    const { name, url, firstSeen } = entry;
    if (
      typeof key !== "string" ||
      typeof url !== "string" ||
      typeof name !== "string" ||
      name.trim() === "" ||
      typeof firstSeen !== "number" ||
      !Number.isFinite(firstSeen)
    ) {
      return false;
    }
    try {
      return (
        YouTubeGroups.normalizeChannelUrl(url) === url &&
        YouTubeGroups.getChannelKey(url) === key
      );
    } catch {
      return false;
    }
  }

  /**
   * Descarta las entradas no válidas de un mapa de suscripciones.
   * @param {*} value Mapa clave de canal -> `{ name, url, firstSeen, description? }`.
   * @returns {Object} Mapa solo con entradas válidas (copias).
   */
  function normalizeSubscriptions(value) {
    const result = {};
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return result;
    }
    for (const [key, entry] of Object.entries(value)) {
      if (isValidEntry(key, entry)) {
        result[key] = {
          name: entry.name,
          url: entry.url,
          firstSeen: entry.firstSeen,
        };
        const description = normalizeDescription(entry.description);
        if (description) {
          result[key].description = description;
        }
      }
    }
    return result;
  }

  /**
   * Combina las suscripciones guardadas con las observadas. No muta ninguna entrada.
   * @param {Object} stored Suscripciones guardadas.
   * @param {Object|Map} observed Suscripciones vistas (clave -> `{ name, url, description? }`).
   * @param {{now?: number, reconcileKeys?: Iterable<string>}} [options]
   *   `reconcileKeys`: si existe, se borra lo guardado que no esté en ese conjunto.
   * @returns {{channels: Object, changed: boolean}}
   */
  function mergeSubscriptions(
    stored,
    observed,
    { now = Date.now(), reconcileKeys } = {},
  ) {
    const previous = stored && typeof stored === "object" ? stored : {};
    const channels = normalizeSubscriptions(previous);

    if (reconcileKeys) {
      const seen = new Set(reconcileKeys);
      for (const key of Object.keys(channels)) {
        if (!seen.has(key)) {
          delete channels[key];
        }
      }
    }

    const entries =
      Object.prototype.toString.call(observed) === "[object Map]"
        ? [...observed.entries()]
        : Object.entries(observed || {});
    for (const [key, entry] of entries) {
      const name =
        entry && typeof entry.name === "string" ? entry.name.trim() : "";
      const url = entry && entry.url;
      if (!isValidEntry(key, { name, url, firstSeen: now })) {
        continue;
      }
      const description = normalizeDescription(entry.description);
      if (Object.prototype.hasOwnProperty.call(channels, key)) {
        channels[key].name = name;
      } else {
        channels[key] = { name, url, firstSeen: now };
      }
      if (description) {
        channels[key].description = description;
      }
    }

    const keys = Object.keys(channels);
    const changed =
      keys.length !== Object.keys(previous).length ||
      keys.some((key) => {
        const before = previous[key];
        const after = channels[key];
        return (
          !Object.prototype.hasOwnProperty.call(previous, key) ||
          !before ||
          before.name !== after.name ||
          before.url !== after.url ||
          before.firstSeen !== after.firstSeen ||
          before.description !== after.description
        );
      });

    return { channels, changed };
  }

  /**
   * Suscripciones que no están en ningún grupo ni subgrupo.
   * @param {Object} channels Suscripciones conocidas.
   * @param {Array} groups Grupos.
   * @returns {Array<{key: string, name: string, url: string, firstSeen: number}>}
   *   Ordenadas por `firstSeen` descendente y, a igualdad, por nombre.
   */
  function getUnclassifiedSubscriptions(channels, groups) {
    const grouped = YouTubeGroupsAvatars.getGroupedChannelKeys(groups);
    const valid = normalizeSubscriptions(channels);
    return Object.entries(valid)
      .filter(([key]) => !grouped.has(key))
      .map(([key, entry]) => ({ key, ...entry }))
      .sort(
        (a, b) => b.firstSeen - a.firstSeen || a.name.localeCompare(b.name),
      );
  }

  /**
   * Busca la sección de suscripciones de la guía (la del enlace a /feed/channels).
   * @param {string[][]} sections Un array de href por sección de la guía.
   * @returns {number} Índice de la primera sección que la contiene, o -1.
   */
  function findSubscriptionSectionIndex(sections) {
    if (!Array.isArray(sections)) {
      return -1;
    }
    for (let index = 0; index < sections.length; index += 1) {
      const hrefs = Array.isArray(sections[index]) ? sections[index] : [];
      for (const href of hrefs) {
        try {
          const url = new URL(href, "https://www.youtube.com");
          if (
            YOUTUBE_HOSTS.includes(url.hostname) &&
            url.pathname === CHANNELS_FEED_PATH
          ) {
            return index;
          }
        } catch {
          // href no válido: se ignora.
        }
      }
    }
    return -1;
  }

  /**
   * Indica si la lista de /feed/channels está completa y se puede reconciliar.
   * @param {{channelCount: number, notedCount: number, hasContinuation: boolean}} state
   * @returns {boolean}
   */
  function isChannelListComplete({
    channelCount,
    notedCount,
    hasContinuation,
  }) {
    return channelCount > 0 && notedCount >= channelCount && !hasContinuation;
  }

  /**
   * Guarda las suscripciones observadas, solo si algo cambia.
   * @param {Object|Map} observed Suscripciones vistas (clave -> `{ name, url, description? }`).
   * @param {{reconcileKeys?: Iterable<string>}} [options]
   * @returns {Promise<{changed: boolean}>}
   */
  function saveObservedSubscriptions(observed, { reconcileKeys } = {}) {
    const storage = YouTubeGroupsStorage;
    return storage.withLock(storage.KEYS.subscriptions, async () => {
      const stored = await storage.getSubscriptions();
      const { channels, changed } = mergeSubscriptions(stored, observed, {
        now: Date.now(),
        reconcileKeys,
      });
      if (changed) {
        await storage.saveSubscriptions(channels);
      }
      return { changed };
    });
  }

  return {
    MAX_DESCRIPTION_LENGTH,
    DISPLAY_DESCRIPTION_LENGTH,
    normalizeDescription,
    formatDescription,
    getSubscriptionDescription,
    normalizeSubscriptions,
    mergeSubscriptions,
    getUnclassifiedSubscriptions,
    findSubscriptionSectionIndex,
    isChannelListComplete,
    saveObservedSubscriptions,
  };
})();
