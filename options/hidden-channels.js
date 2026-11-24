// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

/**
 * Sección "Canales ocultos" del editor: lista los canales cuyos vídeos no se
 * muestran en inicio, búsqueda ni recomendaciones y permite dejar de ocultarlos
 * uno a uno con "Deshacer". No usa innerHTML con datos.
 */
const YouTubeGroupsHiddenList = (() => {
  const DESCRIPTION =
    "Sus vídeos no se muestran en inicio, búsqueda ni recomendaciones. " +
    "Se ocultan desde «+G» en YouTube.";
  const EMPTY_TEXT = "No hay canales ocultos.";
  const NO_MATCH_TEXT = "Ningún canal oculto coincide con la búsqueda.";
  const LABEL = "Canales ocultos";
  const ERROR_TEXT = "No se pudo dejar de ocultar el canal.";

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
   * @param {HTMLElement} container - Sección donde se pinta.
   * @param {Object} options - Opciones.
   * @param {function(string, function(): void, boolean): void} options.showNotice -
   *   Muestra el aviso del editor (texto, acción de deshacer, foco en ella).
   * @param {HTMLElement} [options.pageSizeControl] - Selector de tamaño de
   *   página, que el marco coloca bajo el título.
   * @returns {{render: Function}} Componente.
   */
  function create(container, { showNotice, pageSizeControl }) {
    let lastData = { hiddenChannels: {}, avatars: {}, query: "" };
    let busy = false;
    let errorText = "";
    const frame = YouTubeGroupsPager.createListFrame(container, {
      titleId: "options-hidden-title",
      label: LABEL,
      controls: pageSizeControl,
    });
    const body = frame.body;
    const paging = YouTubeGroupsPager.createListPaging(frame, {
      label: LABEL,
      rerender: () => render(lastData),
    });

    /**
     * Nombre visible de un canal oculto (su URL si no tiene nombre).
     * @param {{name: string, url: string}} item - Canal.
     * @returns {string} Texto.
     */
    function displayName(item) {
      return item.name || item.url;
    }

    /**
     * Deja de ocultar un canal y avisa con "Deshacer".
     * @param {{key: string, name: string, url: string}} item - Canal.
     * @returns {Promise<void>}
     */
    async function unhide(item) {
      if (busy) {
        return;
      }
      busy = true;
      errorText = "";
      render(lastData);
      try {
        const { removed } =
          await YouTubeGroupsHiddenChannels.unhideChannelsAndSave([item.key]);
        lastData = {
          ...lastData,
          hiddenChannels: YouTubeGroupsHiddenChannels.unhideChannels(
            lastData.hiddenChannels,
            [item.key],
          ).channels,
        };
        showNotice(
          `Canal «${displayName(item)}» visible de nuevo`,
          () => undo(removed),
          true,
        );
      } catch (error) {
        console.error(error);
        errorText = ERROR_TEXT;
      }
      busy = false;
      render(lastData);
    }

    /**
     * Vuelve a ocultar los canales quitados.
     * @param {Array<Object>} removed - Entradas quitadas.
     * @returns {Promise<void>}
     */
    async function undo(removed) {
      if (busy) {
        return;
      }
      busy = true;
      try {
        await YouTubeGroupsHiddenChannels.restoreHiddenChannelsAndSave(removed);
        errorText = "";
        lastData = {
          ...lastData,
          hiddenChannels: YouTubeGroupsHiddenChannels.restoreHiddenChannels(
            lastData.hiddenChannels,
            removed,
          ).channels,
        };
        showNotice("Deshecho");
      } catch (error) {
        console.error(error);
        errorText = "No se pudo deshacer.";
      }
      busy = false;
      render(lastData);
    }

    /**
     * Pinta la sección.
     * @param {Object} data - Datos.
     * @param {Object} data.hiddenChannels - Mapa de canales ocultos.
     * @param {Object} [data.subscriptions] - Mapa de suscripciones conocidas
     *   (solo para mostrar la descripción).
     * @param {Object} data.avatars - Avatares (clave de canal → URL).
     * @param {string} data.query - Texto del buscador de Canales.
     * @returns {void}
     */
    function render(data) {
      lastData = data;
      const { hiddenChannels, subscriptions, avatars, query } = data;
      const all =
        YouTubeGroupsHiddenChannels.listHiddenChannels(hiddenChannels);
      const needle = YouTubeGroupsEditor.normalizeSearchText(query || "");
      const items = needle
        ? all.filter(
            (item) =>
              YouTubeGroupsEditor.normalizeSearchText(item.name).includes(
                needle,
              ) ||
              YouTubeGroupsEditor.normalizeSearchText(item.url).includes(
                needle,
              ),
          )
        : all;

      const { start, end, focusKey } = paging.resolve({
        total: items.length,
        pageSize: data.pageSize,
        query: needle,
      });

      frame.title.textContent = `Canales ocultos (${all.length})`;
      body.replaceChildren();
      body.append(el("p", "options__channels-summary", DESCRIPTION));
      if (errorText) {
        const alert = el("p", "options__error", errorText);
        alert.setAttribute("role", "alert");
        body.append(alert);
      }
      if (items.length === 0) {
        body.append(
          el(
            "p",
            "options__channels-summary",
            all.length === 0 ? EMPTY_TEXT : NO_MATCH_TEXT,
          ),
        );
        return;
      }
      const controls = paging.controls();
      if (controls) {
        body.append(controls);
      }

      const list = el("ul", "options__channel-list");
      for (const item of items.slice(start, end)) {
        const row = el("li", "options__channel");
        const avatar = YouTubeGroupsIconsDom.createChannelAvatar(
          displayName(item),
          YouTubeGroupsAvatars.getAvatarFor(avatars, item.url),
          YouTubeGroupsIconsDom.AVATAR_SIZES.editor,
        );
        const text = el("span", "options__channel-text");
        const link = el("a", "options__channel-link", displayName(item));
        link.href = item.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        text.append(link, el("span", "options__channel-url", item.url));
        const description = YouTubeGroupsPager.describe(
          subscriptions,
          item.key,
        );
        const label = `Dejar de ocultar «${displayName(item)}»`;
        const button = el(
          "button",
          "youtube-groups__icon-button youtube-groups__icon-button--small options__action--icon",
        );
        button.type = "button";
        button.setAttribute("aria-label", label);
        button.setAttribute("data-focus-key", `unhide:${item.key}`);
        button.title = label;
        button.disabled = busy;
        const svg = YouTubeGroupsIconsDom.createUiIconSvg("eye", 18);
        if (svg) {
          button.append(svg);
        }
        button.addEventListener("click", () => unhide(item));
        row.append(avatar, text);
        if (description) {
          row.append(description);
        }
        row.append(button);
        list.append(row);
      }
      body.append(list);
      paging.restoreFocus(focusKey);
    }

    return { render };
  }

  return Object.freeze({ create, LABEL });
})();
