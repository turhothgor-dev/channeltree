// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

/**
 * Pestañas de la página de opciones (patrón de pestañas de la APG, activación
 * automática; ADR 0037). Las funciones puras no usan el DOM; `create` gestiona
 * los atributos ARIA, los paneles, el teclado y el hash de la URL.
 */
const YouTubeGroupsOptionsTabs = (() => {
  const DEFAULT_TAB = "grupos";

  /** Ids antiguos de sección y la pestaña que ahora las contiene (ADR 0039). */
  const ALIASES = Object.freeze({
    "options-unclassified": "canales",
    "options-hidden": "canales",
    "options-inactive": "canales",
    copia: "datos",
    sincronizacion: "datos",
    limpieza: "datos",
  });

  /**
   * Resuelve un valor (hash) a una pestaña y, si es un alias, su sección.
   * @param {string} value - Id de panel o alias, con o sin `#`.
   * @param {string[]} ids - Ids de los paneles existentes.
   * @returns {{tab: string, section: string|null}|null} Destino, o null.
   */
  function resolveTarget(value, ids) {
    const list = Array.isArray(ids) ? ids : [];
    const id = typeof value === "string" ? value.replace(/^#/, "") : "";
    if (!id) {
      return null;
    }
    if (list.includes(id)) {
      return { tab: id, section: null };
    }
    if (Object.hasOwn(ALIASES, id) && list.includes(ALIASES[id])) {
      return { tab: ALIASES[id], section: id };
    }
    return null;
  }

  /**
   * Resuelve la pestaña inicial: hash válido, si no la guardada, si no "grupos".
   * @param {Object} args
   * @param {string} [args.hash] - Hash de la URL, con o sin `#`.
   * @param {string|null} [args.saved] - Pestaña guardada en las preferencias.
   * @param {string[]} args.ids - Ids de los paneles existentes.
   * @returns {{tab: string, section: string|null}} Pestaña a mostrar y, si el
   *   hash era un alias, la sección a la que desplazar.
   */
  function resolveInitialTab({ hash, saved, ids }) {
    const fromHash = resolveTarget(hash, ids);
    if (fromHash) {
      return fromHash;
    }
    const fromSaved = resolveTarget(saved, ids);
    if (fromSaved) {
      return { tab: fromSaved.tab, section: null };
    }
    return { tab: DEFAULT_TAB, section: null };
  }

  /**
   * Índice destino de una tecla de navegación entre pestañas (circular).
   * @param {string} key - `event.key`.
   * @param {number} index - Índice de la pestaña actual.
   * @param {number} count - Número de pestañas.
   * @returns {number} Índice destino, o -1 si la tecla no navega.
   */
  function getKeyTarget(key, index, count) {
    if (!(count > 0)) {
      return -1;
    }
    switch (key) {
      case "ArrowRight":
        return (index + 1) % count;
      case "ArrowLeft":
        return (index - 1 + count) % count;
      case "Home":
        return 0;
      case "End":
        return count - 1;
      default:
        return -1;
    }
  }

  /**
   * Activa el comportamiento de pestañas sobre un `tablist` ya presente.
   * @param {HTMLElement} tablist - Contenedor con `[role="tab"]` y `aria-controls`.
   * @param {Object} options
   * @param {string} options.initial - Id del panel inicial.
   * @param {string|null} [options.section] - Id de la sección a la que
   *   desplazar tras activar la pestaña inicial.
   * @param {function(string): void} [options.onChange] - Se llama al arrancar y
   *   en cada activación que cambia la pestaña.
   * @returns {{select: function(string, {focus?: boolean, history?: "push"|"replace"}=): void,
   *   getActive: function(): string}} API de las pestañas.
   */
  function create(tablist, { initial, section, onChange } = {}) {
    const doc = tablist.ownerDocument;
    const win = doc.defaultView;
    const tabs = [...tablist.querySelectorAll('[role="tab"]')];
    const panelIds = tabs.map((tab) => tab.getAttribute("aria-controls"));
    let active = null;

    function selectTab(id, { focus = false, history } = {}) {
      const index = panelIds.indexOf(id);
      if (index === -1) {
        return;
      }
      const changed = id !== active;
      active = id;
      tabs.forEach((tab, i) => {
        const selected = i === index;
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
        const panel = doc.getElementById(panelIds[i]);
        if (panel) {
          panel.hidden = !selected;
        }
      });
      if (focus) {
        tabs[index].focus();
      }
      if (changed && history === "push") {
        win.history.pushState(null, "", `#${id}`);
      } else if (history === "replace") {
        win.history.replaceState(null, "", `#${id}`);
      }
      if (changed && typeof onChange === "function") {
        onChange(id);
      }
    }

    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => {
        selectTab(panelIds[index], { history: "push" });
      });
      tab.addEventListener("keydown", (event) => {
        const target = getKeyTarget(event.key, index, tabs.length);
        if (target === -1) {
          return;
        }
        event.preventDefault();
        selectTab(panelIds[target], { focus: true, history: "replace" });
      });
    });

    function scrollToSection(section) {
      if (section) {
        doc.getElementById(section)?.scrollIntoView?.({ block: "start" });
      }
    }

    win.addEventListener("hashchange", () => {
      const target = resolveTarget(win.location.hash, panelIds);
      if (!target) {
        return;
      }
      selectTab(target.tab, target.section ? { history: "replace" } : {});
      scrollToSection(target.section);
    });

    const start = panelIds.includes(initial) ? initial : panelIds[0];
    selectTab(start, { history: "replace" });
    scrollToSection(section);

    return {
      select: selectTab,
      getActive: () => active,
    };
  }

  return Object.freeze({
    DEFAULT_TAB,
    ALIASES,
    resolveTarget,
    resolveInitialTab,
    getKeyTarget,
    create,
  });
})();
