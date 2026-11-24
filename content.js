// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

(() => {
  "use strict";

  console.log("[ChannelTree] content.js cargado");

  const { getGroups, saveGroups, getAvatars, getSubscriptions } =
    YouTubeGroupsStorage;

  const {
    createGroup,
    deleteGroup,
    renameGroup,
    setChannelGroups,
    createSubGroup, // Nueva función
    deleteSubGroup, // Nueva función
    getSubGroups, // Nueva función
    getAllGroupsAndSubGroups, // Nueva función
  } = YouTubeGroups;

  /**
   * Contexto compartido entre los componentes de la interfaz. `state` reúne el
   * estado que leen o escriben varios componentes; los espacios de nombres
   * (`cards`, `watched`, `dropdowns`, `player`, `guide`, `panel`) son las API de
   * los componentes de `ui/`.
   */
  const ctx = {
    state: {
      /** Vídeos vistos en memoria; null hasta cargarlos (sin datos no se marca nada). */
      watchedVideos: null,
      /** Mensaje del error al leer los vistos; null si no ha fallado. */
      watchedLoadError: null,
      /** Número de la última operación de vistos iniciada. */
      watchedWriteSeq: 0,
      /** Número de la última operación de vistos cuyo resultado se aplicó. */
      watchedAppliedSeq: 0,
      /** Ajustes en memoria; valores por defecto hasta cargar los guardados. */
      settings: YouTubeGroupsSettings.DEFAULT_SETTINGS,
      /** Si los ajustes guardados ya se han leído. */
      settingsLoaded: false,
      /** Claves de la selección activa (`[]` es "todos"). */
      activeSelection: [],
      /** Unión de los canales de la selección (`null` sin selección o cargando). */
      activeSelectionUrls: null,
      /** Si `activeSelectionUrls` son canales a excluir ("Sin grupo"). */
      activeSelectionExclude: false,
      /** Filtros avanzados activos (en memoria; se pierden al recargar). */
      advancedFilters: { duration: "any", age: "any", views: "any" },
      /** Avatares de canal guardados (`clave de canal` → URL de imagen). */
      avatars: {},
      /** Suscripciones conocidas (`clave de canal` → datos; para "Sin grupo (N)"). */
      subscriptions: {},
      /** Vídeos nuevos por grupo (id de grupo → número; solo los > 0). */
      newVideoCounts: new Map(),
      /** Ids de los vídeos nuevos que llevan la marca "Nuevo" en su miniatura. */
      newVideoIds: new Set(),
      /** Canales ocultos (`clave de canal` → datos). */
      hiddenChannels: {},
      /** Claves de los canales ocultos. */
      hiddenChannelKeys: new Set(),
    },
    setActiveSelection,
    refreshActiveSelection,
    renderGroupsPanel,
    navigateToSubscriptions,
  };
  ctx.avatars = YouTubeGroupsAvatarsUi.create(ctx);
  ctx.subscriptions = YouTubeGroupsSubscriptionsUi.create(ctx);
  ctx.newVideos = YouTubeGroupsNewVideosUi.create(ctx);
  ctx.activity = YouTubeGroupsChannelActivityUi.create(ctx);
  ctx.cards = YouTubeGroupsCards.create(ctx);
  ctx.watched = YouTubeGroupsWatchedUi.create(ctx);
  ctx.toast = YouTubeGroupsToast.create(ctx);
  ctx.dropdowns = YouTubeGroupsDropdowns.create(ctx);
  ctx.player = YouTubeGroupsPlayer.create(ctx);
  ctx.guide = YouTubeGroupsGuideSection.create(ctx);
  ctx.panel = YouTubeGroupsPanel.create(ctx);
  ctx.refresh = YouTubeGroupsBackgroundRefreshUi.create(ctx);

  getGroups().catch((error) => {
    console.error(
      "[ChannelTree] No se pudo inicializar el almacenamiento",
      error,
    );
  });

  YouTubeGroupsSettings.getSettings()
    .then((loaded) => {
      ctx.state.settings = loaded;
      ctx.state.settingsLoaded = true;
      YouTubeGroupsAccent.applyAccent(document, loaded.accentColor);
      ctx.cards.applyVisibilityToAllCards();
      ctx.cards.applyNewVideoBadgesToAllCards();
    })
    .catch((error) => {
      console.error("[ChannelTree] No se pudieron leer los ajustes", error);
    });

  ctx.watched.start();
  ctx.newVideos.start();
  ctx.activity.start();
  ctx.refresh.start();

  let filterUpdateVersion = 0;

  /**
   * Cambia la selección activa y la aplica. No hace nada si es igual,
   * elemento a elemento.
   * @param {unknown} selection - Selección (se normaliza).
   */
  function setActiveSelection(selection) {
    const next = YouTubeGroupsFilter.normalizeSelection(selection);
    if (
      next.length === ctx.state.activeSelection.length &&
      next.every((key, index) => key === ctx.state.activeSelection[index])
    ) {
      return;
    }

    const previous = ctx.state.activeSelection;
    ctx.state.activeSelection = next;
    // Al salir del filtro, el grupo anterior y sus subgrupos dejan de ser
    // nuevos (ADR 0043). Si la nueva selección está dentro del subárbol de
    // un grupo anterior, su propio subárbol se reconocerá al salir de ella.
    ctx.newVideos.acknowledgeExit(previous, Date.now(), next);
    // Sin selección, no quedan URLs de una selección anterior
    if (next.length === 0) {
      ctx.state.activeSelectionUrls = null;
      ctx.state.activeSelectionExclude = false;
    }

    refreshActiveSelection();

    renderGroupsPanel().catch((error) => {
      console.error(
        "[ChannelTree] No se pudo actualizar el filtro activo",
        error,
      );
    });
  }

  async function renderGroupsPanel() {
    const [groups, avatars, subscriptions, storedHidden] = await Promise.all([
      getGroups(),
      getAvatars(),
      getSubscriptions(),
      YouTubeGroupsStorage.getHiddenChannels(),
    ]);
    const Hidden = YouTubeGroupsHiddenChannels;
    const hidden = Hidden.normalizeHiddenChannels(storedHidden);
    const hiddenKeys = Hidden.getHiddenKeys(hidden);
    const previousKeys = ctx.state.hiddenChannelKeys;
    const hiddenChanged =
      hiddenKeys.size !== previousKeys.size ||
      [...hiddenKeys].some((key) => !previousKeys.has(key));
    ctx.state.hiddenChannels = hidden;
    ctx.state.hiddenChannelKeys = hiddenKeys;
    ctx.state.avatars = avatars;
    ctx.state.subscriptions = subscriptions;
    ctx.newVideos.setGroups(groups);
    ctx.activity.setChannels(groups, subscriptions);
    ctx.avatars.setGroupedChannels(groups, subscriptions);
    ctx.avatars.scheduleScan({ guide: true });
    ctx.cards.refreshChannelNameIndex(
      groups,
      Hidden.listHiddenChannels(hidden),
    );
    if (hiddenChanged) {
      ctx.cards.applyVisibilityToAllCards();
    }
    ctx.cards.refreshChannelColorIndex(groups);

    ctx.guide.renderGuideSection(groups);
  }

  /**
   * Lleva a `/feed/subscriptions` conservando la selección por si la página
   * se recarga entera (ADR 0009).
   * @param {string[]} selection - Selección ya elegida.
   */
  function navigateToSubscriptions(selection) {
    try {
      sessionStorage.setItem(
        YouTubeGroupsFilter.PENDING_FILTER_KEY,
        YouTubeGroupsFilter.serializePendingSelection(selection, Date.now()),
      );
    } catch (error) {
      console.warn(
        "[ChannelTree] No se pudo guardar la selección pendiente",
        error,
      );
    }

    const link = document.querySelector(
      'ytd-guide-renderer a[href="/feed/subscriptions"], ytd-mini-guide-renderer a[href="/feed/subscriptions"]',
    );
    if (link) {
      link.click();
    } else {
      window.location.assign("/feed/subscriptions");
    }
  }

  /**
   * Lee y borra el filtro pendiente; lo aplica si estamos en suscripciones.
   */
  function consumePendingFilter() {
    let text = null;
    try {
      text = sessionStorage.getItem(YouTubeGroupsFilter.PENDING_FILTER_KEY);
      sessionStorage.removeItem(YouTubeGroupsFilter.PENDING_FILTER_KEY);
    } catch (error) {
      return;
    }

    if (
      YouTubeGroupsPages.getPageType(window.location.pathname) !==
      "subscriptions"
    ) {
      return;
    }

    const pending = YouTubeGroupsFilter.parsePendingSelection(text, Date.now());
    if (pending) {
      setActiveSelection(pending);
    }
  }

  /**
   * Recupera los reconocimientos de salida que una recarga anterior dejó en
   * `sessionStorage` y los aplica (ADR 0043).
   */
  function consumeExitAcks() {
    let text = null;
    try {
      text = sessionStorage.getItem(YouTubeGroupsNewVideos.EXIT_ACK_KEY);
      sessionStorage.removeItem(YouTubeGroupsNewVideos.EXIT_ACK_KEY);
    } catch (error) {
      return;
    }
    if (text === null) {
      return;
    }
    const acks = YouTubeGroupsNewVideos.parseExitAcks(text, Date.now());
    if (acks.size > 0) {
      ctx.newVideos.restoreAcks(acks);
    }
  }

  // Al recargar o cerrar con un filtro activo, se reconoce la salida y se
  // guarda lo pendiente. Con un traspaso pendiente la selección continúa.
  window.addEventListener("pagehide", () => {
    let handover = false;
    try {
      // Un traspaso caducado o inválido no cuenta: no continuará la selección
      const text = sessionStorage.getItem(
        YouTubeGroupsFilter.PENDING_FILTER_KEY,
      );
      handover =
        text !== null &&
        YouTubeGroupsFilter.parsePendingSelection(text, Date.now()) !== null;
    } catch (error) {
      handover = false;
    }
    if (!handover) {
      ctx.newVideos.acknowledgeExit(ctx.state.activeSelection);
    }
    const unsaved = ctx.newVideos.getUnsavedAcks();
    if (unsaved.size > 0) {
      try {
        sessionStorage.setItem(
          YouTubeGroupsNewVideos.EXIT_ACK_KEY,
          YouTubeGroupsNewVideos.serializeExitAcks(unsaved, Date.now()),
        );
      } catch (error) {
        // sessionStorage no disponible: se intenta solo el volcado
      }
    }
    ctx.newVideos.flushPending().catch(() => {});
  });

  /** Borra el filtro pendiente de `sessionStorage`. */
  function clearPendingFilter() {
    try {
      sessionStorage.removeItem(YouTubeGroupsFilter.PENDING_FILTER_KEY);
    } catch (error) {
      // sessionStorage no disponible: nada que borrar
    }
  }

  async function refreshActiveSelection() {
    const updateVersion = ++filterUpdateVersion;
    const selection = ctx.state.activeSelection;

    // Sin selección no hay URLs que aplicar
    if (selection.length === 0) {
      ctx.state.activeSelectionUrls = null;
      ctx.state.activeSelectionExclude = false;
      ctx.cards.showAllVideoCards();
      return;
    }

    // Con selección no se toca el filtro actual hasta tener los grupos,
    // para no mostrar todas las tarjetas mientras tanto.
    try {
      const groups = await getGroups();
      if (
        updateVersion !== filterUpdateVersion ||
        selection !== ctx.state.activeSelection
      ) {
        return;
      }

      // Unión de los canales de lo seleccionado que sigue existiendo
      const resolved = YouTubeGroupsFilter.resolveSelection(groups, selection);
      if (resolved.selection.length !== selection.length) {
        console.warn(
          "[ChannelTree][FILTER] Elementos del filtro no encontrados",
          // Solo las claves que de verdad no existen (con selección única,
          // las demás se descartan por no ser la primera válida)
          selection.filter(
            (key) =>
              YouTubeGroupsFilter.resolveSelection(groups, [key]).selection
                .length === 0,
          ),
        );
        // El cambio de selección dispara su propio refresco (con lo que
        // queda, o mostrando todo si no queda nada).
        setActiveSelection(resolved.selection);
        return;
      }

      ctx.state.activeSelectionUrls = resolved.urls;
      ctx.state.activeSelectionExclude = resolved.exclude === true;
      ctx.cards.filterAllDetectedCards();
    } catch (error) {
      console.error(
        "[ChannelTree][FILTER] No se pudo aplicar el filtro",
        error,
      );
    }
  }

  ctx.guide.start();

  ctx.player.start();

  const observer = new MutationObserver((mutations) => {
    ctx.guide.noteMutations(mutations);
    ctx.player.noteMutations();
    for (const mutation of mutations) {
      if (mutation.target instanceof Element) {
        ctx.cards.scheduleContainingCard(mutation.target);
        if (
          ctx.cards.nodeBelongsToCurrentVideoOwner(mutation.target) ||
          mutation.target.localName === "ytd-reel-video-renderer"
        ) {
          ctx.player.schedulePlayerControlSync();
        }
      }

      for (const node of mutation.addedNodes) {
        ctx.cards.scheduleCardsIn(node);
        if (ctx.cards.nodeBelongsToCurrentVideoOwner(node)) {
          ctx.player.schedulePlayerControlSync();
        }
      }
    }
    ctx.guide.checkPlacement();
    ctx.avatars.noteMutations(mutations);
    ctx.subscriptions.noteMutations(mutations);
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["href", "is-active"],
  });

  // La lista de canales puede pintarse antes de yt-navigate-finish: el
  // reinicio de "lista fresca" se hace al empezar la navegación.
  document.addEventListener("yt-navigate-start", () => {
    ctx.subscriptions.beginNavigation();
  });

  // YouTube is a SPA: cards can be reutilizadas entre navegaciones internas.
  document.addEventListener("yt-navigate-finish", () => {
    clearPendingFilter();
    ctx.cards.resetDetectedCards();
    ctx.subscriptions.startVisit();
    ctx.cards.scanDocument();
    ctx.subscriptions.scheduleGuideRead();
    refreshActiveSelection();
    renderGroupsPanel().catch((error) => {
      console.error(
        "[ChannelTree] No se pudo actualizar el panel de grupos",
        error,
      );
    });
  });

  ctx.cards.scanDocument();
  ctx.subscriptions.scheduleGuideRead();
  consumePendingFilter();
  consumeExitAcks();
  refreshActiveSelection();
  renderGroupsPanel().catch((error) => {
    console.error("[ChannelTree] No se pudo cargar el panel de grupos", error);
  });

  // Ensure all cards are filtered properly after initialization
  setTimeout(() => {
    ctx.cards.filterAllDetectedCards();
  }, 100);

  /**
   * Aplica a la caché y a la interfaz los cambios que otra pestaña (o esta
   * misma) ha guardado en el almacenamiento (ADR 0006).
   * @param {Object} changes - Objeto `changes` de `storage.onChanged`.
   * @param {string} areaName - Área de almacenamiento del evento.
   */
  function handleStorageChange(changes, areaName) {
    const storage = YouTubeGroupsStorage;
    const keys = storage.getChangedKeys(changes, areaName);

    for (const name of keys) {
      const newValue = changes[storage.KEYS[name]].newValue;
      try {
        if (name === "sync") {
          const before = storage.readSyncValue(
            changes[storage.KEYS[name]].oldValue,
          );
          const after = storage.readSyncValue(newValue);
          if (
            after.lastReceivedAt !== null &&
            (before.lastReceivedAt === null ||
              after.lastReceivedAt > before.lastReceivedAt)
          ) {
            ctx.toast.show(
              "Grupos y ajustes actualizados desde otro dispositivo",
            );
          } else if (
            after.status === "too-big" &&
            before.status !== "too-big"
          ) {
            ctx.toast.show(
              "Sincronización desactivada: los grupos ya no caben en la cuota de Firefox",
            );
          }
        } else if (name === "watched") {
          ctx.state.watchedVideos = storage.readWatchedValue(newValue);
          ctx.state.watchedLoadError = null;
          ctx.state.watchedAppliedSeq = ctx.state.watchedWriteSeq;
          for (const card of document.querySelectorAll(
            ctx.cards.VIDEO_CARD_SELECTOR,
          )) {
            ctx.watched.applyWatchedToCard(card);
          }
          ctx.newVideos.recount();
        } else if (name === "newVideos") {
          ctx.newVideos.applyStoredValue(newValue);
        } else if (name === "settings") {
          ctx.state.settings = YouTubeGroupsSettings.normalizeSettings(
            storage.readSettingsValue(newValue),
          );
          ctx.state.settingsLoaded = true;
          YouTubeGroupsAccent.applyAccent(
            document,
            ctx.state.settings.accentColor,
          );
          ctx.cards.applyVisibilityToAllCards();
          ctx.cards.applyNewVideoBadgesToAllCards();
          ctx.panel.applyStoredSettings(newValue);
        } else if (name === "backgroundRefresh") {
          ctx.panel.applyRefreshStatus(newValue);
        } else if (name === "groups") {
          refreshActiveSelection().catch((error) => {
            console.error(
              "[ChannelTree] No se pudo refrescar el filtro",
              error,
            );
          });
          renderGroupsPanel().catch((error) => {
            console.error(
              "[ChannelTree] No se pudo repintar los grupos",
              error,
            );
          });
        } else if (name === "avatars" || name === "hiddenChannels") {
          renderGroupsPanel().catch((error) => {
            console.error(
              "[ChannelTree] No se pudo repintar los avatares",
              error,
            );
          });
        } else if (name === "subscriptions") {
          ctx.subscriptions.noteStoredSubscriptionsChange(
            changes[storage.KEYS[name]].oldValue,
            newValue,
          );
          renderGroupsPanel().catch((error) => {
            console.error(
              "[ChannelTree] No se pudo repintar las suscripciones",
              error,
            );
          });
        } else if (name === "playlists") {
          ctx.panel.renderPlaylistsSection().catch((error) => {
            console.error(
              "[ChannelTree] No se pudo repintar las listas",
              error,
            );
          });
          const modal = document.querySelector(
            ".youtube-groups__channel-list-modal--playlist",
          );
          if (modal) {
            const playlists = storage.readPlaylistsValue(newValue);
            const playlistId = modal.dataset.playlistId;
            if (playlists.some((item) => item.id === playlistId)) {
              ctx.panel
                .openPlaylistVideosModal(playlistId, {
                  onlyIfOpen: true,
                })
                .catch((error) => {
                  console.error(
                    "[ChannelTree] No se pudo repintar el modal",
                    error,
                  );
                });
            } else {
              ctx.panel.closePlaylistModal();
            }
          }
        }
      } catch (error) {
        console.error(
          "[ChannelTree] No se pudo aplicar el cambio de " + name,
          error,
        );
      }
    }
  }

  browser.storage.onChanged.addListener(handleStorageChange);

  /**
   * Atiende los mensajes del fondo. Con "youtube-groups:clear-selection" vacía
   * la selección de la pestaña (sin navegar) y avisa; sin selección, nada.
   * @param {unknown} message - Mensaje recibido.
   * @returns {undefined} No responde.
   */
  function handleRuntimeMessage(message) {
    if (
      message?.type === "youtube-groups:clear-selection" &&
      ctx.state.activeSelection.length > 0
    ) {
      setActiveSelection([]);
      ctx.toast.show("Selección limpiada");
    }
    return undefined;
  }

  browser.runtime.onMessage.addListener(handleRuntimeMessage);
})();
