// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { loadDom, loadOptionsDom } = require("./helpers/load-dom");
const { makeGroup, groupsStore } = require("./helpers/youtube-fixtures");

const IDS = ["grupos", "copia", "limpieza"];

/**
 * Carga tabs.js con un tablist mínimo de tres pestañas y sus paneles.
 * @param {Object} [options] - Opciones de loadDom.
 * @returns {{tabs: Object, dom: Object, tablist: HTMLElement}} API y entorno.
 */
function loadTabs(options = {}) {
  const buttons = IDS.map(
    (id) =>
      `<button type="button" role="tab" id="options-tab-${id}" aria-controls="${id}">${id}</button>`,
  ).join("");
  const panels = IDS.map(
    (id) => `<section id="${id}" role="tabpanel">${id}</section>`,
  ).join("");
  const dom = loadDom({
    url: "https://example.com/options/options.html",
    html: `<div id="tl" role="tablist">${buttons}</div>${panels}`,
    scripts: ["options/tabs.js"],
    ...options,
  });
  return {
    tabs: dom.global("YouTubeGroupsOptionsTabs"),
    dom,
    tablist: dom.document.getElementById("tl"),
  };
}

/**
 * Pulsa una tecla sobre un elemento.
 * @param {Object} dom - Entorno de loadDom.
 * @param {HTMLElement} el - Destino.
 * @param {string} key - Tecla.
 */
function press(dom, el, key) {
  el.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
    }),
  );
}

test("resolveInitialTab: hash, guardada y por defecto", () => {
  const { tabs } = loadTabs();
  const ids = IDS;
  const r = (hash, saved) => ({
    ...tabs.resolveInitialTab({ hash, saved, ids }),
  });
  const to = (tab, section = null) => ({ tab, section });
  assert.deepStrictEqual(r("#limpieza", "copia"), to("limpieza"));
  assert.deepStrictEqual(r("limpieza", "copia"), to("limpieza"));
  assert.deepStrictEqual(r("#nope", "copia"), to("copia"));
  assert.deepStrictEqual(r("", "nope"), to("grupos"));
  assert.deepStrictEqual(r("#nope", "nope"), to("grupos"));
  assert.deepStrictEqual(r(undefined, null), to("grupos"));
  assert.deepStrictEqual(r("", null), to("grupos"));
});

const NEW_IDS = ["grupos", "canales", "datos"];

test("resolveTarget: id de panel, alias, inexistente y desconocido", () => {
  const { tabs } = loadTabs();
  // Se copia el resultado: viene de otro realm de jsdom y deepStrictEqual falla.
  const t = (value, ids = NEW_IDS) => {
    const result = tabs.resolveTarget(value, ids);
    return result && { ...result };
  };
  assert.deepStrictEqual(t("canales"), { tab: "canales", section: null });
  assert.deepStrictEqual(t("#datos"), { tab: "datos", section: null });
  assert.deepStrictEqual(t("#copia"), { tab: "datos", section: "copia" });
  assert.deepStrictEqual(t("options-hidden"), {
    tab: "canales",
    section: "options-hidden",
  });
  assert.strictEqual(t("#copia", ["grupos", "canales"]), null);
  assert.strictEqual(t("#nope"), null);
  assert.strictEqual(t(""), null);
  assert.strictEqual(t(undefined), null);
});

test("resolveInitialTab: alias del hash con sección, guardada alias sin ella", () => {
  const { tabs } = loadTabs();
  const r = (hash, saved) => ({
    ...tabs.resolveInitialTab({ hash, saved, ids: NEW_IDS }),
  });
  assert.deepStrictEqual(r("#options-inactive", "datos"), {
    tab: "canales",
    section: "options-inactive",
  });
  assert.deepStrictEqual(r("", "limpieza"), { tab: "datos", section: null });
  assert.deepStrictEqual(r("#nope", null), { tab: "grupos", section: null });
});

/**
 * Carga tabs.js con pestañas grupos, canales y datos (con la sección copia).
 * @returns {{tabs: Object, dom: Object, tablist: HTMLElement, scrolled: string[]}}
 *   Entorno y registro de las secciones desplazadas.
 */
function loadAliasTabs() {
  const buttons = NEW_IDS.map(
    (id) =>
      `<button type="button" role="tab" id="options-tab-${id}" aria-controls="${id}">${id}</button>`,
  ).join("");
  const dom = loadDom({
    url: "https://example.com/options/options.html",
    html: `<div id="tl" role="tablist">${buttons}</div>
      <section id="grupos"></section><section id="canales"></section>
      <section id="datos"><div id="copia"></div><div id="limpieza"></div></section>`,
    scripts: ["options/tabs.js"],
  });
  const scrolled = [];
  dom.window.Element.prototype.scrollIntoView = function scroll() {
    scrolled.push(this.id);
  };
  return {
    tabs: dom.global("YouTubeGroupsOptionsTabs"),
    dom,
    tablist: dom.document.getElementById("tl"),
    scrolled,
  };
}

test("create: con section desplaza hasta ella tras activar la pestaña", () => {
  const { tabs, dom, tablist, scrolled } = loadAliasTabs();
  tabs.create(tablist, { initial: "datos", section: "copia" });
  assert.strictEqual(dom.document.getElementById("datos").hidden, false);
  assert.deepStrictEqual(scrolled, ["copia"]);
});

test("create: hashchange con alias activa su pestaña, corrige el hash y desplaza", async () => {
  const { tabs, dom, tablist, scrolled } = loadAliasTabs();
  const api = tabs.create(tablist, { initial: "grupos" });
  // Espera al evento (no a un plazo fijo): con la suite completa tarda más.
  const changed = new Promise((resolve) =>
    dom.window.addEventListener("hashchange", () => setTimeout(resolve, 0), {
      once: true,
    }),
  );
  dom.window.location.hash = "#limpieza";
  await changed;
  assert.strictEqual(api.getActive(), "datos");
  assert.strictEqual(dom.window.location.hash, "#datos");
  assert.deepStrictEqual(scrolled, ["limpieza"]);
});

test("getKeyTarget: circular, Inicio, Fin y otras teclas", () => {
  const { tabs } = loadTabs();
  assert.strictEqual(tabs.getKeyTarget("ArrowRight", 0, 3), 1);
  assert.strictEqual(tabs.getKeyTarget("ArrowRight", 2, 3), 0);
  assert.strictEqual(tabs.getKeyTarget("ArrowLeft", 1, 3), 0);
  assert.strictEqual(tabs.getKeyTarget("ArrowLeft", 0, 3), 2);
  assert.strictEqual(tabs.getKeyTarget("Home", 2, 3), 0);
  assert.strictEqual(tabs.getKeyTarget("End", 0, 3), 2);
  assert.strictEqual(tabs.getKeyTarget("a", 0, 3), -1);
  assert.strictEqual(tabs.getKeyTarget("Tab", 0, 3), -1);
});

test("create: atributos, paneles ocultos y onChange al arrancar", () => {
  const { tabs, dom, tablist } = loadTabs();
  const changes = [];
  const api = tabs.create(tablist, {
    initial: "copia",
    onChange: (id) => changes.push(id),
  });
  const buttons = [...tablist.querySelectorAll('[role="tab"]')];
  assert.deepStrictEqual(
    buttons.map((b) => b.getAttribute("aria-selected")),
    ["false", "true", "false"],
  );
  assert.deepStrictEqual(
    buttons.map((b) => b.getAttribute("tabindex")),
    ["-1", "0", "-1"],
  );
  assert.deepStrictEqual(
    IDS.map((id) => dom.document.getElementById(id).hidden),
    [true, false, true],
  );
  assert.deepStrictEqual(changes, ["copia"]);
  assert.strictEqual(api.getActive(), "copia");
  assert.strictEqual(dom.window.location.hash, "#copia");
});

test("create: clic activa, cambia el hash y llama a onChange; repetir no", () => {
  const { tabs, dom, tablist } = loadTabs();
  const changes = [];
  const api = tabs.create(tablist, {
    initial: "grupos",
    onChange: (id) => changes.push(id),
  });
  const length = dom.window.history.length;
  const limpieza = dom.document.getElementById("options-tab-limpieza");
  limpieza.click();
  assert.strictEqual(api.getActive(), "limpieza");
  assert.strictEqual(dom.document.getElementById("limpieza").hidden, false);
  assert.strictEqual(dom.document.getElementById("grupos").hidden, true);
  assert.strictEqual(dom.window.location.hash, "#limpieza");
  assert.strictEqual(dom.window.history.length, length + 1);
  limpieza.click();
  assert.strictEqual(dom.window.history.length, length + 1);
  assert.deepStrictEqual(changes, ["grupos", "limpieza"]);
});

test("create: flechas, Inicio y Fin activan, dan foco y no llenan el historial", () => {
  const { tabs, dom, tablist } = loadTabs();
  const changes = [];
  const api = tabs.create(tablist, {
    initial: "grupos",
    onChange: (id) => changes.push(id),
  });
  const length = dom.window.history.length;
  const tab = (id) => dom.document.getElementById(`options-tab-${id}`);

  press(dom, tab("grupos"), "ArrowLeft");
  assert.strictEqual(api.getActive(), "limpieza");
  assert.strictEqual(dom.document.activeElement, tab("limpieza"));
  press(dom, tab("limpieza"), "ArrowRight");
  assert.strictEqual(api.getActive(), "grupos");
  press(dom, tab("grupos"), "End");
  assert.strictEqual(api.getActive(), "limpieza");
  press(dom, tab("limpieza"), "Home");
  assert.strictEqual(api.getActive(), "grupos");
  press(dom, tab("grupos"), "ArrowRight");
  assert.strictEqual(api.getActive(), "copia");
  assert.strictEqual(dom.window.location.hash, "#copia");
  assert.strictEqual(dom.window.history.length, length);

  press(dom, tab("copia"), "x");
  assert.strictEqual(api.getActive(), "copia");
  assert.deepStrictEqual(changes, [
    "grupos",
    "limpieza",
    "grupos",
    "limpieza",
    "grupos",
    "copia",
  ]);
});

test("create: hashchange activa la pestaña del hash y se ignora un hash desconocido", async () => {
  const { tabs, dom, tablist } = loadTabs();
  const api = tabs.create(tablist, { initial: "grupos" });
  dom.window.location.hash = "#copia";
  await dom.flush();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.strictEqual(api.getActive(), "copia");
  dom.window.location.hash = "#nope";
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.strictEqual(api.getActive(), "copia");
});

const PAGE_IDS = ["grupos", "canales", "datos"];
const PAGE_NAMES = ["Grupos", "Canales", "Datos"];

/**
 * Carga la página de opciones completa.
 * @param {Object} [options] - Opciones de loadOptionsDom.
 * @returns {Promise<Object>} DOM cargado.
 */
async function loadPage(options = {}) {
  const dom = loadOptionsDom({ store: {}, ...options });
  await dom.flush();
  return dom;
}

/**
 * Ids de los paneles visibles de la página.
 * @param {Object} dom - DOM cargado.
 * @returns {string[]} Ids visibles.
 */
function visiblePanels(dom) {
  return [...dom.document.querySelectorAll('main > [role="tabpanel"]')]
    .filter((panel) => !panel.hidden)
    .map((panel) => panel.id);
}

/**
 * Valor guardado de las preferencias de vista.
 * @param {Object} dom - DOM cargado.
 * @returns {Object} Preferencias.
 */
function savedView(dom) {
  return JSON.parse(dom.localStorage.getItem("youtubeGroupsOptionsView"));
}

test("página: tres pestañas con nombre, orden y aria-controls, y un solo panel", async () => {
  const dom = await loadPage();
  const tabs = [...dom.document.querySelectorAll('[role="tab"]')];
  assert.deepStrictEqual(
    tabs.map((t) => t.textContent.trim()),
    PAGE_NAMES,
  );
  assert.deepStrictEqual(
    tabs.map((t) => t.getAttribute("aria-controls")),
    PAGE_IDS,
  );
  assert.deepStrictEqual(visiblePanels(dom), ["grupos"]);
  assert.strictEqual(dom.window.location.hash, "#grupos");
  assert.strictEqual(savedView(dom).tab, "grupos");
});

test("página: #canales contiene las tres listas con su título y #datos las tres secciones", async () => {
  const dom = await loadPage();
  const children = (id) =>
    [...dom.document.getElementById(id).children]
      .filter((node) => node.tagName === "SECTION")
      .map((node) => node.id);
  assert.deepStrictEqual(children("canales"), [
    "options-unclassified",
    "options-hidden",
    "options-inactive",
  ]);
  for (const id of children("canales")) {
    assert.ok(dom.document.querySelector(`#canales #${id} h2`), id);
  }
  assert.deepStrictEqual(children("datos"), [
    "copia",
    "sincronizacion",
    "limpieza",
  ]);
  assert.strictEqual(dom.document.getElementById("diagnostico"), null);
  for (const id of children("datos")) {
    assert.ok(dom.document.querySelector(`#datos #${id} h2`), id);
  }
});

test("página: clic en Datos cambia el panel, el hash y guarda tab", async () => {
  const dom = await loadPage();
  dom.document.getElementById("options-tab-datos").click();
  assert.deepStrictEqual(visiblePanels(dom), ["datos"]);
  assert.strictEqual(dom.window.location.hash, "#datos");
  assert.strictEqual(savedView(dom).tab, "datos");
});

test("página: un hash alias abre Canales, lo corrige y desplaza a la sección", async () => {
  const dom = await loadPage({
    url: "https://example.com/options/options.html#options-hidden",
  });
  assert.deepStrictEqual(visiblePanels(dom), ["canales"]);
  assert.strictEqual(dom.window.location.hash, "#canales");
  assert.strictEqual(savedView(dom).tab, "canales");
  // jsdom no implementa scrollIntoView: se simula y se prueba con hashchange
  // (el desplazamiento inicial lo cubre el test de create).
  const scrolled = [];
  dom.window.Element.prototype.scrollIntoView = function scroll() {
    scrolled.push(this.id);
  };
  dom.window.location.hash = "#options-inactive";
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepStrictEqual(visiblePanels(dom), ["canales"]);
  assert.strictEqual(dom.window.location.hash, "#canales");
  assert.deepStrictEqual(scrolled, ["options-inactive"]);
});

test("página: con un hash alias vuelve a desplazar a la sección al terminar de pintar", async () => {
  const dom = loadOptionsDom({
    store: {},
    url: "https://example.com/options/options.html#options-inactive",
  });
  // Los scripts ya corrieron (primer desplazamiento, antes de pintar); el
  // render es asíncrono, así que se simula ahora para ver el segundo.
  const scrolled = [];
  dom.window.Element.prototype.scrollIntoView = function scroll() {
    scrolled.push(this.id);
  };
  await dom.flush();
  assert.deepStrictEqual(scrolled, ["options-inactive"]);
});

test("página: el hash #sincronizacion abre Datos", async () => {
  const dom = await loadPage({
    url: "https://example.com/options/options.html#sincronizacion",
  });
  assert.deepStrictEqual(visiblePanels(dom), ["datos"]);
  assert.strictEqual(dom.window.location.hash, "#datos");
});

test("página: sin hash se abre la pestaña guardada", async () => {
  const dom = await loadPage({
    localStorage: {
      youtubeGroupsOptionsView: JSON.stringify({
        version: 1,
        pageSize: 20,
        tab: "datos",
      }),
    },
  });
  assert.deepStrictEqual(visiblePanels(dom), ["datos"]);
  assert.strictEqual(dom.window.location.hash, "#datos");
});

test("página: una pestaña guardada con id antiguo abre su pestaña nueva", async () => {
  const dom = await loadPage({
    localStorage: {
      youtubeGroupsOptionsView: JSON.stringify({
        version: 1,
        pageSize: 20,
        tab: "limpieza",
      }),
    },
  });
  assert.deepStrictEqual(visiblePanels(dom), ["datos"]);
  assert.strictEqual(dom.window.location.hash, "#datos");
  assert.strictEqual(savedView(dom).tab, "datos");
});

test("página: un hash desconocido abre Grupos y se corrige", async () => {
  const dom = await loadPage({
    url: "https://example.com/options/options.html#nope",
  });
  assert.deepStrictEqual(visiblePanels(dom), ["grupos"]);
  assert.strictEqual(dom.window.location.hash, "#grupos");
});

test("página: con localStorage que lanza abre Grupos sin error", async () => {
  const dom = await loadPage({ localStorage: "throws" });
  assert.deepStrictEqual(visiblePanels(dom), ["grupos"]);
});

test("página: cambiar location.hash activa la pestaña", async () => {
  const dom = await loadPage();
  dom.window.location.hash = "#datos";
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepStrictEqual(visiblePanels(dom), ["datos"]);
});

test("página: el aviso con Deshacer es visible en Canales inactivos", async () => {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const url = "https://www.youtube.com/@inactivo";
  const anchor = "https://www.youtube.com/@activo";
  const store = groupsStore([
    makeGroup("a", { name: "A", channels: [{ name: "Inactivo", url }] }),
    makeGroup("b", { name: "B", channels: [{ name: "Activo", url: anchor }] }),
  ]);
  store.youtubeSubscriptions = {
    version: 1,
    channels: {
      [url]: { name: "Inactivo", url, firstSeen: now - 400 * day },
      [anchor]: { name: "Activo", url: anchor, firstSeen: now - 400 * day },
    },
  };
  store.youtubeChannelActivity = {
    version: 1,
    lastFeedAt: now - day,
    channels: {
      [url]: { trackedSince: now - 210 * day, lastPublished: null },
      [anchor]: { trackedSince: now - 210 * day, lastPublished: now - day },
    },
  };
  const dom = loadOptionsDom({ store });
  await dom.flush();
  dom.document.getElementById("options-tab-canales").click();
  const section = dom.document.getElementById("options-inactive");
  section.querySelector("input[data-key]").click();
  [...section.querySelectorAll("button")]
    .find((b) => b.textContent === "Quitar de los grupos (1)")
    .click();
  await dom.flush();
  await dom.flush();
  const notice = dom.document.querySelector(".options__notice");
  assert.ok(notice);
  assert.ok(
    [...notice.querySelectorAll("button")].some(
      (b) => b.textContent === "Deshacer",
    ),
  );
  for (let node = notice; node; node = node.parentElement) {
    assert.strictEqual(node.hidden, false);
  }
});

test("página: cada pestaña tiene su buscador y Datos ninguno", async () => {
  const dom = await loadPage();
  const expected = {
    grupos: ["options-search-groups"],
    canales: ["options-search-channels"],
    datos: [],
  };
  for (const [id, ids] of Object.entries(expected)) {
    dom.document.getElementById(`options-tab-${id}`).click();
    const visible = [
      ...dom.document.querySelectorAll('input[type="search"]'),
    ].filter((input) => {
      for (let node = input; node; node = node.parentElement) {
        if (node.hidden) {
          return false;
        }
      }
      return true;
    });
    assert.deepStrictEqual(
      visible.map((input) => input.id),
      ids,
      id,
    );
  }
});

test("página: preferencias antiguas con collapsed cargan y se reescriben sin él", async () => {
  for (const collapsed of [["hidden"], ["channels"]]) {
    const dom = await loadPage({
      localStorage: {
        youtubeGroupsOptionsView: JSON.stringify({
          version: 1,
          pageSize: 20,
          collapsed,
        }),
      },
    });
    dom.document.getElementById("options-tab-canales").click();
    assert.strictEqual(dom.document.getElementById("canales").hidden, false);
    for (const id of [
      "options-unclassified",
      "options-hidden",
      "options-inactive",
    ]) {
      const panel = dom.document.getElementById(id);
      assert.strictEqual(panel.querySelector("details"), null, id);
      assert.ok(panel.querySelector(".options__list-frame"), id);
    }
    const select = dom.document.getElementById("options-page-size");
    assert.ok(select, "selector de tamaño");
    select.value = "50";
    select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    const saved = savedView(dom);
    assert.strictEqual(saved.version, 1);
    assert.strictEqual(saved.pageSize, 50);
    assert.ok("tab" in saved);
    assert.ok(!("collapsed" in saved));
  }
});

test("página: + Grupo y Ordenar A-Z están dentro de Grupos", async () => {
  const dom = await loadPage();
  assert.ok(dom.document.querySelector("#grupos #options-add-group"));
  assert.ok(dom.document.querySelector("#grupos #options-sort-root"));
});
