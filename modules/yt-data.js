// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

/**
 * Lectura de los datos que YouTube incrusta en sus páginas y construcción de las
 * peticiones de continuación (ADR 0042). Puro: sin DOM ni red.
 * Se carga tras unsubscribes.js; solo usa otros globales dentro de funciones.
 */
const YouTubeGroupsYtData = (() => {
  const DEFAULT_ORIGIN = "https://www.youtube.com";
  const BROWSE_URL =
    "https://www.youtube.com/youtubei/v1/browse?prettyPrint=false";
  const INITIAL_DATA_MARKERS = [
    "var ytInitialData = ",
    'window["ytInitialData"] = ',
  ];
  const YTCFG_MARKER = "ytcfg.set(";

  /**
   * Lee el objeto JSON que empieza en la primera `{` tras `from` si solo hay
   * espacios entre medias. Recorre llaves equilibradas respetando cadenas y escapes.
   * @param {string} html - Texto donde buscar.
   * @param {number} from - Posición desde la que mirar.
   * @returns {{ value: Object, end: number }|null} Objeto y posición final, o null.
   */
  function readObjectAt(html, from) {
    let start = from;
    while (start < html.length && /\s/.test(html[start])) {
      start += 1;
    }
    if (html[start] !== "{") {
      return null;
    }
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < html.length; i += 1) {
      const char = html[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
      } else if (char === '"') {
        inString = true;
      } else if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            const value = JSON.parse(html.slice(start, i + 1));
            return value !== null && typeof value === "object"
              ? { value, end: i + 1 }
              : null;
          } catch {
            return null;
          }
        }
      }
    }
    return null;
  }

  /**
   * Extrae el primer objeto JSON que sigue a un marcador.
   * @param {string} html - Texto de la página.
   * @param {string} marker - Texto que precede al objeto.
   * @returns {Object|null} Objeto analizado, o null si falta o está roto.
   */
  function extractJsonAfter(html, marker) {
    if (typeof html !== "string" || typeof marker !== "string" || !marker) {
      return null;
    }
    const index = html.indexOf(marker);
    if (index === -1) {
      return null;
    }
    return readObjectAt(html, index + marker.length)?.value ?? null;
  }

  /**
   * @param {string} html - Texto de la página.
   * @returns {Object|null} `ytInitialData`, o null si no se reconoce.
   */
  function readInitialData(html) {
    for (const marker of INITIAL_DATA_MARKERS) {
      const data = extractJsonAfter(html, marker);
      if (data) {
        return data;
      }
    }
    return null;
  }

  /**
   * Fusiona todos los `ytcfg.set({...})` de la página (los posteriores pisan).
   * @param {string} html - Texto de la página.
   * @returns {Object|null} Configuración fusionada, o null si no hay ninguna.
   */
  function readYtcfg(html) {
    if (typeof html !== "string") {
      return null;
    }
    let merged = null;
    let from = 0;
    for (;;) {
      const index = html.indexOf(YTCFG_MARKER, from);
      if (index === -1) {
        return merged;
      }
      const start = index + YTCFG_MARKER.length;
      const found = readObjectAt(html, start);
      if (found && !Array.isArray(found.value)) {
        merged = { ...merged, ...found.value };
        from = found.end;
      } else {
        from = start;
      }
    }
  }

  /**
   * @param {string} cookieString - Valor de `document.cookie`.
   * @param {string} name - Nombre de la cookie.
   * @returns {string|null} Valor de la cookie, o null.
   */
  function getCookie(cookieString, name) {
    if (typeof cookieString !== "string") {
      return null;
    }
    for (const part of cookieString.split(";")) {
      const eq = part.indexOf("=");
      if (eq !== -1 && part.slice(0, eq).trim() === name) {
        return part.slice(eq + 1).trim();
      }
    }
    return null;
  }

  /**
   * @param {string} cookieString - Valor de `document.cookie`.
   * @returns {string|null} Cookie SAPISID (o su variante 3P), o null.
   */
  function getSapisid(cookieString) {
    return (
      getCookie(cookieString, "SAPISID") ||
      getCookie(cookieString, "__Secure-3PAPISID") ||
      null
    );
  }

  /**
   * @param {Object|null} ytcfg - Configuración de la página.
   * @param {string} cookieString - Valor de `document.cookie`.
   * @returns {{ loggedIn: boolean, accountId: string|null }} Sesión y cuenta.
   */
  function getSession(ytcfg, cookieString) {
    const loggedIn =
      ytcfg?.LOGGED_IN === true && getSapisid(cookieString) !== null;
    const accountId =
      typeof ytcfg?.DATASYNC_ID === "string" && ytcfg.DATASYNC_ID
        ? ytcfg.DATASYNC_ID
        : null;
    return { loggedIn, accountId };
  }

  /**
   * @param {string} algorithm - "SHA-1" o "SHA-256".
   * @param {string} text - Texto a resumir.
   * @returns {Promise<string>} Resumen en hexadecimal.
   */
  async function digestHex(algorithm, text) {
    const bytes = new TextEncoder().encode(text);
    const buffer = await crypto.subtle.digest(algorithm, bytes);
    return Array.from(new Uint8Array(buffer), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  }

  /**
   * @param {string} accountId - Identificador de cuenta (`DATASYNC_ID`).
   * @returns {Promise<string>} SHA-256 hexadecimal, para no guardar el id en claro.
   */
  function hashAccount(accountId) {
    return digestHex("SHA-256", String(accountId));
  }

  /**
   * Cabecera `Authorization` como la calcula el cliente web de YouTube.
   * @param {string} cookieString - Valor de `document.cookie`.
   * @param {{ now?: number, origin?: string }} [options] - Hora (ms) y origen.
   * @returns {Promise<{ Authorization: string }|null>} Cabeceras, o null sin SAPISID.
   */
  async function buildAuthHeaders(cookieString, options = {}) {
    const sapisid = getSapisid(cookieString);
    if (!sapisid) {
      return null;
    }
    const origin = options.origin || DEFAULT_ORIGIN;
    const timestamp = Math.floor((options.now ?? Date.now()) / 1000);
    const hash = (secret) =>
      digestHex("SHA-1", `${timestamp} ${secret} ${origin}`);
    const parts = [`SAPISIDHASH ${timestamp}_${await hash(sapisid)}`];
    const first = getCookie(cookieString, "__Secure-1PAPISID");
    const third = getCookie(cookieString, "__Secure-3PAPISID");
    if (first) {
      parts.push(`SAPISID1PHASH ${timestamp}_${await hash(first)}`);
    }
    if (third) {
      parts.push(`SAPISID3PHASH ${timestamp}_${await hash(third)}`);
    }
    return { Authorization: parts.join(" ") };
  }

  /**
   * Petición de continuación a `youtubei/v1/browse`.
   * @param {Object|null} ytcfg - Configuración de la página.
   * @param {string} token - Token de continuación.
   * @param {Object|null} authHeaders - Resultado de `buildAuthHeaders`.
   * @returns {{ url: string, init: Object }|null} Petición, o null sin contexto.
   */
  function buildBrowseRequest(ytcfg, token, authHeaders) {
    if (
      !ytcfg?.INNERTUBE_CONTEXT ||
      ytcfg.INNERTUBE_CONTEXT_CLIENT_NAME === undefined ||
      ytcfg.INNERTUBE_CONTEXT_CLIENT_NAME === null ||
      !ytcfg.INNERTUBE_CLIENT_VERSION
    ) {
      return null;
    }
    const key = ytcfg.INNERTUBE_API_KEY;
    const url = key
      ? `${BROWSE_URL}&key=${encodeURIComponent(key)}`
      : BROWSE_URL;
    const headers = {
      "Content-Type": "application/json",
      "X-Origin": DEFAULT_ORIGIN,
      "X-Goog-AuthUser": String(ytcfg.SESSION_INDEX ?? "0"),
      "X-Youtube-Client-Name": String(ytcfg.INNERTUBE_CONTEXT_CLIENT_NAME),
      "X-Youtube-Client-Version": String(ytcfg.INNERTUBE_CLIENT_VERSION),
    };
    if (ytcfg.VISITOR_DATA) {
      headers["X-Goog-Visitor-Id"] = String(ytcfg.VISITOR_DATA);
    }
    if (ytcfg.DELEGATED_SESSION_ID) {
      headers["X-Goog-PageId"] = String(ytcfg.DELEGATED_SESSION_ID);
    }
    Object.assign(headers, authHeaders);
    return {
      url,
      init: {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({
          context: ytcfg.INNERTUBE_CONTEXT,
          continuation: token,
        }),
      },
    };
  }

  const CHANNEL_RENDERERS = ["channelRenderer", "gridChannelRenderer"];
  const VIDEO_RENDERERS = ["videoRenderer", "gridVideoRenderer"];
  const VIDEO_LOCKUP_TYPE = "LOCKUP_CONTENT_TYPE_VIDEO";
  const TEXT_KEYS = ["simpleText", "text", "content"];

  /**
   * Recorre un JSON en orden de documento. Si `visit` devuelve true no se
   * desciende por ese nodo.
   * @param {*} root - Valor JSON.
   * @param {(node: Object, key: string|null) => boolean} visit - Se llama por
   *   cada objeto, con la clave por la que se llegó a él.
   */
  function walk(root, visit) {
    const stack = [[root, null]];
    while (stack.length > 0) {
      const [node, key] = stack.pop();
      if (node === null || typeof node !== "object") {
        continue;
      }
      if (!Array.isArray(node) && visit(node, key)) {
        continue;
      }
      const entries = Array.isArray(node)
        ? node.map((child) => [child, key])
        : Object.entries(node).map(([k, child]) => [child, k]);
      for (let i = entries.length - 1; i >= 0; i -= 1) {
        stack.push(entries[i]);
      }
    }
  }

  /**
   * @param {Object|null} data - JSON de una página o respuesta.
   * @returns {string|null} Token del primer `continuationCommand` de un
   *   `continuationItemRenderer`, o null.
   */
  function findContinuation(data) {
    let token = null;
    walk(data, (node, key) => {
      if (token !== null) {
        return true;
      }
      if (key === "continuationItemRenderer") {
        walk(node, (inner) => {
          const candidate = inner.continuationCommand?.token;
          if (token === null && typeof candidate === "string" && candidate) {
            token = candidate;
          }
          return token !== null;
        });
        return true;
      }
      return false;
    });
    return token;
  }

  /**
   * @param {Object|null} data - JSON de una página o respuesta.
   * @returns {boolean} true si hay algún `continuationItemRenderer`, tenga o
   *   no token reconocible (lo usa el llamante para no dar por completa una
   *   lista cuya continuación no se entiende).
   */
  function hasContinuationItem(data) {
    let found = false;
    walk(data, (node, key) => {
      if (key === "continuationItemRenderer") {
        found = true;
      }
      return found;
    });
    return found;
  }

  /**
   * @param {Object|null} data - JSON de la primera página de la lista de canales.
   * @returns {boolean} true si tiene la estructura de una lista de secciones
   *   (aunque no traiga canales: cuenta sin suscripciones).
   */
  function hasChannelList(data) {
    let found = false;
    walk(data, (node, key) => {
      if (key === "sectionListRenderer" || key === "itemSectionRenderer") {
        found = true;
      }
      return found;
    });
    return found;
  }

  /**
   * @param {Object|undefined} text - `{ simpleText }` o `{ runs: [{ text }] }`.
   * @returns {string} Texto, o "".
   */
  function readText(text) {
    if (typeof text?.simpleText === "string") {
      return text.simpleText;
    }
    if (Array.isArray(text?.runs)) {
      return text.runs.map((run) => String(run?.text ?? "")).join("");
    }
    return "";
  }

  /**
   * @param {Object} browseEndpoint - `browseEndpoint` de YouTube.
   * @returns {string|null} URL de canal normalizada, o null.
   */
  function channelUrlFrom(browseEndpoint) {
    const base = browseEndpoint?.canonicalBaseUrl;
    const id = browseEndpoint?.browseId;
    let path = null;
    if (typeof base === "string" && base) {
      path = base;
    } else if (typeof id === "string" && id.startsWith("UC")) {
      path = `/channel/${id}`;
    }
    if (path === null) {
      return null;
    }
    try {
      return YouTubeGroups.normalizeChannelUrl(
        new URL(path, DEFAULT_ORIGIN).href,
      );
    } catch {
      return null;
    }
  }

  /**
   * @param {Object} renderer - `channelRenderer` o `gridChannelRenderer`.
   * @returns {{ url: string, name: string, description: string,
   *   avatar: string|null }|null} Canal, o null si no es válido.
   */
  function readChannel(renderer) {
    const url = channelUrlFrom(renderer.navigationEndpoint?.browseEndpoint);
    const name = readText(renderer.title).trim();
    if (!url || !name) {
      return null;
    }
    const thumbnails = renderer.thumbnail?.thumbnails;
    let avatar = null;
    if (Array.isArray(thumbnails) && thumbnails.length > 0) {
      let src = thumbnails[thumbnails.length - 1]?.url;
      if (typeof src === "string" && src.startsWith("//")) {
        src = `https:${src}`;
      }
      avatar = YouTubeGroupsAvatars.normalizeAvatarUrl(src);
    }
    return {
      url,
      name,
      description: readText(renderer.descriptionSnippet),
      avatar,
    };
  }

  /**
   * Canales de una página o respuesta de continuación.
   * @param {Object|null} data - JSON de la página o de la continuación.
   * @returns {{ channels: Array<{ url: string, name: string,
   *   description: string, avatar: string|null }>,
   *   continuation: string|null }} Canales sin duplicados y token siguiente.
   */
  function parseChannels(data) {
    const channels = [];
    const seen = new Set();
    walk(data, (node, key) => {
      if (!CHANNEL_RENDERERS.includes(key)) {
        return false;
      }
      const channel = readChannel(node);
      const id = channel ? YouTubeGroups.getChannelKey(channel.url) : null;
      if (channel && !seen.has(id)) {
        seen.add(id);
        channels.push(channel);
      }
      return true;
    });
    return { channels, continuation: findContinuation(data) };
  }

  /**
   * @param {Object} item - Elemento de vídeo.
   * @returns {string|null} URL del canal (primer `browseEndpoint` útil).
   */
  function findVideoChannel(item) {
    let url = null;
    walk(item, (node, key) => {
      if (url === null && key === "browseEndpoint") {
        url = channelUrlFrom(node);
      }
      return url !== null;
    });
    return url;
  }

  /**
   * @param {Object} item - Elemento de vídeo.
   * @param {(text: string) => number|null} parseAge - Antigüedad en segundos.
   * @returns {number|null} Antigüedad en segundos, o null.
   */
  function findAge(item, parseAge) {
    const published = item.publishedTimeText
      ? parseAge(readText(item.publishedTimeText))
      : null;
    if (published !== null) {
      return published;
    }
    let age = null;
    walk(item, (node) => {
      for (const textKey of TEXT_KEYS) {
        if (age === null && typeof node[textKey] === "string") {
          age = parseAge(node[textKey]);
        }
      }
      return age !== null;
    });
    return age;
  }

  /**
   * @param {Object} item - Elemento de vídeo.
   * @returns {boolean} true si es un directo en curso.
   */
  function isLive(item) {
    let live = false;
    walk(item, (node) => {
      if (node.style === "LIVE" || node.style === "BADGE_STYLE_TYPE_LIVE_NOW") {
        live = true;
      }
      return live;
    });
    return live;
  }

  /**
   * Vídeos de una página o respuesta de continuación del feed.
   * @param {Object|null} data - JSON de la página o de la continuación.
   * @param {(text: string) => number|null} parseAge - Antigüedad en segundos.
   * @returns {{ videos: Array<{ id: string, channelUrl: string,
   *   ageSeconds: number|null }>, continuation: string|null }} Vídeos sin
   *   duplicados y token siguiente.
   */
  function parseVideos(data, parseAge) {
    const videos = [];
    const seen = new Set();
    walk(data, (node, key) => {
      const isRenderer = VIDEO_RENDERERS.includes(key);
      const isLockup =
        key === "lockupViewModel" && node.contentType === VIDEO_LOCKUP_TYPE;
      if (!isRenderer && !isLockup) {
        return false;
      }
      const id = isRenderer ? node.videoId : node.contentId;
      const channelUrl = findVideoChannel(node);
      if (
        typeof id === "string" &&
        id &&
        channelUrl &&
        !seen.has(id) &&
        !isLive(node)
      ) {
        seen.add(id);
        videos.push({ id, channelUrl, ageSeconds: findAge(node, parseAge) });
      }
      return true;
    });
    return { videos, continuation: findContinuation(data) };
  }

  return {
    parseChannels,
    parseVideos,
    hasContinuationItem,
    hasChannelList,
    extractJsonAfter,
    readInitialData,
    readYtcfg,
    getCookie,
    getSession,
    hashAccount,
    buildAuthHeaders,
    buildBrowseRequest,
  };
})();
