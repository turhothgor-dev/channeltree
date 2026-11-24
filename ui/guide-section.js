// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

/**
 * Sección "ChannelTree" de la guía lateral de YouTube y guía fija en
 * suscripciones. Se crea con `create(ctx)`; no toca el DOM hasta `start()`.
 */
const YouTubeGroupsGuideSection = (() => {
  const { getGroups, getAvatars, getSubscriptions } = YouTubeGroupsStorage;
  const { createGroup, createSubGroup } = YouTubeGroups;
  const { getAvatarFor } = YouTubeGroupsAvatars;
  const {
    createIconSvg,
    createUiIconSvg,
    GROUP_ICON_SIZES,
    createGroupMark,
    setGroupBand,
    setGroupBullet,
    describeNewVideos,
    createChannelAvatar,
    AVATAR_SIZES,
  } = YouTubeGroupsIconsDom;
  const { openIconPicker } = YouTubeGroupsIconPicker;

  /**
   * Crea el componente de la guía.
   * @param {Object} ctx - Contexto compartido de `content.js`.
   * @returns {Readonly<Object>} API: `renderGuideSection`, `noteMutations`,
   *   `checkPlacement` y `start`.
   */
  function create(ctx) {
    const GUIDE_SECTIONS_SELECTOR = "ytd-guide-renderer #sections";
    const GUIDE_SECTION_ID = "youtube-groups-guide";

    /** Si ya hay una comprobación de la guía programada para el próximo frame. */
    let guideCheckScheduled = false;

    /** Estado en memoria de la guía: columna actual y listas de canales. */
    let guidePath = [];
    const guideChannelOverrides = new Map();
    /** Últimos grupos pintados en la guía (para los botones de navegación). */
    let guideGroups = [];

    /**
     * Selecciona el elemento pulsado de la guía (selección única) o, si ya
     * lo estaba, lo deselecciona.
     * @param {Object} filter - Filtro pulsado.
     */
    function toggleSelectionItem(filter) {
      const previous = ctx.state.activeSelection;
      const next = YouTubeGroupsFilter.toggleSelection(
        guideGroups,
        previous,
        filter,
      );
      ctx.setActiveSelection(next);

      const pageType = YouTubeGroupsPages.getPageType(window.location.pathname);
      if (
        YouTubeGroupsFilter.shouldNavigateOnSelect(pageType, previous, next)
      ) {
        ctx.navigateToSubscriptions(next);
      }
    }

    const MARQUEE_CLASS = "youtube-groups__guide-name--marquee";

    /**
     * Botón de la guía al que pertenece el objetivo de un evento.
     * @param {EventTarget|null} target - Objetivo del evento.
     * @returns {Element|null} El botón `.youtube-groups__guide-item` o la fila
     *   de navegación, si hay.
     */
    function getGuideItem(target) {
      return target instanceof Element
        ? target.closest(
            ".youtube-groups__guide-item, .youtube-groups__guide-nav",
          )
        : null;
    }

    /**
     * Inicia la marquesina del nombre de un botón si no cabe. Con
     * `prefers-reduced-motion: reduce` no anima: pone el nombre completo en
     * `title`.
     * @param {Element} item - Botón de la guía.
     */
    function startMarquee(item) {
      const name = item.querySelector(".youtube-groups__guide-name");
      if (!name) {
        return;
      }
      const metrics = YouTubeGroupsGuide.getMarqueeMetrics(
        name.scrollWidth,
        name.clientWidth,
      );
      if (!metrics) {
        return;
      }
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        const fullName = name.textContent;
        const url = item.getAttribute("data-channel-url");
        if (url) {
          item.title = `${fullName} · ${url}`;
        } else if (!item.title) {
          item.title = fullName;
        }
        return;
      }
      name.style.setProperty("--yg-marquee-distance", `${metrics.distance}px`);
      name.style.setProperty(
        "--yg-marquee-duration",
        `${metrics.durationMs}ms`,
      );
      name.classList.add(MARQUEE_CLASS);
    }

    /**
     * Para la marquesina del nombre de un botón y lo devuelve a su sitio.
     * @param {Element} item - Botón de la guía.
     */
    function stopMarquee(item) {
      const name = item.querySelector(".youtube-groups__guide-name");
      if (!name) {
        return;
      }
      name.classList.remove(MARQUEE_CLASS);
      name.style.removeProperty("--yg-marquee-distance");
      name.style.removeProperty("--yg-marquee-duration");
    }

    /**
     * Escuchadores delegados de la marquesina en la sección.
     * @param {Element} section - Sección de la guía.
     */
    function attachMarqueeListeners(section) {
      const onStart = (event) => {
        const item = getGuideItem(event.target);
        if (item) {
          startMarquee(item);
        }
      };
      const onStop = (event) => {
        const item = getGuideItem(event.target);
        if (
          item &&
          !(
            event.relatedTarget instanceof Node &&
            item.contains(event.relatedTarget)
          )
        ) {
          stopMarquee(item);
        }
      };
      section.addEventListener("pointerover", onStart);
      section.addEventListener("focusin", onStart);
      section.addEventListener("pointerout", onStop);
      section.addEventListener("focusout", onStop);
    }

    /**
     * Crea un botón de la sección "ChannelTree" de la guía lateral.
     * @param {string} label - Texto del botón.
     * @param {boolean} pressed - Si es el filtro activo.
     * @param {HTMLElement|null} mark - Marca del grupo, si la tiene.
     * @param {function(): void} onClick - Acción al pulsar.
     * @param {string} [extraClass] - Clase adicional.
     * @param {string} [countText] - Recuento "(N)" aparte del nombre.
     * @returns {HTMLButtonElement} Botón creado.
     */
    function createGuideButton(
      label,
      pressed,
      mark,
      onClick,
      extraClass,
      countText,
    ) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "youtube-groups__guide-item";
      if (extraClass) {
        button.classList.add(extraClass);
      }
      button.setAttribute("aria-pressed", String(pressed));
      if (mark) {
        button.append(mark);
      }
      const name = document.createElement("span");
      name.className = "youtube-groups__guide-name";
      const nameText = document.createElement("span");
      nameText.className = "youtube-groups__guide-name-text";
      nameText.textContent = label;
      name.append(nameText);
      button.append(name);
      if (countText) {
        const count = document.createElement("span");
        count.className = "youtube-groups__guide-count";
        count.textContent = countText;
        button.append(count);
      }
      button.addEventListener("click", onClick);
      return button;
    }

    /**
     * Crea la fila de un grupo en la columna de la guía: botón de desplegar,
     * botón principal y su lista de canales.
     * @param {Array<Object>} groups - Árbol de grupos.
     * @param {Object} item - Elemento de `getGuideColumn`.
     * @param {number} depth - Profundidad de la columna.
     * @returns {HTMLElement} Contenedor de la fila.
     */
    function createGuideRow(groups, item, depth) {
      const wrapper = document.createElement("div");
      wrapper.className = "youtube-groups__guide-group";

      const row = document.createElement("div");
      row.className = "youtube-groups__guide-row";

      const list = document.createElement("div");
      list.className = "youtube-groups__guide-channels";
      list.hidden = !YouTubeGroupsGuide.isChannelListOpen(
        guideChannelOverrides,
        item,
        depth,
        ctx.state.activeSelection,
      );

      const main = createGuideButton(
        item.name,
        ctx.state.activeSelection.includes(`group:${item.id}`),
        createGroupMark(groups, item.id, GROUP_ICON_SIZES.guide),
        () => toggleSelectionItem({ type: "group", id: item.id }),
      );
      main.setAttribute("data-group-id", item.id);

      // El bullet despliega la lista de canales si el grupo los tiene; si no,
      // es solo decorativo. `setGroupBullet` pinta dentro el círculo visible.
      const hasChannels = item.channels.length > 0;
      const bulletHost = document.createElement(
        hasChannels ? "button" : "span",
      );
      bulletHost.className = "youtube-groups__guide-bullet";
      bulletHost.setAttribute("data-bullet-for", item.id);
      if (hasChannels) {
        list.id = `youtube-groups-guide-channels-${String(item.id).replace(/[^\w-]/g, "_")}`;
        bulletHost.type = "button";
        const syncToggle = () => {
          const label = `${list.hidden ? "Mostrar" : "Ocultar"} canales de ${item.name}`;
          bulletHost.setAttribute("aria-expanded", String(!list.hidden));
          bulletHost.setAttribute("aria-label", label);
          bulletHost.title = label;
        };
        bulletHost.setAttribute("aria-controls", list.id);
        syncToggle();
        bulletHost.addEventListener("click", () => {
          list.hidden = !list.hidden;
          guideChannelOverrides.set(item.id, !list.hidden);
          syncToggle();
        });
      } else {
        bulletHost.setAttribute("aria-hidden", "true");
      }
      const rowAppearance = YouTubeGroups.getGroupAppearance(groups, item.id);
      const newCount = ctx.state.newVideoCounts?.get(item.id) ?? 0;
      setGroupBullet(
        bulletHost,
        rowAppearance ? rowAppearance.color : null,
        newCount,
      );
      const newDescription = describeNewVideos(newCount);
      if (newDescription) {
        main.setAttribute("aria-description", newDescription);
      }
      row.append(main, bulletHost);

      const enter = document.createElement("button");
      enter.type = "button";
      enter.className =
        "youtube-groups__guide-enter youtube-groups__icon-button youtube-groups__icon-button--small";
      enter.setAttribute("aria-label", `Ver subgrupos de ${item.name}`);
      enter.append(createUiIconSvg("chevron-right", 20));
      enter.addEventListener("click", () => {
        guidePath = YouTubeGroupsGuide.enterGuideGroup(
          groups,
          guidePath,
          item.id,
        );
        renderGuideSection(groups, "forward");
        // El "›" desaparece con la columna: el foco pasa a "‹"
        document
          .querySelector(`#${GUIDE_SECTION_ID} .youtube-groups__guide-back`)
          ?.focus();
      });
      row.append(enter);

      for (const channel of item.channels) {
        const channelButton = createGuideButton(
          channel.name,
          ctx.state.activeSelection.includes(
            YouTubeGroupsFilter.getFilterKey({
              type: "channel",
              containerId: item.id,
              url: channel.url,
            }),
          ),
          createChannelAvatar(
            channel.name,
            getAvatarFor(ctx.state.avatars, channel.url),
            AVATAR_SIZES.guide,
          ),
          () =>
            toggleSelectionItem({
              type: "channel",
              containerId: item.id,
              url: channel.url,
              name: channel.name,
            }),
          "youtube-groups__guide-channel",
        );
        channelButton.title = channel.url;
        channelButton.setAttribute("data-channel-url", channel.url);
        list.append(channelButton);
      }

      wrapper.append(row, list);
      return wrapper;
    }

    /**
     * Crea la entrada "Sin grupo" de la columna raíz (ADR 0020): un botón con
     * icono y el número de suscripciones conocidas sin grupo.
     * @param {Array<Object>} groups - Árbol de grupos.
     * @returns {HTMLElement} Contenedor de la entrada.
     */
    function createUngroupedEntry(groups) {
      const known = Object.keys(ctx.state.subscriptions || {}).length;
      const count =
        known === 0
          ? 0
          : YouTubeGroupsSubscriptions.getUnclassifiedSubscriptions(
              ctx.state.subscriptions,
              groups,
            ).length;
      let title = "Ver solo vídeos de canales que no están en ningún grupo";
      if (known > 0) {
        title += ` · ${count} ${
          count === 1
            ? "suscripción conocida sin grupo"
            : "suscripciones conocidas sin grupo"
        }`;
      }

      const wrapper = document.createElement("div");
      wrapper.className = "youtube-groups__guide-ungrouped";

      const button = createGuideButton(
        "Sin grupo",
        ctx.state.activeSelection.includes("ungrouped"),
        createUiIconSvg("ungrouped", GROUP_ICON_SIZES.guide),
        () => toggleSelectionItem(YouTubeGroupsFilter.UNGROUPED_FILTER),
        "youtube-groups__guide-item--ungrouped",
        known === 0 ? "" : ` (${count})`,
      );
      button.title = title;
      wrapper.append(button);
      return wrapper;
    }

    /** Destino del formulario de crear pintado por última vez (para vaciarlo al cambiar). */
    let guideRenderedTargetKey = null;

    /** Destino actual del botón de crear (ver `getCreateTarget`). */
    let guideCreateTarget = {
      parentId: null,
      parentName: null,
      label: "+ Grupo",
      title: "Crear grupo",
    };

    /**
     * Pasa a la columna del grupo padre tras crear un subgrupo, con animación,
     * si no se estaba ya en ella.
     * @param {string} parentId - Id del grupo padre.
     */
    async function showParentColumn(parentId) {
      const groups = await getGroups();
      const nextPath = YouTubeGroupsGuide.findGuidePath(groups, parentId);
      if (
        nextPath &&
        nextPath.join("/") !==
          YouTubeGroupsGuide.normalizeGuidePath(groups, guidePath).join("/")
      ) {
        guidePath = nextPath;
        renderGuideSection(groups, "forward");
      }
    }

    /**
     * Oculta y vacía el formulario de crear de la guía.
     * @param {Element} section - Sección de la guía.
     */
    function resetGuideCreateForm(section) {
      const form = section.querySelector(".youtube-groups__guide-form");
      if (!form) {
        return;
      }
      form.reset();
      if (form._resetAppearance) {
        form._resetAppearance();
      }
      form.hidden = true;
      form.querySelector(".youtube-groups__guide-form-error").textContent = "";
    }

    /**
     * Crea el formulario de crear grupo o subgrupo de la guía (oculto). Crea
     * en el destino de `guideCreateTarget`: un grupo en la raíz o un subgrupo
     * de su `parentId`.
     * @returns {HTMLFormElement} Formulario.
     */
    function createGuideCreateForm() {
      const form = document.createElement("form");
      form.className = "youtube-groups__guide-form";
      form.hidden = true;

      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = 80;
      input.className = "youtube-groups__guide-form-input";
      input.setAttribute("aria-label", "Nombre");
      // Evita que salten los atajos de teclado de YouTube
      input.addEventListener("keydown", (event) => event.stopPropagation());

      // Icono y color elegidos (no se escriben hasta pulsar "Guardar")
      let appearance = { iconId: "", colorHex: "" };

      const iconButton = document.createElement("button");
      iconButton.type = "button";
      iconButton.className = "youtube-groups__guide-form-icon";
      const iconPreview = document.createElement("span");
      iconPreview.className = "youtube-groups__guide-form-icon-preview";
      const iconLabel = document.createElement("span");
      iconLabel.textContent = "Icono";
      iconButton.append(iconPreview, iconLabel);

      function paintAppearance() {
        iconPreview.replaceChildren();
        setGroupBand(iconButton, appearance.colorHex);
        const svg = appearance.iconId
          ? createIconSvg(appearance.iconId, GROUP_ICON_SIZES.formPreview)
          : null;
        if (svg) {
          iconPreview.append(svg);
        }
      }
      iconButton.addEventListener("click", () => {
        openIconPicker(appearance, iconButton, (choice) => {
          appearance = choice;
          paintAppearance();
        });
      });
      // Lo usa resetGuideCreateForm para descartar la elección
      form._resetAppearance = () => {
        appearance = { iconId: "", colorHex: "" };
        paintAppearance();
      };

      const actions = document.createElement("div");
      actions.className = "youtube-groups__guide-form-actions";

      const save = document.createElement("button");
      save.type = "submit";
      save.className = "youtube-groups__guide-form-save";
      save.textContent = "Guardar";

      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "youtube-groups__guide-form-cancel";
      cancel.textContent = "Cancelar";
      cancel.addEventListener("click", () => {
        form.reset();
        form._resetAppearance();
        form.hidden = true;
        error.textContent = "";
      });

      actions.append(save, cancel);

      const error = document.createElement("p");
      error.className = "youtube-groups__guide-form-error";
      error.setAttribute("aria-live", "polite");

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        error.textContent = "";
        const parentId = guideCreateTarget.parentId;
        const kind = parentId ? "subgroup" : "group";
        const message = YouTubeGroups.validateGroupName(input.value, kind);
        if (message) {
          error.textContent = message;
          return;
        }
        try {
          const created = parentId
            ? await createSubGroup(parentId, input.value)
            : await createGroup(input.value);
          if (appearance.iconId || appearance.colorHex) {
            try {
              await YouTubeGroups.setGroupAppearance(
                created.id,
                appearance.iconId,
                appearance.colorHex,
              );
            } catch (exception) {
              // El grupo ya existe: se avisa y se deja el formulario abierto
              error.textContent =
                "El grupo se creó sin icono: " + exception.message;
              form.reset();
              form._resetAppearance();
              await ctx.renderGroupsPanel();
              if (parentId) {
                await showParentColumn(parentId);
              }
              return;
            }
          }
          form.reset();
          form._resetAppearance();
          form.hidden = true;
          await ctx.renderGroupsPanel();
          if (parentId) {
            await showParentColumn(parentId);
          }
        } catch (exception) {
          error.textContent = exception.message;
        }
      });

      form.append(input, iconButton, actions, error);
      return form;
    }

    /**
     * Sección de la guía tras la que va la nuestra: la anterior a "Más de
     * YouTube", o la primera si no se encuentra.
     * @param {Element} container - Contenedor `#sections` de la guía.
     * @returns {Element|null} Sección que debe quedar justo antes de la nuestra
     *   (`null` si la nuestra debe ir la primera).
     */
    function findGuideAnchor(container) {
      const sections = Array.from(
        container.querySelectorAll(":scope > ytd-guide-section-renderer"),
      );
      const hrefs = sections.map((section) =>
        Array.from(section.querySelectorAll("a[href]")).map((a) =>
          a.getAttribute("href"),
        ),
      );
      const index = YouTubeGroupsGuide.findGuideInsertionIndex(hrefs);
      if (index > 0) {
        return sections[index - 1];
      }
      if (index === 0) {
        return null;
      }
      return sections[0] || null;
    }

    // Última ancla calculada (`{ container, anchor }`) o `null` si está invalidada.
    let guideAnchorCache = null;

    /** Invalida el ancla en caché: se recalculará en la próxima consulta. */
    function invalidateGuideAnchor() {
      guideAnchorCache = null;
    }

    /**
     * Ancla de la sección con caché: solo recorre los enlaces de la guía si la
     * caché está invalidada, es de otro contenedor o el ancla ya no es hija suya.
     * @param {Element} container - Contenedor `#sections` de la guía.
     * @returns {Element|null} Igual que `findGuideAnchor`.
     */
    function getGuideAnchor(container) {
      if (
        guideAnchorCache &&
        guideAnchorCache.container === container &&
        (guideAnchorCache.anchor === null ||
          guideAnchorCache.anchor.parentElement === container)
      ) {
        return guideAnchorCache.anchor;
      }
      const anchor = findGuideAnchor(container);
      guideAnchorCache = { container, anchor };
      return anchor;
    }

    /**
     * Indica si la sección está conectada y justo en su posición de la guía.
     * @param {Element} [container] - Contenedor `#sections` (se busca si falta).
     * @returns {boolean} `true` si no hace falta pintarla ni moverla.
     */
    function isGuideSectionInPlace(container) {
      const section = document.getElementById(GUIDE_SECTION_ID);
      const sections =
        container || document.querySelector(GUIDE_SECTIONS_SELECTOR);
      if (!section?.isConnected || !sections) {
        return false;
      }
      const anchor = getGuideAnchor(sections);
      return anchor
        ? section.parentElement === sections &&
            anchor.nextElementSibling === section
        : section.parentElement === sections &&
            sections.firstElementChild === section;
    }

    /**
     * Pinta la sección "ChannelTree" en la guía de YouTube, antes de "Más de
     * YouTube". Si la guía no existe, no hace nada; si la sección ya existe, la
     * reutiliza y solo la mueve si no está en su sitio.
     * @param {Array<Object>} groups - Árbol de grupos.
     * @param {string} [direction] - "forward" o "back" para animar el cambio de columna.
     */
    function renderGuideSection(groups, direction) {
      const container = document.querySelector(GUIDE_SECTIONS_SELECTOR);
      if (!container) {
        return;
      }
      let section = document.getElementById(GUIDE_SECTION_ID);
      if (!section) {
        section = document.createElement("div");
        section.id = GUIDE_SECTION_ID;
        section.className = "youtube-groups__guide";
        attachMarqueeListeners(section);
      }
      if (!isGuideSectionInPlace(container)) {
        const anchor = getGuideAnchor(container);
        if (anchor) {
          anchor.after(section);
        } else {
          container.prepend(section);
        }
      }

      guidePath = YouTubeGroupsGuide.normalizeGuidePath(groups, guidePath);
      const column = YouTubeGroupsGuide.getGuideColumn(groups, guidePath);

      // Encabezado, barra de botones, fila de navegación y contenedor: se crean una vez con la sección
      let viewport = section.querySelector(".youtube-groups__guide-viewport");
      if (!viewport) {
        const heading = document.createElement("h3");
        heading.className = "youtube-groups__guide-heading";
        heading.textContent = "ChannelTree";

        const back = document.createElement("button");
        back.type = "button";
        back.className =
          "youtube-groups__guide-back youtube-groups__icon-button youtube-groups__icon-button--small";
        back.setAttribute("aria-label", "Volver");
        back.append(createUiIconSvg("chevron-left", 20));
        back.addEventListener("click", () => {
          const leftId = guidePath[guidePath.length - 1];
          guidePath = YouTubeGroupsGuide.leaveGuideGroup(guidePath);
          renderGuideSection(guideGroups, "back");
          // El foco vuelve al "›" del grupo del que se sale (o a "‹")
          const column = viewport.lastElementChild;
          const leftMain = [
            ...(column?.querySelectorAll("[data-group-id]") ?? []),
          ].find((el) => el.getAttribute("data-group-id") === leftId);
          const target = leftMain
            ?.closest(".youtube-groups__guide-row")
            ?.querySelector(".youtube-groups__guide-enter");
          if (target) {
            target.focus();
          } else if (!back.hidden) {
            back.focus();
          }
        });

        const navTitle = document.createElement("span");
        navTitle.className =
          "youtube-groups__guide-nav-title youtube-groups__guide-name";
        const navTitleText = document.createElement("span");
        navTitleText.className = "youtube-groups__guide-name-text";
        navTitle.append(navTitleText);

        const nav = document.createElement("div");
        nav.className = "youtube-groups__guide-nav";
        nav.append(back, navTitle);

        const edit = document.createElement("button");
        edit.type = "button";
        edit.className =
          "youtube-groups__guide-edit youtube-groups__icon-button";
        edit.title = "Editar grupos";
        edit.setAttribute("aria-label", "Editar grupos");
        edit.append(createUiIconSvg("edit", 20));
        edit.addEventListener("click", () => {
          browser.runtime
            .sendMessage({ type: "youtube-groups:open-editor" })
            .catch((error) => {
              console.error(
                "[ChannelTree] No se pudo abrir el editor de grupos",
                error,
              );
            });
        });

        const create = document.createElement("button");
        create.type = "button";
        create.className =
          "youtube-groups__guide-create youtube-groups__icon-button";
        create.append(createUiIconSvg("add", 20));

        const form = createGuideCreateForm();
        create.addEventListener("click", () => {
          form.hidden = !form.hidden;
          if (!form.hidden) {
            form.querySelector("input").focus();
          }
        });

        const clear = document.createElement("button");
        clear.type = "button";
        clear.className =
          "youtube-groups__guide-clear youtube-groups__icon-button";
        clear.append(createUiIconSvg("recycle", 20));
        clear.addEventListener("click", () => ctx.setActiveSelection([]));

        const menuButton = document.createElement("button");
        menuButton.type = "button";
        menuButton.className =
          "youtube-groups__guide-menu-button youtube-groups__icon-button";
        menuButton.title = "Opciones: listas, filtros y ajustes";
        menuButton.setAttribute("aria-label", "Opciones");
        menuButton.setAttribute("aria-haspopup", "dialog");
        menuButton.setAttribute("aria-controls", "youtube-groups-menu");
        menuButton.setAttribute("aria-expanded", "false");
        menuButton.append(createUiIconSvg("settings", 20));
        menuButton.addEventListener("click", () => {
          ctx.panel.toggleMenu(menuButton);
        });

        const toolbar = document.createElement("div");
        toolbar.className = "youtube-groups__guide-toolbar";
        toolbar.setAttribute("role", "group");
        toolbar.setAttribute("aria-label", "Acciones de ChannelTree");
        toolbar.append(create, clear, edit, menuButton);

        viewport = document.createElement("div");
        viewport.className = "youtube-groups__guide-viewport";

        section.replaceChildren(heading, toolbar, form, nav, viewport);
      }
      guideGroups = groups;

      // Al cambiar el destino de crear, el formulario se oculta y se vacía
      guideCreateTarget = YouTubeGroupsGuide.getCreateTarget(
        groups,
        guidePath,
        ctx.state.activeSelection,
      );
      const targetKey = guideCreateTarget.parentId ?? "";
      if (targetKey !== guideRenderedTargetKey) {
        guideRenderedTargetKey = targetKey;
        resetGuideCreateForm(section);
      }

      const back = section.querySelector(".youtube-groups__guide-back");
      const navText = section.querySelector(
        ".youtube-groups__guide-nav-title .youtube-groups__guide-name-text",
      );
      const create = section.querySelector(".youtube-groups__guide-create");
      back.hidden = !column.parent;
      const navLabel = column.parent ? column.parent.name : "Suscripciones";
      if (navText.textContent !== navLabel) {
        // La fila de navegación se reutiliza: sin marquesina ni title previos
        const navRow = section.querySelector(".youtube-groups__guide-nav");
        stopMarquee(navRow);
        navRow.removeAttribute("title");
      }
      navText.textContent = navLabel;
      create.title = guideCreateTarget.title;
      create.setAttribute("aria-label", guideCreateTarget.title);

      const clear = section.querySelector(".youtube-groups__guide-clear");
      clear.disabled = ctx.state.activeSelection.length === 0;
      clear.title = "Limpiar selección";
      clear.setAttribute("aria-label", "Limpiar selección");

      const list = document.createElement("div");
      list.className = "youtube-groups__guide-column";
      if (column.items.length === 0) {
        const empty = document.createElement("p");
        empty.className = "youtube-groups__guide-empty";
        empty.textContent = column.parent
          ? "Sin subgrupos"
          : "Aún no hay grupos";
        list.append(empty);
      }
      for (const item of column.items) {
        list.append(createGuideRow(groups, item, column.path.length));
      }
      if (!column.parent) {
        list.append(createUngroupedEntry(groups));
      }

      const previous = viewport.lastElementChild;
      const animate =
        direction &&
        previous &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!animate) {
        viewport.replaceChildren(list);
        return;
      }
      // Deja solo la última columna como saliente y desliza las dos
      while (viewport.firstElementChild !== previous) {
        viewport.firstElementChild.remove();
      }
      const forward = direction === "forward";
      previous.classList.add(
        forward
          ? "youtube-groups__guide-column--out-left"
          : "youtube-groups__guide-column--out-right",
      );
      list.classList.add(
        forward
          ? "youtube-groups__guide-column--in-right"
          : "youtube-groups__guide-column--in-left",
      );
      viewport.append(list);
      const removePrevious = () => previous.remove();
      previous.addEventListener("animationend", removePrevious, { once: true });
      setTimeout(removePrevious, 300);
    }

    /**
     * Lee los grupos y pinta la sección en la guía de YouTube.
     */
    function paintGuideSection() {
      Promise.all([getGroups(), getAvatars(), getSubscriptions()])
        .then(([groups, avatars, subscriptions]) => {
          ctx.state.avatars = avatars;
          ctx.state.subscriptions = subscriptions;
          renderGuideSection(groups);
        })
        .catch((error) => {
          console.error(
            "[ChannelTree] No se pudo pintar la guía lateral",
            error,
          );
        });
    }

    /**
     * Programa, como mucho una vez por frame, el pintado de la sección de la
     * guía cuando falta o no está en su sitio. Solo lee los grupos si hay guía.
     */
    function scheduleGuideCheck() {
      if (guideCheckScheduled) {
        return;
      }
      guideCheckScheduled = true;
      requestAnimationFrame(() => {
        guideCheckScheduled = false;
        if (
          !document.querySelector(GUIDE_SECTIONS_SELECTOR) ||
          isGuideSectionInPlace()
        ) {
          return;
        }
        paintGuideSection();
      });
    }

    const GUIDE_PINNED_CLASS = "youtube-groups--guide-pinned";
    const GUIDE_BUTTON_SELECTOR = "ytd-masthead #guide-button";
    let guidePinPath = null;
    let guidePinScheduled = false;

    /**
     * Pone o quita la clase que fuerza la guía de YouTube abierta y fija, solo
     * en suscripciones (ADR 0010 y 0012). Es idempotente.
     *
     * @param {string} [pathname] Ruta con la que decidir (por defecto, la
     *   actual; en yt-navigate-start, la de destino). La ruta que se recuerda
     *   para el observer es siempre la actual.
     */
    function syncGuidePin(pathname = window.location.pathname) {
      guidePinPath = window.location.pathname;
      const pinned = YouTubeGroupsPages.shouldPinGuide(
        YouTubeGroupsPages.getPageType(pathname),
        window.innerWidth,
        document.fullscreenElement !== null,
      );
      document.documentElement.classList.toggle(GUIDE_PINNED_CLASS, pinned);
    }

    /** Recalcula la guía fija como mucho una vez por frame. */
    function scheduleGuidePinSync() {
      if (guidePinScheduled) {
        return;
      }
      guidePinScheduled = true;
      requestAnimationFrame(() => {
        guidePinScheduled = false;
        syncGuidePin();
      });
    }

    /**
     * Registra los escuchadores de la guía fija y hace la primera
     * sincronización. `content.js` lo llama en el punto donde antes estaban
     * estas líneas.
     */
    function start() {
      // Con la guía fija, ☰ no hace nada: se detiene el clic antes de que
      // YouTube cambie su estado interno.
      document.addEventListener(
        "click",
        (event) => {
          if (
            document.documentElement.classList.contains(GUIDE_PINNED_CLASS) &&
            event.target instanceof Element &&
            event.target.closest(GUIDE_BUTTON_SELECTOR)
          ) {
            event.stopPropagation();
            event.preventDefault();
          }
        },
        true,
      );

      document.addEventListener("yt-navigate-start", (event) => {
        let destination = null;
        try {
          destination = YouTubeGroupsPages.getNavigationPathname(
            event.detail?.url,
            window.location.origin,
          );
        } catch {
          // detail puede ser inaccesible desde el content script.
        }
        syncGuidePin(destination ?? window.location.pathname);
      });
      document.addEventListener("yt-navigate-finish", () => syncGuidePin());
      window.addEventListener("popstate", () => syncGuidePin());
      document.addEventListener("fullscreenchange", () => syncGuidePin());
      window.addEventListener("resize", scheduleGuidePinSync);
      syncGuidePin();
    }

    /**
     * Parte del observer de mutaciones que atañe a la guía: resincroniza la
     * guía fija si cambió la ruta e invalida el ancla en caché si cambia algo
     * de la guía que no sea nuestra sección.
     * @param {MutationRecord[]} mutations - Mutaciones del observer.
     */
    function noteMutations(mutations) {
      if (window.location.pathname !== guidePinPath) {
        syncGuidePin();
      }
      // Si cambia algo de la guía que no sea nuestra sección, el ancla en caché
      // puede haber dejado de valer (secciones nuevas o con enlaces tardíos).
      const guideSections = document.querySelector(GUIDE_SECTIONS_SELECTOR);
      if (guideSections) {
        const ourSection = document.getElementById(GUIDE_SECTION_ID);
        if (
          mutations.some(
            (mutation) =>
              guideSections.contains(mutation.target) &&
              !ourSection?.contains(mutation.target),
          )
        ) {
          invalidateGuideAnchor();
        }
      }
    }

    /**
     * Actualiza el número de los bullets de la guía con
     * `ctx.state.newVideoCounts`, sin rehacer la columna.
     */
    function updateNewVideoBullets() {
      const section = document.getElementById(GUIDE_SECTION_ID);
      if (!section) {
        return;
      }
      const mains = new Map();
      for (const element of section.querySelectorAll("[data-group-id]")) {
        mains.set(element.getAttribute("data-group-id"), element);
      }
      for (const host of section.querySelectorAll("[data-bullet-for]")) {
        const groupId = host.getAttribute("data-bullet-for");
        const bullet = host.querySelector(
          ":scope > .youtube-groups__group-bullet",
        );
        const color = bullet
          ? bullet.style.getPropertyValue("--yg-group-color")
          : "";
        const count = ctx.state.newVideoCounts?.get(groupId) ?? 0;
        setGroupBullet(host, color || null, count);
        const main = mains.get(groupId);
        if (main) {
          const description = describeNewVideos(count);
          if (description) {
            main.setAttribute("aria-description", description);
          } else {
            main.removeAttribute("aria-description");
          }
        }
      }
    }

    /**
     * Final del observer de mutaciones: reprograma el pintado de la sección si
     * ya no está en su sitio.
     */
    function checkPlacement() {
      if (!isGuideSectionInPlace()) {
        scheduleGuideCheck();
      }
    }

    return Object.freeze({
      renderGuideSection,
      noteMutations,
      checkPlacement,
      updateNewVideoBullets,
      start,
    });
  }

  return Object.freeze({ create });
})();
