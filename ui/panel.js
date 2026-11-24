// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

/**
 * Menú de opciones "ChannelTree" (ADR 0017): listas, filtros y ajustes
 * (ADR 0032), con los atajos de teclado dentro de Ajustes, leídos al abrir el
 * menú (ADR 0033); la copia de seguridad y la limpieza viven en la página de
 * opciones (ADR 0025). Se crea con `create(ctx)`;
 * no toca el DOM hasta que se abre por primera vez con `openMenu`/`toggleMenu`.
 */
const YouTubeGroupsPanel = (() => {
  /**
   * Crea el componente del menú.
   * @param {Object} ctx - Contexto compartido de `content.js`.
   * @returns {Readonly<Object>} API: `toggleMenu`, `openMenu`, `closeMenu`,
   *   `isMenuOpen`, `applyStoredSettings`, `renderPlaylistsSection`,
   *   `openPlaylistVideosModal` y `closePlaylistModal`.
   */
  function create(ctx) {
    const GROUPS_PANEL_ID = "youtube-groups-menu";

    /** Engranaje con el que se abrió el menú (para el foco y `aria-expanded`). */
    let menuAnchor = null;
    let menuResizeObserver = null;

    /** Sección "Ajustes" del menú; `null` hasta crear el menú. */
    let settingsSection = null;

    /** Subapartado de atajos dentro de Ajustes; `null` hasta crear el menú. */
    let shortcutsSection = null;

    /**
     * Refleja en la sección "Ajustes" un valor de `youtubeSettings` llegado
     * de `storage.onChanged`. Sin menú creado no hace nada (al crearlo, la
     * sección lee el valor actual).
     * @param {*} raw - Valor nuevo (sin normalizar).
     * @returns {void}
     */
    function applyStoredSettings(raw) {
      if (settingsSection) {
        settingsSection.applyStoredValue(raw);
      }
    }

    /**
     * Refleja en la sección "Ajustes" un valor de `youtubeBackgroundRefresh`
     * llegado de `storage.onChanged`. Sin menú creado no hace nada.
     * @param {*} raw - Valor nuevo (sin normalizar).
     * @returns {void}
     */
    function applyRefreshStatus(raw) {
      if (settingsSection) {
        settingsSection.applyRefreshStatus(raw);
      }
    }

    /**
     * Refleja `advancedFilters` en los selectores de la sección "Filtros" y
     * pone el resumen "Filtros (N)" con N criterios activos.
     * @param {Element} panel - Panel de grupos.
     */
    function syncFiltersControls(panel) {
      let active = 0;
      for (const select of panel.querySelectorAll(
        ".youtube-groups__filter-select",
      )) {
        const value = ctx.state.advancedFilters[select.dataset.filter];
        select.value = value;
        if (value !== "any") {
          active += 1;
        }
      }
      panel.querySelector('[data-tab="filtros"]').textContent =
        active > 0 ? `Filtros (${active})` : "Filtros";
    }

    const TAB_IDS = ["listas", "filtros", "ajustes"];
    const TAB_STORAGE_KEY = "youtubeGroupsMenuTab";

    /**
     * Última pestaña guardada en `sessionStorage`; `listas` si no hay, es
     * desconocida o el almacenamiento lanza.
     * @returns {string} Id de pestaña.
     */
    function readStoredTab() {
      try {
        const stored = window.sessionStorage.getItem(TAB_STORAGE_KEY);
        return TAB_IDS.includes(stored) ? stored : "listas";
      } catch {
        return "listas";
      }
    }

    /**
     * Activa una pestaña del menú: marca la pestaña, muestra solo su panel y,
     * con `focus`, le mueve el foco.
     * @param {Element} panel - Menú.
     * @param {string} id - `listas`, `filtros` o `ajustes`.
     * @param {{focus?: boolean}} [options] - `focus`: foco a la pestaña.
     */
    function activateTab(panel, id, { focus = false } = {}) {
      const current = panel.querySelector('[role="tab"][aria-selected="true"]');
      const changed = current && current.dataset.tab !== id;
      if (changed) {
        try {
          window.sessionStorage.setItem(TAB_STORAGE_KEY, id);
        } catch {
          // Preferencia de vista: sin almacenamiento se pierde sin avisar.
        }
      }
      for (const tabId of TAB_IDS) {
        const tab = panel.querySelector(`[data-tab="${tabId}"]`);
        const active = tabId === id;
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;
        panel.querySelector(`#youtube-groups-menu-panel-${tabId}`).hidden =
          !active;
        if (active && focus) {
          tab.focus();
        }
      }
      if (changed && !panel.hidden && menuAnchor?.isConnected) {
        positionMenu(panel, menuAnchor);
      }
    }

    /**
     * Crea el menú (oculto) y lo añade a `body`. Si ya existe, lo devuelve.
     * @returns {HTMLElement|null} Menú, o `null` si aún no hay `body`.
     */
    function createMenu() {
      const existingPanel = document.getElementById(GROUPS_PANEL_ID);
      if (existingPanel) {
        return existingPanel;
      }

      if (!document.body) {
        return null;
      }

      const panel = document.createElement("div");
      panel.id = GROUPS_PANEL_ID;
      panel.className = "youtube-groups__menu";
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-labelledby", "youtube-groups-menu-title");
      panel.tabIndex = -1;
      panel.hidden = true;
      panel.innerHTML = `
          <div class="youtube-groups__menu-header">
            <h2 id="youtube-groups-menu-title" class="youtube-groups__menu-title">Opciones de visualización</h2>
            <div class="youtube-groups__menu-tabs" role="tablist" aria-label="Secciones de opciones">
              <button class="youtube-groups__menu-tab" type="button" role="tab" data-tab="listas" id="youtube-groups-menu-tab-listas" aria-controls="youtube-groups-menu-panel-listas">Listas</button>
              <button class="youtube-groups__menu-tab" type="button" role="tab" data-tab="filtros" id="youtube-groups-menu-tab-filtros" aria-controls="youtube-groups-menu-panel-filtros">Filtros</button>
              <button class="youtube-groups__menu-tab" type="button" role="tab" data-tab="ajustes" id="youtube-groups-menu-tab-ajustes" aria-controls="youtube-groups-menu-panel-ajustes">Ajustes</button>
            </div>
          </div>
          <div class="youtube-groups__menu-panel youtube-groups__playlists" role="tabpanel" tabindex="0" id="youtube-groups-menu-panel-listas" aria-labelledby="youtube-groups-menu-tab-listas">
            <button class="youtube-groups__play-visible youtube-groups__text-button" type="button">Reproducir lo visible</button>
            <p class="youtube-groups__play-visible-message" aria-live="polite"></p>
            <form class="youtube-groups__playlist-form">
              <input class="youtube-groups__playlist-input" type="text" name="playlistName" placeholder="Nueva lista" maxlength="80" required>
              <button class="youtube-groups__playlist-create-button youtube-groups__text-button" type="submit">Crear</button>
            </form>
            <ul class="youtube-groups__playlist-list"></ul>
            <p class="youtube-groups__playlist-error" aria-live="polite"></p>
          </div>
          <div class="youtube-groups__menu-panel youtube-groups__filters" role="tabpanel" tabindex="0" id="youtube-groups-menu-panel-filtros" aria-labelledby="youtube-groups-menu-tab-filtros">
            <label class="youtube-groups__setting">
              <span>Duración</span>
              <select class="youtube-groups__filter-select" data-filter="duration"></select>
            </label>
            <label class="youtube-groups__setting">
              <span>Fecha</span>
              <select class="youtube-groups__filter-select" data-filter="age"></select>
            </label>
            <label class="youtube-groups__setting">
              <span>Popularidad</span>
              <select class="youtube-groups__filter-select" data-filter="views"></select>
            </label>
            <button class="youtube-groups__filters-reset youtube-groups__text-button" type="button">Quitar filtros</button>
          </div>
          <div class="youtube-groups__menu-panel youtube-groups__settings" role="tabpanel" tabindex="0" id="youtube-groups-menu-panel-ajustes" aria-labelledby="youtube-groups-menu-tab-ajustes">
            <div class="youtube-groups__settings-body"></div>
            <div class="youtube-groups__shortcuts-section"></div>
          </div>
        `;

      const tabs = Array.from(panel.querySelectorAll('[role="tab"]'));
      for (const tab of tabs) {
        tab.addEventListener("click", () =>
          activateTab(panel, tab.dataset.tab),
        );
        tab.addEventListener("keydown", (event) => {
          const index = TAB_IDS.indexOf(tab.dataset.tab);
          let target;
          if (event.key === "ArrowRight") {
            target = (index + 1) % TAB_IDS.length;
          } else if (event.key === "ArrowLeft") {
            target = (index - 1 + TAB_IDS.length) % TAB_IDS.length;
          } else if (event.key === "Home") {
            target = 0;
          } else if (event.key === "End") {
            target = TAB_IDS.length - 1;
          } else {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          activateTab(panel, TAB_IDS[target], { focus: true });
        });
      }
      activateTab(panel, readStoredTab());

      settingsSection = YouTubeGroupsSettingsSection.create(
        panel.querySelector(".youtube-groups__settings-body"),
        {
          onAccountReset: () => ctx.refresh?.check(),
          onRefreshNow: () => ctx.refresh?.check({ force: true }),
        },
      );
      settingsSection.load();

      shortcutsSection = YouTubeGroupsShortcutsSection.create(
        panel.querySelector(".youtube-groups__shortcuts-section"),
      );

      const playVisibleMessage = panel.querySelector(
        ".youtube-groups__play-visible-message",
      );
      panel
        .querySelector(".youtube-groups__play-visible")
        .addEventListener("click", () => {
          playVisibleMessage.textContent = "";
          const entries = [];
          for (const card of document.querySelectorAll(
            ctx.cards.VIDEO_CARD_SELECTOR,
          )) {
            const id = card.getAttribute(ctx.cards.VIDEO_ID_ATTRIBUTE);
            if (!id) {
              continue;
            }
            entries.push({
              id,
              visible: card.checkVisibility(),
              hidden: card.classList.contains("youtube-groups--hidden"),
              dimmed: card.classList.contains("youtube-groups--dimmed"),
              watched: card.classList.contains(ctx.cards.WATCHED_CLASS),
            });
          }
          const url = YouTubeGroupsPlaylists.buildWatchVideosUrl(
            YouTubeGroupsPlaylists.selectQueueIds(entries),
          );
          if (url) {
            window.location.assign(url);
          } else {
            playVisibleMessage.textContent = "No hay vídeos visibles sin ver.";
          }
        });

      panel
        .querySelector(".youtube-groups__playlist-form")
        .addEventListener("submit", async (event) => {
          event.preventDefault();
          const playlistInput = panel.querySelector(
            ".youtube-groups__playlist-input",
          );
          const playlistError = panel.querySelector(
            ".youtube-groups__playlist-error",
          );
          playlistError.textContent = "";
          try {
            await YouTubeGroupsPlaylists.createPlaylist(playlistInput.value);
            playlistInput.value = "";
            await renderPlaylistsSection();
          } catch (exception) {
            playlistError.textContent = exception.message;
          }
        });

      const filterSelects = panel.querySelectorAll(
        ".youtube-groups__filter-select",
      );
      for (const select of filterSelects) {
        const key = select.dataset.filter;
        for (const option of YouTubeGroupsMetadata.FILTER_OPTIONS[key]) {
          const optionElement = document.createElement("option");
          optionElement.value = option.id;
          optionElement.textContent = option.label;
          select.append(optionElement);
        }
        select.addEventListener("change", () => {
          ctx.state.advancedFilters[key] = select.value;
          syncFiltersControls(panel);
          ctx.cards.applyVisibilityToAllCards();
        });
      }
      panel
        .querySelector(".youtube-groups__filters-reset")
        .addEventListener("click", () => {
          for (const key of Object.keys(ctx.state.advancedFilters)) {
            ctx.state.advancedFilters[key] = "any";
          }
          syncFiltersControls(panel);
          ctx.cards.applyVisibilityToAllCards();
        });
      syncFiltersControls(panel);

      document.body.append(panel);
      renderPlaylistsSection();
      return panel;
    }

    /**
     * Indica si el menú existe y está visible.
     * @returns {boolean} `true` si está abierto.
     */
    function isMenuOpen() {
      const menu = document.getElementById(GROUPS_PANEL_ID);
      return menu !== null && !menu.hidden;
    }

    /**
     * Coloca el menú a la derecha del engranaje (o dentro de la ventana).
     * @param {HTMLElement} menu - Menú visible.
     * @param {Element} anchor - Engranaje.
     */
    function positionMenu(menu, anchor) {
      const rect = anchor.getBoundingClientRect();
      const size = menu.getBoundingClientRect();
      const position = YouTubeGroupsGuide.getMenuPosition(
        rect,
        { width: size.width, height: size.height },
        { width: window.innerWidth, height: window.innerHeight },
      );
      menu.style.left = position.left + "px";
      menu.style.top = position.top + "px";
    }

    function onMenuKeydown(event) {
      if (event.key !== "Escape" || !isMenuOpen()) {
        return;
      }
      if (document.querySelector(".youtube-groups__channel-list-modal")) {
        return;
      }
      event.preventDefault();
      const anchor = menuAnchor;
      closeMenu();
      if (anchor?.isConnected) {
        anchor.focus();
      }
    }

    function onMenuPointerDown(event) {
      const menu = document.getElementById(GROUPS_PANEL_ID);
      const target = event.target;
      if (
        !menu ||
        !(target instanceof Node) ||
        menu.contains(target) ||
        menuAnchor?.contains(target) ||
        (target instanceof Element &&
          target.closest(
            ".youtube-groups__channel-list-modal, #youtube-groups-toast",
          ))
      ) {
        return;
      }
      closeMenu();
    }

    /** Cierra el menú, si está abierto, conservando el estado de sus secciones. */
    function closeMenu() {
      const menu = document.getElementById(GROUPS_PANEL_ID);
      if (!menu || menu.hidden) {
        return;
      }
      menu.hidden = true;
      menuAnchor?.setAttribute("aria-expanded", "false");
      document.removeEventListener("keydown", onMenuKeydown, true);
      document.removeEventListener("pointerdown", onMenuPointerDown, true);
      document.removeEventListener("yt-navigate-start", closeMenu);
      window.removeEventListener("resize", closeMenu);
      menuResizeObserver?.disconnect();
      menuResizeObserver = null;
    }

    /**
     * Abre el menú junto al engranaje (lo crea la primera vez).
     * @param {Element} anchor - Engranaje que lo abre.
     */
    function openMenu(anchor) {
      if (!anchor?.isConnected) {
        closeMenu();
        return;
      }
      const menu = createMenu();
      if (!menu) {
        return;
      }
      if (menuAnchor && menuAnchor !== anchor) {
        menuAnchor.setAttribute("aria-expanded", "false");
      }
      menuAnchor = anchor;
      if (menu.hidden) {
        document.addEventListener("keydown", onMenuKeydown, true);
        document.addEventListener("pointerdown", onMenuPointerDown, true);
        document.addEventListener("yt-navigate-start", closeMenu);
        window.addEventListener("resize", closeMenu);
        shortcutsSection.load();
      }
      menu.hidden = false;
      positionMenu(menu, anchor);
      if (!menuResizeObserver && typeof window.ResizeObserver === "function") {
        menuResizeObserver = new window.ResizeObserver(() => {
          if (menuAnchor?.isConnected && !menu.hidden) {
            positionMenu(menu, menuAnchor);
          }
        });
        menuResizeObserver.observe(menu);
      }
      anchor.setAttribute("aria-expanded", "true");
      menu.focus();
    }

    /**
     * Abre el menú si está cerrado y lo cierra si está abierto.
     * @param {Element} anchor - Engranaje pulsado.
     */
    function toggleMenu(anchor) {
      if (isMenuOpen()) {
        closeMenu();
      } else {
        openMenu(anchor);
      }
    }

    /**
     * Muestra un error en la sección "Listas" del panel.
     *
     * @param {Error|string} error - Error o mensaje a mostrar.
     */
    function showPlaylistError(error) {
      const errorElement = document.querySelector(
        `#${GROUPS_PANEL_ID} .youtube-groups__playlist-error`,
      );
      if (errorElement) {
        errorElement.textContent =
          error instanceof Error ? error.message : String(error);
      }
    }

    /**
     * Muestra un aviso con "Deshacer" para una operación ya aplicada.
     *
     * @param {string} message - Texto del aviso.
     * @param {{before: *, after: *}|null} undo - Instantánea; si es `null` no
     *   hace nada.
     * @param {Function} revert - Recibe `undo` y devuelve `{ status }`.
     * @param {string} subject - Sujeto del mensaje de estado ("las listas").
     * @param {Function} after - Repinta lo afectado tras deshacer.
     */
    function offerUndo(message, undo, revert, subject, after) {
      if (!undo) {
        return;
      }
      ctx.toast.show(message, {
        onAction: async () => {
          try {
            const { status } = await revert(undo);
            await after();
            ctx.toast.show(YouTubeGroupsUndo.describeStatus(status, subject));
          } catch (error) {
            console.error("[ChannelTree] No se pudo deshacer", error);
            ctx.toast.show("No se pudo deshacer: " + error.message);
          }
        },
      });
    }

    /**
     * Cierra el modal de vídeos de una lista, si está abierto.
     */
    function closePlaylistModal() {
      document
        .querySelector(".youtube-groups__channel-list-modal--playlist")
        ?.remove();
    }

    /**
     * Abre (o repinta) el modal con los vídeos de una lista.
     *
     * @param {string} playlistId - ID de la lista a mostrar.
     * @param {{ onlyIfOpen?: boolean }} [options] - Con `onlyIfOpen`, no hace nada
     *   si el modal de esa lista ya no está abierto.
     */
    async function openPlaylistVideosModal(
      playlistId,
      { onlyIfOpen = false } = {},
    ) {
      const playlists = await YouTubeGroupsStorage.getPlaylists();
      const playlist = playlists.find((item) => item.id === playlistId);
      if (onlyIfOpen) {
        const openModal = document.querySelector(
          ".youtube-groups__channel-list-modal--playlist",
        );
        if (!openModal || openModal.dataset.playlistId !== playlistId) {
          return;
        }
      }
      closePlaylistModal();
      if (!playlist) {
        return;
      }

      const modal = document.createElement("div");
      modal.className =
        "youtube-groups__channel-list-modal youtube-groups__channel-list-modal--playlist";
      modal.dataset.playlistId = playlistId;
      const content = document.createElement("div");
      content.className = "youtube-groups__channel-list-content";

      const header = document.createElement("div");
      header.className = "youtube-groups__channel-list-header";
      const headerTitle = document.createElement("h3");
      headerTitle.textContent = "Vídeos de la lista";
      const closeButton = document.createElement("button");
      closeButton.className =
        "youtube-groups__close-channels-button youtube-groups__icon-button";
      closeButton.type = "button";
      closeButton.textContent = "×";
      closeButton.addEventListener("click", closePlaylistModal);
      header.append(headerTitle, closeButton);

      const listTitle = document.createElement("h4");
      listTitle.textContent = `${playlist.name} (${playlist.videos.length})`;

      const clearButton = document.createElement("button");
      clearButton.type = "button";
      clearButton.className =
        "youtube-groups__playlist-clear-button youtube-groups__text-button";
      clearButton.textContent = "Vaciar lista";
      clearButton.disabled = playlist.videos.length === 0;
      clearButton.addEventListener("click", async () => {
        try {
          const { undo } =
            await YouTubeGroupsPlaylists.clearPlaylist(playlistId);
          await openPlaylistVideosModal(playlistId);
          await renderPlaylistsSection();
          const emptied = undo?.before.find((item) => item.id === playlistId);
          offerUndo(
            `Lista «${playlist.name}» vaciada (${emptied ? emptied.videos.length : 0} vídeos)`,
            undo,
            YouTubeGroupsPlaylists.revertPlaylistsAndSave,
            "las listas",
            refreshPlaylists,
          );
        } catch (exception) {
          showPlaylistError(exception);
        }
      });

      const list = document.createElement("ul");
      for (const video of playlist.videos) {
        const item = document.createElement("li");
        item.className = "youtube-groups__playlist-video";
        const url = YouTubeGroupsPlaylists.buildVideoUrl(video.id);
        const title = video.title || video.id;
        let titleElement;
        if (url) {
          titleElement = document.createElement("a");
          titleElement.href = url;
        } else {
          titleElement = document.createElement("span");
        }
        titleElement.textContent = title;
        const channel = document.createElement("span");
        channel.className = "youtube-groups__playlist-video-channel";
        channel.textContent = video.channelName;
        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className =
          "youtube-groups__playlist-remove-button youtube-groups__text-button youtube-groups__text-button--small";
        removeButton.textContent = "Quitar";
        removeButton.addEventListener("click", async () => {
          try {
            const { undo } =
              await YouTubeGroupsPlaylists.removeVideoFromPlaylist(
                playlistId,
                video.id,
              );
            await openPlaylistVideosModal(playlistId);
            await renderPlaylistsSection();
            offerUndo(
              `«${title}» quitado de «${playlist.name}»`,
              undo,
              YouTubeGroupsPlaylists.revertPlaylistsAndSave,
              "las listas",
              refreshPlaylists,
            );
          } catch (exception) {
            showPlaylistError(exception);
          }
        });
        item.append(titleElement, channel, removeButton);
        list.append(item);
      }

      content.append(header, listTitle, clearButton, list);
      modal.append(content);
      modal.addEventListener("click", (event) => {
        if (event.target === modal) {
          closePlaylistModal();
        }
      });
      document.body.append(modal);
    }

    /** Repinta la sección "Listas" y el modal de vídeos si está abierto. */
    async function refreshPlaylists() {
      const modal = document.querySelector(
        ".youtube-groups__channel-list-modal--playlist",
      );
      if (modal) {
        await openPlaylistVideosModal(modal.dataset.playlistId, {
          onlyIfOpen: true,
        });
      }
      await renderPlaylistsSection();
    }

    /**
     * Pinta la lista de listas de vídeos en la sección "Listas" del panel.
     */
    async function renderPlaylistsSection() {
      const panel = document.getElementById(GROUPS_PANEL_ID);
      const listElement = panel?.querySelector(
        ".youtube-groups__playlist-list",
      );
      if (!listElement) {
        return;
      }

      let playlists;
      try {
        playlists = await YouTubeGroupsStorage.getPlaylists();
      } catch (exception) {
        showPlaylistError(exception);
        return;
      }
      listElement.replaceChildren();

      for (const playlist of playlists) {
        const item = document.createElement("li");
        item.className = "youtube-groups__playlist-item";

        const label = document.createElement("span");
        label.className = "youtube-groups__playlist-name";
        label.textContent = `${playlist.name} (${playlist.videos.length})`;

        const actions = document.createElement("div");
        actions.className = "youtube-groups__playlist-actions";

        const viewButton = document.createElement("button");
        viewButton.type = "button";
        viewButton.className =
          "youtube-groups__text-button youtube-groups__text-button--small";
        viewButton.textContent = "Ver";
        viewButton.addEventListener("click", async () => {
          try {
            await openPlaylistVideosModal(playlist.id);
          } catch (exception) {
            showPlaylistError(exception);
          }
        });
        actions.append(viewButton);

        const playUrl = YouTubeGroupsPlaylists.buildPlayAllUrl(playlist);
        if (playUrl) {
          const playLink = document.createElement("a");
          playLink.className =
            "youtube-groups__playlist-play youtube-groups__text-button youtube-groups__text-button--small";
          playLink.href = playUrl;
          playLink.textContent = "Reproducir";
          actions.append(playLink);
        }

        const renameButton = document.createElement("button");
        renameButton.type = "button";
        renameButton.className =
          "youtube-groups__text-button youtube-groups__text-button--small";
        renameButton.textContent = "Renombrar";
        renameButton.addEventListener("click", async () => {
          const newName = prompt("Nuevo nombre de la lista:", playlist.name);
          if (newName === null) {
            return;
          }
          try {
            await YouTubeGroupsPlaylists.renamePlaylist(playlist.id, newName);
            await renderPlaylistsSection();
          } catch (exception) {
            showPlaylistError(exception);
          }
        });

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className =
          "youtube-groups__text-button youtube-groups__text-button--small";
        deleteButton.textContent = "Eliminar";
        deleteButton.addEventListener("click", async () => {
          try {
            const { undo } = await YouTubeGroupsPlaylists.deletePlaylist(
              playlist.id,
            );
            closePlaylistModal();
            await renderPlaylistsSection();
            offerUndo(
              `Lista «${playlist.name}» eliminada`,
              undo,
              YouTubeGroupsPlaylists.revertPlaylistsAndSave,
              "las listas",
              refreshPlaylists,
            );
          } catch (exception) {
            showPlaylistError(exception);
          }
        });
        actions.append(renameButton, deleteButton);

        item.append(label, actions);
        listElement.append(item);
      }
    }

    return Object.freeze({
      toggleMenu,
      openMenu,
      closeMenu,
      isMenuOpen,
      applyStoredSettings,
      applyRefreshStatus,
      renderPlaylistsSection,
      openPlaylistVideosModal,
      closePlaylistModal,
    });
  }

  return Object.freeze({ create });
})();
