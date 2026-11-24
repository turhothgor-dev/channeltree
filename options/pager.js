// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

/**
 * Paginación y marcos de las listas de canales de la página de
 * opciones. Funciones puras de paginación y piezas de DOM (sin innerHTML con
 * datos). Lo usan las listas "Canales sin grupo", "Canales ocultos" y
 * "Canales inactivos".
 */
const YouTubeGroupsPager = (() => {
  const FOCUS_ATTRIBUTE = "data-focus-key";
  const KEY_PREV = "page-prev";
  const KEY_NEXT = "page-next";

  /**
   * Calcula la página a mostrar según las reglas del plan: búsqueda nueva →
   * página 1; cambio de tamaño → página del primer canal que se veía; si no,
   * se conserva la página, o la última si ya no existe.
   * @param {{page: number, pageSize: number, query: string}|null} previous -
   *   Estado anterior (`null` la primera vez).
   * @param {{total: number, pageSize: number, query: string}} current - Datos.
   * @returns {{page: number, pageCount: number, start: number, end: number,
   *   pageSize: number, query: string}} Página resuelta (`pageCount` ≥ 1).
   */
  function resolvePage(previous, { total, pageSize, query }) {
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    let page = 1;
    if (previous && previous.query === query) {
      page =
        previous.pageSize === pageSize
          ? previous.page
          : Math.floor(((previous.page - 1) * previous.pageSize) / pageSize) +
            1;
    }
    page = Math.min(Math.max(1, page), pageCount);
    const start = Math.min((page - 1) * pageSize, total);
    const end = Math.min(start + pageSize, total);
    return { page, pageCount, start, end, pageSize, query };
  }

  /**
   * Texto de estado de la paginación.
   * @param {{page: number, pageCount: number, total: number}} info - Datos.
   * @returns {string} Por ejemplo "Página 2 de 5 · 87 canales".
   */
  function describePage({ page, pageCount, total }) {
    const noun = total === 1 ? "canal" : "canales";
    return `Página ${page} de ${pageCount} · ${total} ${noun}`;
  }

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
   * Línea de descripción de un canal (truncada, con el texto completo en `title`).
   * @param {Object} subscriptions - Mapa de suscripciones conocidas.
   * @param {string} key - Clave del canal.
   * @returns {HTMLElement|null} Elemento, o `null` si no hay descripción.
   */
  function describe(subscriptions, key) {
    const full = YouTubeGroupsSubscriptions.getSubscriptionDescription(
      subscriptions,
      key,
    );
    if (!full) {
      return null;
    }
    const { text, title } = YouTubeGroupsSubscriptions.formatDescription(full);
    const node = el("span", "options__channel-description", text);
    if (title) {
      node.title = title;
    }
    return node;
  }

  /**
   * Crea una sola vez el marco de una lista dentro de `container`.
   * @param {HTMLElement} container - Donde se inserta el marco.
   * @param {Object} options - Opciones.
   * @param {string} options.titleId - `id` del `h2` del título.
   * @param {string} options.label - Nombre accesible de la lista.
   * @param {HTMLElement} [options.controls] - Controles propios de la lista
   *   (por ejemplo el selector de tamaño de página). Se insertan una sola vez
   *   en el marco, justo después del título y fuera del cuerpo, así que no se
   *   repintan con la lista.
   * @returns {{frame: HTMLElement, title: HTMLElement, body: HTMLElement,
   *   announce: function(string): void}} Piezas del marco.
   */
  function createListFrame(container, { titleId, label, controls }) {
    const frame = el("div", "options__list-frame");
    const title = el("h2", "options__list-title");
    title.id = titleId;
    const body = el("div", "options__list-body");
    body.setAttribute("role", "group");
    body.setAttribute("aria-label", label);
    const live = el("div", "options__visually-hidden");
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    frame.append(title);
    if (controls) {
      frame.append(controls);
    }
    frame.append(live, body);
    container.append(frame);
    return {
      frame,
      title,
      body,
      announce(text) {
        live.textContent = text;
      },
    };
  }

  /**
   * Controles de página: Anterior, estado y Siguiente.
   * @param {Object} options - Opciones.
   * @param {string} options.label - Nombre de la lista para `aria-label`.
   * @param {number} options.page - Página actual (desde 1).
   * @param {number} options.pageCount - Total de páginas.
   * @param {number} options.total - Total de canales.
   * @param {function(number, string): void} options.onPage - Recibe la página
   *   nueva y la clave de foco del botón pulsado.
   * @returns {HTMLElement} Controles.
   */
  function createPageControls({ label, page, pageCount, total, onPage }) {
    const root = el("div", "options__pager");
    root.setAttribute("role", "group");
    root.setAttribute("aria-label", `Paginación de ${label}`);
    const prev = el("button", "options__pager-button", "Anterior");
    prev.type = "button";
    prev.setAttribute("aria-label", `Página anterior de ${label}`);
    prev.setAttribute(FOCUS_ATTRIBUTE, KEY_PREV);
    prev.disabled = page <= 1;
    prev.addEventListener("click", () => onPage(page - 1, KEY_PREV));
    const next = el("button", "options__pager-button", "Siguiente");
    next.type = "button";
    next.setAttribute("aria-label", `Página siguiente de ${label}`);
    next.setAttribute(FOCUS_ATTRIBUTE, KEY_NEXT);
    next.disabled = page >= pageCount;
    next.addEventListener("click", () => onPage(page + 1, KEY_NEXT));
    const status = el(
      "span",
      "options__pager-status",
      describePage({ page, pageCount, total }),
    );
    root.append(prev, status, next);
    return root;
  }

  /**
   * Clave de foco tras cambiar de página: el botón pulsado, o el otro si ha
   * quedado desactivado (primera o última página).
   * @param {string} pressedKey - Clave del botón pulsado.
   * @param {number} page - Página nueva.
   * @param {number} pageCount - Total de páginas.
   * @returns {string} Clave a restaurar.
   */
  function pageFocusKey(pressedKey, page, pageCount) {
    if (pressedKey === KEY_PREV && page <= 1) {
      return KEY_NEXT;
    }
    if (pressedKey === KEY_NEXT && page >= pageCount) {
      return KEY_PREV;
    }
    return pressedKey;
  }

  /**
   * Clave de foco del control enfocado dentro de `root`.
   * @param {HTMLElement} root - Contenedor que se va a repintar.
   * @returns {string|null} Valor de `data-focus-key` o `null`.
   */
  function captureFocus(root) {
    const active = document.activeElement;
    if (!active || !root.contains(active)) {
      return null;
    }
    return active.getAttribute(FOCUS_ATTRIBUTE);
  }

  /**
   * Devuelve el foco al control con esa clave, si sigue existiendo.
   * @param {HTMLElement} root - Contenedor repintado.
   * @param {string|null} key - Clave capturada.
   * @returns {void}
   */
  function restoreFocus(root, key) {
    if (!key) {
      return;
    }
    for (const node of root.querySelectorAll(`[${FOCUS_ATTRIBUTE}]`)) {
      if (node.getAttribute(FOCUS_ATTRIBUTE) === key) {
        node.focus();
        return;
      }
    }
  }

  /**
   * Paginación con estado de una lista: página actual, total, clave de foco
   * pendiente y cambio de página (Anterior y Siguiente).
   * @param {{body: HTMLElement, announce: function(string): void}} frame -
   *   Marco de `createListFrame`.
   * @param {Object} options - Opciones.
   * @param {string} options.label - Nombre de la lista para `aria-label`.
   * @param {function(): void} options.rerender - Repinta la lista; debe volver
   *   a llamar a `resolve` y `controls`.
   * @returns {{resolve: function({total: number, pageSize: number,
   *   query: string}): {page: number, pageCount: number, start: number,
   *   end: number, focusKey: (string|null)}, controls: function(): (
   *   HTMLElement|null), focusNext: function(string): void,
   *   restoreFocus: function(string|null): void}} Paginación de la lista.
   */
  function createListPaging(frame, { label, rerender }) {
    let pageState = null;
    let pendingFocusKey = null;
    let lastTotal = 0;

    function goToPage(page, pressedKey) {
      pageState = { ...pageState, page };
      pendingFocusKey = pageFocusKey(pressedKey, page, pageState.pageCount);
      rerender();
      frame.announce(
        describePage({
          page: pageState.page,
          pageCount: pageState.pageCount,
          total: lastTotal,
        }),
      );
    }

    return {
      /**
       * Resuelve la página a pintar y la clave de foco a restaurar.
       * @param {{total: number, pageSize: number, query: string}} data - Datos.
       * @returns {{page: number, pageCount: number, start: number, end: number,
       *   focusKey: (string|null)}} Página resuelta.
       */
      resolve({ total, pageSize, query }) {
        const focusKey = pendingFocusKey || captureFocus(frame.body);
        pendingFocusKey = null;
        const size =
          Number.isInteger(pageSize) && pageSize > 0
            ? pageSize
            : YouTubeGroupsViewPrefs.DEFAULT_PAGE_SIZE;
        pageState = resolvePage(pageState, { total, pageSize: size, query });
        lastTotal = total;
        const { page, pageCount, start, end } = pageState;
        return { page, pageCount, start, end, focusKey };
      },
      /**
       * Controles de página del último `resolve`.
       * @returns {HTMLElement|null} Controles, o `null` con una sola página.
       */
      controls() {
        if (!pageState || pageState.pageCount <= 1) {
          return null;
        }
        return createPageControls({
          label,
          page: pageState.page,
          pageCount: pageState.pageCount,
          total: lastTotal,
          onPage: goToPage,
        });
      },
      /**
       * Fija la clave de foco del próximo `resolve`.
       * @param {string} key - Clave de foco.
       * @returns {void}
       */
      focusNext(key) {
        pendingFocusKey = key;
      },
      /**
       * Devuelve el foco al control con esa clave.
       * @param {string|null} key - Clave de foco.
       * @returns {void}
       */
      restoreFocus(key) {
        restoreFocus(frame.body, key);
      },
    };
  }

  return Object.freeze({
    KEY_PREV,
    KEY_NEXT,
    resolvePage,
    describePage,
    describe,
    createListFrame,
    createPageControls,
    createListPaging,
    pageFocusKey,
    captureFocus,
    restoreFocus,
  });
})();
