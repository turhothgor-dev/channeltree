// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

/**
 * Sección "Ajustes" del menú de la guía (ADR 0032): vídeos vistos, vídeos fuera
 * del filtro y marcado automático al reproducir. Los cambios se guardan con
 * `YouTubeGroupsSettings.updateSettings` y las pestañas de YouTube los aplican
 * al ver el cambio en el almacenamiento. Solo toca el DOM de su contenedor y
 * no usa innerHTML.
 */
const YouTubeGroupsSettingsSection = (() => {
  /** Etiqueta visible de cada valor, por clave de ajuste. */
  const LABELS = Object.freeze({
    watchedMode: Object.freeze({
      show: "Mostrar",
      dim: "Atenuar",
      hide: "Ocultar",
    }),
    outsideMode: Object.freeze({ hide: "Ocultar", dim: "Atenuar" }),
    autoMarkPercent: Object.freeze({
      0: "Desactivado",
      50: "Al 50 %",
      80: "Al 80 %",
      95: "Al 95 %",
    }),
  });

  /**
   * Crea un elemento con clase y texto opcional.
   * @param {string} tag - Etiqueta.
   * @param {string} className - Clase CSS.
   * @param {string} [text] - Texto.
   * @returns {HTMLElement} Elemento.
   */
  function el(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  }

  /**
   * Crea la sección dentro de un contenedor.
   * @param {HTMLElement} container - Elemento donde se pinta.
   * @param {{onAccountReset?: function(): *, onRefreshNow?: function(): *}} [options] - `onAccountReset` se
   *   llama tras "Usar esta cuenta"; `onRefreshNow` al pulsar "Actualizar ahora".
   * @returns {Readonly<{load: function(): Promise<void>,
   *   applyStoredValue: function(*): void}>} Componente.
   */
  function create(container, options = {}) {
    const S = YouTubeGroupsSettings;
    const definitions = [
      {
        key: "watchedMode",
        label: "Vídeos vistos",
        values: S.WATCHED_MODES,
      },
      {
        key: "outsideMode",
        label: "Vídeos fuera del filtro",
        values: S.OUTSIDE_MODES,
      },
      {
        key: "autoMarkPercent",
        label: "Marcar visto al reproducir",
        values: S.AUTO_MARK_PERCENTS,
      },
    ];

    const errorEl = el("p", "youtube-groups__settings-error");
    errorEl.setAttribute("role", "alert");
    errorEl.hidden = true;
    container.replaceChildren();

    /** Ajustes mostrados (los últimos leídos o guardados). */
    let current = S.DEFAULT_SETTINGS;
    const selects = {};
    /** Claves con un guardado en curso (su selector sigue deshabilitado). */
    const saving = new Set();
    for (const def of definitions) {
      const label = el("label", "youtube-groups__setting");
      const select = el("select", "youtube-groups__settings-select");
      select.dataset.setting = def.key;
      select.disabled = true;
      for (const value of def.values) {
        const option = document.createElement("option");
        option.value = String(value);
        option.textContent = LABELS[def.key][value];
        select.append(option);
      }
      select.value = String(current[def.key]);
      label.append(el("span", "", def.label), select);
      container.append(label);
      selects[def.key] = select;
      select.addEventListener("change", () => change(def.key));
    }

    const badgeRow = el("label", "youtube-groups__setting");
    const badgeInput = el("input", "youtube-groups__settings-new-badge");
    badgeInput.type = "checkbox";
    badgeInput.checked = current.showNewBadge;
    badgeInput.disabled = true;
    badgeRow.append(
      el("span", "", "Marcar vídeos nuevos en las miniaturas"),
      badgeInput,
    );

    const accentRow = el("div", "youtube-groups__setting");
    const accentInput = el("input", "youtube-groups__settings-color");
    accentInput.type = "color";
    accentInput.setAttribute("aria-label", "Color de acento");
    accentInput.value = current.accentColor;
    accentInput.disabled = true;
    const accentReset = el(
      "button",
      "youtube-groups__settings-color-reset youtube-groups__text-button youtube-groups__text-button--small",
      "Restablecer",
    );
    accentReset.type = "button";
    accentReset.setAttribute("aria-label", "Restablecer el color de acento");
    accentReset.disabled = true;
    const accentControls = el(
      "span",
      "youtube-groups__settings-color-controls",
    );
    accentControls.append(accentInput, accentReset);
    accentRow.append(el("span", "", "Color de acento"), accentControls);

    const refreshRow = el("label", "youtube-groups__setting");
    const refreshInput = el("input", "youtube-groups__settings-refresh");
    refreshInput.type = "checkbox";
    refreshInput.checked = current.backgroundRefresh;
    refreshInput.disabled = true;
    refreshRow.append(
      el("span", "", "Actualizar en segundo plano"),
      refreshInput,
    );
    const refreshStatusEl = el("p", "youtube-groups__settings-refresh-status");
    refreshStatusEl.setAttribute("aria-live", "polite");
    const refreshAccountButton = el(
      "button",
      "youtube-groups__settings-refresh-account youtube-groups__text-button",
      "Usar esta cuenta",
    );
    refreshAccountButton.type = "button";
    refreshAccountButton.hidden = true;
    const refreshNowButton = el(
      "button",
      "youtube-groups__settings-refresh-now youtube-groups__text-button",
      "Actualizar ahora",
    );
    refreshNowButton.type = "button";
    refreshNowButton.disabled = true;
    /** Ajustes leídos (la casilla y el botón siguen deshabilitados hasta entonces). */
    let loaded = false;
    /** Una petición de "Actualizar ahora" en curso desde esta sección. */
    let refreshNowPending = false;
    /** Último estado de `youtubeBackgroundRefresh` leído (normalizado). */
    let refreshState = YouTubeGroupsStorage.readBackgroundRefreshValue(null);
    container.append(
      badgeRow,
      accentRow,
      refreshRow,
      refreshStatusEl,
      refreshNowButton,
      refreshAccountButton,
      errorEl,
    );
    renderRefreshStatus();
    refreshAccountButton.addEventListener("click", () => useThisAccount());
    refreshNowButton.addEventListener("click", () => refreshNow());
    refreshInput.addEventListener("change", () => changeRefresh());
    badgeInput.addEventListener("change", () => changeBadge());
    accentInput.addEventListener("change", () =>
      changeAccent(accentInput.value),
    );
    accentReset.addEventListener("click", () =>
      changeAccent(S.DEFAULT_ACCENT_COLOR),
    );

    /**
     * Actualiza el estado del control de color según el valor y el guardado.
     * @param {boolean} enabled - Si se puede editar (ya leído y sin guardar).
     * @returns {void}
     */
    function syncAccentControls(enabled) {
      accentInput.disabled = !enabled;
      accentReset.disabled =
        !enabled || accentInput.value === S.DEFAULT_ACCENT_COLOR;
    }

    /**
     * Guarda el color de acento; si falla, restaura el anterior.
     * @param {string} color - Color `#rrggbb`.
     * @returns {Promise<void>}
     */
    async function changeAccent(color) {
      setError("");
      accentInput.value = color;
      syncAccentControls(false);
      saving.add("accentColor");
      try {
        const result = await S.updateSettings({ accentColor: color });
        reflect(result.settings);
      } catch (error) {
        console.error("[ChannelTree] No se pudo guardar el ajuste", error);
        accentInput.value = current.accentColor;
        setError("No se pudo guardar el ajuste: " + error.message);
      } finally {
        saving.delete("accentColor");
        syncAccentControls(true);
      }
    }

    /**
     * Guarda la casilla de la marca "Nuevo"; si falla, la devuelve a su
     * valor anterior.
     * @returns {Promise<void>}
     */
    async function changeBadge() {
      setError("");
      badgeInput.disabled = true;
      saving.add("showNewBadge");
      try {
        const result = await S.updateSettings({
          showNewBadge: badgeInput.checked,
        });
        reflect(result.settings);
      } catch (error) {
        console.error("[ChannelTree] No se pudo guardar el ajuste", error);
        badgeInput.checked = current.showNewBadge;
        setError("No se pudo guardar el ajuste: " + error.message);
      } finally {
        saving.delete("showNewBadge");
        badgeInput.disabled = false;
      }
    }

    /**
     * Guarda la casilla de actualización en segundo plano; si falla, la
     * devuelve a su valor anterior.
     * @returns {Promise<void>}
     */
    async function changeRefresh() {
      setError("");
      refreshInput.disabled = true;
      saving.add("backgroundRefresh");
      try {
        const result = await S.updateSettings({
          backgroundRefresh: refreshInput.checked,
        });
        reflect(result.settings);
      } catch (error) {
        console.error("[ChannelTree] No se pudo guardar el ajuste", error);
        refreshInput.checked = current.backgroundRefresh;
        setError("No se pudo guardar el ajuste: " + error.message);
      } finally {
        saving.delete("backgroundRefresh");
        refreshInput.disabled = false;
      }
    }

    /**
     * Texto de una antigüedad ("hace menos de 1 min", "hace 5 min"...).
     * @param {number} since - Instante pasado (ms).
     * @returns {string} Texto relativo a ahora.
     */
    function ago(since) {
      const minutes = Math.floor(Math.max(0, Date.now() - since) / 60000);
      if (minutes < 1) {
        return "hace menos de 1 min";
      }
      if (minutes < 60) {
        return `hace ${minutes} min`;
      }
      const hours = Math.floor(minutes / 60);
      if (hours < 24) {
        return `hace ${hours} h`;
      }
      return `hace ${Math.floor(hours / 24)} días`;
    }

    /**
     * Pinta la línea de estado de la actualización en segundo plano.
     * @returns {void}
     */
    function renderRefreshStatus() {
      const state = refreshState;
      const running =
        state.lease !== null &&
        state.lease.until > Date.now() &&
        current.backgroundRefresh;
      let text;
      if (!current.backgroundRefresh) {
        text = "Desactivada";
      } else if (running) {
        text = "Actualizando…";
      } else if (state.lastResult === null && state.lastSuccessAt === null) {
        text = "Aún no se ha actualizado";
      } else if (state.lastResult === "no-session") {
        text = "Sin sesión en YouTube: no se actualiza";
      } else if (state.lastResult === "account-mismatch") {
        text = "En pausa: has entrado con otra cuenta de YouTube";
      } else if (state.lastResult === "error") {
        const reasons = {
          network: "YouTube no responde",
          http: "YouTube no responde",
          unrecognized: "YouTube ha cambiado su página",
          unsupported: "este Firefox no lo permite",
        };
        const when = ago(state.lastAttemptAt ?? Date.now());
        text = `No se pudo actualizar (${when}): ${reasons[state.lastError] ?? "error desconocido"}`;
        if (state.lastSuccessAt !== null) {
          text += `. Última correcta ${ago(state.lastSuccessAt)}`;
        }
      } else {
        text = `Actualizado ${ago(state.lastSuccessAt)}`;
      }
      refreshStatusEl.textContent = text;
      refreshAccountButton.hidden =
        !current.backgroundRefresh || state.lastResult !== "account-mismatch";
      refreshNowButton.disabled =
        !loaded || !current.backgroundRefresh || running || refreshNowPending;
    }

    /**
     * Lanza una ejecución inmediata ignorando el intervalo (respeta cerrojo, ajuste y cuenta).
     * @returns {Promise<void>}
     */
    async function refreshNow() {
      setError("");
      refreshNowPending = true;
      renderRefreshStatus();
      try {
        await options.onRefreshNow?.();
      } catch (error) {
        console.error("[ChannelTree] No se pudo actualizar ahora", error);
        setError("No se pudo actualizar: " + error.message);
      } finally {
        refreshNowPending = false;
        renderRefreshStatus();
      }
    }

    /**
     * Adopta la cuenta de YouTube actual (olvida la anterior).
     * @returns {Promise<void>}
     */
    async function useThisAccount() {
      setError("");
      refreshAccountButton.disabled = true;
      try {
        await YouTubeGroupsBackgroundRefresh.resetAccount();
        // Comprobación inmediata: la persona espera ver la cuenta adoptada ya
        Promise.resolve(options.onAccountReset?.()).catch((error) => {
          console.error("[ChannelTree] Comprobación inmediata", error);
        });
      } catch (error) {
        console.error("[ChannelTree] No se pudo cambiar de cuenta", error);
        setError("No se pudo cambiar de cuenta: " + error.message);
      } finally {
        refreshAccountButton.disabled = false;
      }
    }

    /**
     * Aplica un valor de `youtubeBackgroundRefresh` (de `storage.onChanged`).
     * @param {*} raw - Valor nuevo (sin normalizar).
     * @returns {void}
     */
    function applyRefreshStatus(raw) {
      refreshState = YouTubeGroupsStorage.readBackgroundRefreshValue(raw);
      renderRefreshStatus();
    }

    /**
     * Muestra u oculta el error de la sección.
     * @param {string} message - Texto; vacío lo oculta.
     * @returns {void}
     */
    function setError(message) {
      errorEl.textContent = message;
      errorEl.hidden = !message;
    }

    /**
     * Refleja unos ajustes en los tres selectores.
     * @param {Object} settings - Ajustes normalizados.
     * @returns {void}
     */
    function reflect(settings) {
      current = settings;
      for (const def of definitions) {
        selects[def.key].value = String(settings[def.key]);
      }
      refreshInput.checked = settings.backgroundRefresh;
      badgeInput.checked = settings.showNewBadge;
      accentInput.value = settings.accentColor;
      accentReset.disabled =
        accentInput.disabled || accentInput.value === S.DEFAULT_ACCENT_COLOR;
      renderRefreshStatus();
    }

    /**
     * Guarda el cambio de un selector; si falla, restaura su valor anterior.
     * @param {string} key - Clave del ajuste.
     * @returns {Promise<void>}
     */
    async function change(key) {
      const select = selects[key];
      setError("");
      select.disabled = true;
      saving.add(key);
      try {
        const raw = select.value;
        const result = await S.updateSettings({
          [key]: key === "autoMarkPercent" ? Number(raw) : raw,
        });
        reflect(result.settings);
      } catch (error) {
        console.error("[ChannelTree] No se pudo guardar el ajuste", error);
        select.value = String(current[key]);
        setError("No se pudo guardar el ajuste: " + error.message);
      } finally {
        saving.delete(key);
        select.disabled = false;
      }
    }

    /**
     * Lee los ajustes guardados y habilita los selectores.
     * @returns {Promise<void>}
     */
    async function load() {
      try {
        reflect(await S.getSettings());
        setError("");
        for (const select of Object.values(selects)) {
          select.disabled = false;
        }
        syncAccentControls(true);
        refreshInput.disabled = false;
        badgeInput.disabled = false;
        loaded = true;
        renderRefreshStatus();
      } catch (error) {
        console.error("[ChannelTree] No se pudieron leer los ajustes", error);
        setError("No se pudieron leer los ajustes: " + error.message);
      }
      try {
        applyRefreshStatus(await YouTubeGroupsStorage.getBackgroundRefresh());
      } catch (error) {
        console.error("[ChannelTree] No se pudo leer el estado", error);
      }
    }

    /**
     * Aplica un valor de `youtubeSettings` llegado de `storage.onChanged`.
     * @param {*} raw - Valor nuevo (sin normalizar).
     * @returns {void}
     */
    function applyStoredValue(raw) {
      reflect(S.normalizeSettings(YouTubeGroupsStorage.readSettingsValue(raw)));
      setError("");
      for (const [key, select] of Object.entries(selects)) {
        select.disabled = saving.has(key);
      }
      syncAccentControls(!saving.has("accentColor"));
      refreshInput.disabled = saving.has("backgroundRefresh");
      badgeInput.disabled = saving.has("showNewBadge");
    }

    return Object.freeze({ load, applyStoredValue, applyRefreshStatus });
  }

  return Object.freeze({ create });
})();
