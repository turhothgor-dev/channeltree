// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

/**
 * Estado y cerrojo de la actualización en segundo plano (ADR 0042). Sin DOM ni red.
 * Se carga tras unsubscribes.js; solo usa otros globales dentro de funciones.
 */
const YouTubeGroupsBackgroundRefresh = (() => {
  const INTERVAL_MS = 60 * 60 * 1000;
  const RETRY_INTERVAL_MS = 10 * 60 * 1000;
  const START_DELAY_MS = 20 * 1000;
  const START_JITTER_MS = 10 * 1000;
  const CHECK_INTERVAL_MS = 5 * 60 * 1000;
  const LEASE_MS = 10 * 60 * 1000;
  const LEASE_CONFIRM_MS = 1000;
  const REQUEST_PAUSE_MS = 1500;
  const REQUEST_TIMEOUT_MS = 30 * 1000;
  const MAX_CHANNEL_PAGES = 40;
  const MAX_CHANNELS = 2000;
  const MAX_FEED_PAGES = 4;

  const defaultSleep = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  function lockKey() {
    return YouTubeGroupsStorage.KEYS.backgroundRefresh;
  }

  /**
   * @param {*} data - Valor guardado.
   * @returns {Object} Estado normalizado; lo no válido se descarta.
   */
  function normalizeRefreshState(data) {
    return YouTubeGroupsStorage.readBackgroundRefreshValue(data);
  }

  /**
   * @param {Object} state - Estado normalizado.
   * @param {number} now - Ahora (ms).
   * @param {{force?: boolean}} [options] - `force` ignora el intervalo (no el cerrojo).
   * @returns {boolean} true si toca ejecutar: sin intento previo o pasado el intervalo (10 min tras un error,
   *   una hora en el resto), y sin cerrojo vigente.
   */
  function isDue(state, now, { force = false } = {}) {
    const leased = state.lease !== null && state.lease.until > now;
    const interval =
      state.lastResult === "error" ? RETRY_INTERVAL_MS : INTERVAL_MS;
    const elapsed =
      force ||
      state.lastAttemptAt === null ||
      now - state.lastAttemptAt >= interval;

    return elapsed && !leased;
  }

  /**
   * Intenta tomar el cerrojo entre pestañas: escribe el `lease`, espera y comprueba que sigue siendo suyo.
   * @param {string} owner - Identificador de esta ejecución.
   * @param {{now?: number, sleep?: Function, force?: boolean}} [options] - `force` ignora el intervalo.
   * @returns {Promise<boolean>} true si esta ejecución tiene el cerrojo.
   */
  async function acquireLease(
    owner,
    { now = Date.now(), sleep = defaultSleep, force = false } = {},
  ) {
    const S = YouTubeGroupsStorage;
    const wrote = await S.withLock(lockKey(), async () => {
      const state = await S.getBackgroundRefresh();

      if (!isDue(state, now, { force })) {
        return false;
      }

      await S.saveBackgroundRefresh({
        ...state,
        lease: { owner, until: now + LEASE_MS },
        lastAttemptAt: now,
      });

      return true;
    });

    if (!wrote) {
      return false;
    }

    await sleep(LEASE_CONFIRM_MS);
    const confirmed = await S.getBackgroundRefresh();

    return confirmed.lease !== null && confirmed.lease.owner === owner;
  }

  /**
   * Termina una ejecución: quita el cerrojo (si es suyo) y guarda el resultado.
   * @param {string} owner - Identificador de la ejecución.
   * @param {{result: (string|null), error?: (string|null), accountHash?: (string|null), now?: number}} outcome
   * @returns {Promise<boolean>} true si el cerrojo era suyo y se guardó.
   */
  function finishRun(
    owner,
    { result, error = null, accountHash = null, now = Date.now() } = {},
  ) {
    const S = YouTubeGroupsStorage;

    return S.withLock(lockKey(), async () => {
      const state = await S.getBackgroundRefresh();

      if (state.lease === null || state.lease.owner !== owner) {
        return false;
      }

      const next = { ...state, lease: null };

      if (result !== null && result !== undefined) {
        next.lastResult = result;
        next.lastError = result === "error" ? error : null;
        if (result === "ok") {
          next.lastSuccessAt = now;
        }
      }
      if (accountHash && !state.accountHash) {
        next.accountHash = accountHash;
      }

      await S.saveBackgroundRefresh(next);

      return true;
    });
  }

  /**
   * Olvida la cuenta adoptada; la siguiente comprobación ejecuta.
   * @returns {Promise<void>}
   */
  function resetAccount() {
    const S = YouTubeGroupsStorage;

    return S.withLock(lockKey(), async () => {
      const state = await S.getBackgroundRefresh();

      await S.saveBackgroundRefresh({
        ...state,
        accountHash: null,
        lastAttemptAt: null,
      });
    });
  }

  const CHANNELS_URL = "https://www.youtube.com/feed/channels";
  const FEED_URL = "https://www.youtube.com/feed/subscriptions";

  /** Fallo controlado de una ejecución: `code` es el valor de `lastError` (o "aborted"). */
  class RefreshError extends Error {
    constructor(code) {
      super(code);
      this.code = code;
    }
  }

  function parseJson(text) {
    try {
      return JSON.parse(text);
    } catch {
      throw new RefreshError("unrecognized");
    }
  }

  /**
   * Lee la lista completa de suscripciones (fuente a) y la escribe con las funciones de siempre.
   * @param {Function} request - `(url, init) => Promise<string>`.
   * @param {{html: string, data: Object, ytcfg: Object, cookie: string, now: number}} page
   * @param {Function} onWrite - Se llama justo antes de la primera escritura de datos.
   * @returns {Promise<boolean>} false si la cuenta no tiene suscripciones (lectura correcta sin canales).
   */
  async function refreshSubscriptions(
    request,
    { data, ytcfg, cookie, now },
    onWrite,
  ) {
    const Y = YouTubeGroupsYtData;
    const found = new Map();
    // Devuelve cuántos canales nuevos aporta la página
    const add = (channels) => {
      let added = 0;

      for (const channel of channels) {
        const key = YouTubeGroups.getChannelKey(channel.url);

        if (!found.has(key)) {
          found.set(key, channel);
          added += 1;
        }
      }

      return added;
    };
    const first = Y.parseChannels(data);

    // Un marcador de continuación sin token reconocible: la lista no está entera
    if (Y.hasContinuationItem(data) && !first.continuation) {
      throw new RefreshError("unrecognized");
    }
    if (first.channels.length === 0) {
      // Cuenta sin suscripciones: estructura de lista reconocida pero vacía; no hay bajas que aplicar
      if (Y.hasChannelList(data) && !Y.hasContinuationItem(data)) {
        return false;
      }
      throw new RefreshError("unrecognized");
    }
    add(first.channels);

    let continuation = first.continuation;
    let pages = 1;

    while (
      continuation &&
      pages < MAX_CHANNEL_PAGES &&
      found.size < MAX_CHANNELS
    ) {
      const auth = await Y.buildAuthHeaders(cookie);
      const built = Y.buildBrowseRequest(ytcfg, continuation, auth);

      if (!built) {
        throw new RefreshError("unrecognized");
      }
      const response = parseJson(await request(built.url, built.init));
      const page = Y.parseChannels(response);

      // Sin canales nuevos o con continuación ilegible no se puede dar la lista por leída
      if (
        add(page.channels) === 0 ||
        (Y.hasContinuationItem(response) && !page.continuation)
      ) {
        throw new RefreshError("unrecognized");
      }
      continuation = page.continuation;
      pages += 1;
    }

    // Solo una lista leída entera da bajas (ADR 0035); con tope alcanzado solo hay altas.
    const complete = !continuation;
    const observed = new Map();
    const avatars = new Map();
    const names = new Map();

    for (const [key, channel] of found) {
      observed.set(key, {
        name: channel.name,
        url: channel.url,
        description: channel.description,
      });
      names.set(key, channel.name);
      if (channel.avatar) {
        avatars.set(key, channel.avatar);
      }
    }

    onWrite();
    await YouTubeGroupsSubscriptions.saveObservedSubscriptions(observed);
    if (avatars.size > 0) {
      await YouTubeGroupsAvatars.saveObservedAvatars(avatars);
    }
    if (complete) {
      await YouTubeGroupsUnsubscribes.applyUnsubscribes(names, { now });
    }

    return true;
  }

  /**
   * Lee las primeras páginas del feed de suscripciones (fuente b) y escribe vídeos nuevos y actividad.
   * No reconoce ningún grupo: leer en segundo plano no pone a 0 ningún número.
   * @param {Function} request - `(url, init) => Promise<string>`.
   * @param {{ytcfg: Object, cookie: string, now: number, lastSuccessAt: (number|null)}} context
   * @returns {Promise<void>}
   */
  async function refreshFeed(request, { ytcfg, cookie, now, lastSuccessAt }) {
    const Y = YouTubeGroupsYtData;
    const parseAge = YouTubeGroupsMetadata.parseAge;
    const html = await request(FEED_URL, { credentials: "include" });
    const data = Y.readInitialData(html);

    if (!data) {
      throw new RefreshError("unrecognized");
    }
    const feedCfg = Y.readYtcfg(html) || ytcfg;
    const first = Y.parseVideos(data, parseAge);

    if (first.videos.length === 0) {
      throw new RefreshError("unrecognized");
    }

    const found = new Map();
    const add = (videos) => {
      for (const video of videos) {
        if (!found.has(video.id)) {
          found.set(video.id, video);
        }
      }
    };
    // Sigue solo si lo más antiguo de la última página es posterior a la última lectura correcta.
    const reachesNew = (videos) => {
      const ages = videos
        .map((video) => video.ageSeconds)
        .filter((age) => typeof age === "number");

      return (
        lastSuccessAt !== null &&
        ages.length > 0 &&
        now - Math.max(...ages) * 1000 > lastSuccessAt
      );
    };

    add(first.videos);

    let page = first;
    let pages = 1;

    while (
      page.continuation &&
      pages < MAX_FEED_PAGES &&
      reachesNew(page.videos)
    ) {
      const auth = await Y.buildAuthHeaders(cookie);
      const built = Y.buildBrowseRequest(feedCfg, page.continuation, auth);

      if (!built) {
        throw new RefreshError("unrecognized");
      }
      const nextData = parseJson(await request(built.url, built.init));

      page = Y.parseVideos(nextData, parseAge);
      add(page.videos);
      pages += 1;
    }

    const batch = new Map();
    const observations = new Map();

    for (const [id, video] of found) {
      batch.set(id, {
        channelUrl: video.channelUrl,
        seenAt: now,
        ageSeconds: video.ageSeconds,
      });
      if (typeof video.ageSeconds === "number") {
        const published = now - video.ageSeconds * 1000;
        const previous = observations.get(video.channelUrl);

        if (previous === undefined || published > previous) {
          observations.set(video.channelUrl, published);
        }
      }
    }

    await YouTubeGroupsNewVideos.saveFeedBatch(batch);
    await YouTubeGroupsChannelActivity.saveObservations(observations, {
      feedVisited: true,
    });
  }

  /**
   * Una ejecución de la actualización en segundo plano (comprobaciones previas y ambas fuentes).
   * No lanza: devuelve el resultado para `finishRun`.
   * @param {Object} options
   * @param {Function} options.fetch - `(url, init) => Promise<{ok, status, text()}>`.
   * @param {string} [options.cookie] - `document.cookie`.
   * @param {number} [options.now] - Ahora (ms).
   * @param {Function} [options.sleep] - Espera inyectable.
   * @param {Function} [options.isEnabled] - Se consulta antes de cada petición.
   * @param {Object} [options.state] - Estado guardado (para `accountHash`).
   * @param {number} [options.timeoutMs] - Tope por petición.
   * @returns {Promise<{result: (string|null), error: (string|null), accountHash: (string|null)}>}
   */
  async function runRefresh({
    fetch,
    cookie = "",
    now = Date.now(),
    sleep = defaultSleep,
    isEnabled = () => true,
    state = normalizeRefreshState(null),
    timeoutMs = REQUEST_TIMEOUT_MS,
  } = {}) {
    const Y = YouTubeGroupsYtData;
    let requests = 0;
    let adopted = null;

    async function request(url, init) {
      if (requests > 0) {
        await sleep(REQUEST_PAUSE_MS);
      }
      if (!isEnabled()) {
        throw new RefreshError("aborted");
      }
      requests += 1;

      let timer = null;

      try {
        const timeout = new Promise((resolve, reject) => {
          timer = setTimeout(
            () => reject(new RefreshError("network")),
            timeoutMs,
          );
        });
        const response = await Promise.race([fetch(url, init), timeout]);

        if (!response || !response.ok) {
          throw new RefreshError("http");
        }

        return await Promise.race([response.text(), timeout]);
      } catch (error) {
        throw error instanceof RefreshError
          ? error
          : new RefreshError("network");
      } finally {
        clearTimeout(timer);
      }
    }

    try {
      if (!isEnabled()) {
        throw new RefreshError("aborted");
      }
      const html = await request(CHANNELS_URL, { credentials: "include" });
      const data = Y.readInitialData(html);
      const ytcfg = Y.readYtcfg(html);

      if (!data || !ytcfg) {
        throw new RefreshError("unrecognized");
      }

      const session = Y.getSession(ytcfg, cookie);

      if (!session.loggedIn) {
        return { result: "no-session", error: null, accountHash: null };
      }
      if (!session.accountId) {
        throw new RefreshError("unrecognized");
      }

      const accountHash = await Y.hashAccount(session.accountId);

      if (state.accountHash && state.accountHash !== accountHash) {
        return { result: "account-mismatch", error: null, accountHash: null };
      }

      const hasChannels = await refreshSubscriptions(
        request,
        { data, ytcfg, cookie, now },
        () => {
          // Si la fuente a escribe algo, la cuenta se adopta aunque la ejecución acabe en error
          adopted = accountHash;
        },
      );

      if (hasChannels) {
        await refreshFeed(request, {
          ytcfg,
          cookie,
          now,
          lastSuccessAt: state.lastSuccessAt,
        });
      }

      return { result: "ok", error: null, accountHash };
    } catch (error) {
      if (error instanceof RefreshError && error.code === "aborted") {
        return { result: null, error: null, accountHash: null };
      }

      // Solo el código: nunca cookies, cabeceras ni el identificador de la cuenta.
      const code = error instanceof RefreshError ? error.code : "unrecognized";

      console.error("[ChannelTree] Actualización en segundo plano:", code);

      return { result: "error", error: code, accountHash: adopted };
    }
  }

  return {
    runRefresh,
    INTERVAL_MS,
    RETRY_INTERVAL_MS,
    START_DELAY_MS,
    START_JITTER_MS,
    CHECK_INTERVAL_MS,
    LEASE_MS,
    LEASE_CONFIRM_MS,
    REQUEST_PAUSE_MS,
    REQUEST_TIMEOUT_MS,
    MAX_CHANNEL_PAGES,
    MAX_CHANNELS,
    MAX_FEED_PAGES,
    normalizeRefreshState,
    isDue,
    acquireLease,
    finishRun,
    resetAccount,
  };
})();
