// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

/**
 * Programación de la actualización en segundo plano en la pestaña (ADR 0042):
 * temporizadores, visibilidad, ajuste y adaptador de `content.fetch` y
 * `document.cookie`. La lógica de cada ejecución está en
 * `modules/background-refresh.js`. Se crea con `create(ctx, options)`; no hace
 * nada hasta `start()`.
 */
const YouTubeGroupsBackgroundRefreshUi = (() => {
  /**
   * `fetch` con la sesión de la página, o `null` si este Firefox no lo ofrece.
   * Orden: (a) `content.fetch` si existe; (b) `window.wrappedJSObject.fetch`
   * (MV3 de Firefox), con `init` clonado hacia la página; (c) `null`.
   * La respuesta de la página (Xray) se copia a un objeto propio.
   * @returns {Function|null}
   */
  function defaultFetch() {
    const clone = (init) =>
      typeof cloneInto === "function" ? cloneInto(init, window) : init;

    if (
      typeof content !== "undefined" &&
      typeof content?.fetch === "function"
    ) {
      return (url, init) => content.fetch(url, clone(init));
    }

    const page = window.wrappedJSObject;

    if (page && typeof page.fetch === "function") {
      return async (url, init) => {
        const response = await page.fetch.call(page, url, clone(init));

        return {
          ok: response.ok,
          status: response.status,
          text: async () => String(await response.text()),
        };
      };
    }

    return null;
  }

  function newOwner() {
    return typeof crypto?.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
  }

  /**
   * Crea el planificador.
   * @param {Object} ctx - Contexto compartido de `content.js` (`state.settings`, `state.settingsLoaded`).
   * @param {Object} [options] - Sustitutos para las pruebas.
   * @param {Function|null} [options.fetch] - `(url, init)`; `null` = sin soporte.
   * @param {Function} [options.getCookie] - Devuelve `document.cookie`.
   * @param {Function} [options.random] - Como `Math.random`.
   * @param {number} [options.startDelayMs] - Retraso de la primera comprobación.
   * @param {number} [options.checkIntervalMs] - Cada cuánto se comprueba.
   * @param {Function} [options.sleep] - Espera inyectable.
   * @returns {Readonly<Object>} API: `start`, `stop` y `check`.
   */
  function create(ctx, options = {}) {
    const R = YouTubeGroupsBackgroundRefresh;
    const fetchFn =
      options.fetch === undefined ? defaultFetch() : options.fetch;
    const getCookie = options.getCookie || (() => document.cookie);
    const random = options.random || Math.random;
    const startDelayMs =
      options.startDelayMs === undefined
        ? R.START_DELAY_MS
        : options.startDelayMs;
    const checkIntervalMs =
      options.checkIntervalMs === undefined
        ? R.CHECK_INTERVAL_MS
        : options.checkIntervalMs;
    const sleep = options.sleep;

    let running = false;
    let startTimer = null;
    let intervalTimer = null;

    const isEnabled = () => ctx.state.settings?.backgroundRefresh !== false;

    /**
     * Una comprobación: si toca y esta pestaña consigue el cerrojo, ejecuta.
     * @param {{force?: boolean}} [opts] - `force` ignora el intervalo (no el cerrojo, el ajuste ni la cuenta).
     * @returns {Promise<void>}
     */
    async function check(opts) {
      const force = opts?.force === true;
      if (
        running ||
        document.visibilityState !== "visible" ||
        !ctx.state.settingsLoaded ||
        !isEnabled()
      ) {
        return;
      }

      running = true;

      const owner = newOwner();
      let acquired = false;
      let outcome = { result: "error", error: "unrecognized" };

      try {
        acquired = await R.acquireLease(owner, {
          force,
          ...(sleep ? { sleep } : {}),
        });

        if (!acquired) {
          return;
        }

        if (fetchFn === null) {
          outcome = { result: "error", error: "unsupported" };
          return;
        }

        const state = await YouTubeGroupsStorage.getBackgroundRefresh();

        outcome = await R.runRefresh({
          fetch: fetchFn,
          cookie: getCookie(),
          isEnabled,
          state,
          ...(sleep ? { sleep } : {}),
        });
      } catch (error) {
        console.error(
          "[ChannelTree] Actualización en segundo plano:",
          error?.code || "unrecognized",
        );
      } finally {
        if (acquired) {
          try {
            await R.finishRun(owner, outcome);
          } catch {
            console.error("[ChannelTree] No se pudo liberar el cerrojo");
          }
        }
        running = false;
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        check();
      }
    }

    /** Programa la primera comprobación, las periódicas y la de volver a ser visible. */
    function start() {
      if (startTimer !== null || intervalTimer !== null) {
        return;
      }

      startTimer = setTimeout(
        () => {
          startTimer = null;
          check();
        },
        startDelayMs + random() * R.START_JITTER_MS,
      );
      intervalTimer = setInterval(check, checkIntervalMs);
      document.addEventListener("visibilitychange", onVisibilityChange);
    }

    /** Cancela los temporizadores y el escuchador. */
    function stop() {
      clearTimeout(startTimer);
      clearInterval(intervalTimer);
      startTimer = null;
      intervalTimer = null;
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }

    return Object.freeze({ start, stop, check });
  }

  return { create };
})();
