// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { loadDom, loadOptionsDom } = require("./helpers/load-dom");
const { makeGroup, groupsStore } = require("./helpers/youtube-fixtures");

/**
 * Carga solo view-prefs.js y devuelve su API.
 * @param {Object} [options] - Opciones de loadDom.
 * @returns {{prefs: Object, dom: Object}} API y entorno.
 */
function loadPrefs(options = {}) {
  const dom = loadDom({
    url: "https://example.com/options/options.html",
    scripts: ["options/view-prefs.js"],
    ...options,
  });
  return { prefs: dom.global("YouTubeGroupsViewPrefs"), dom };
}

test("normalizeViewPrefs: valores no válidos dan los de por defecto", () => {
  const { prefs } = loadPrefs();
  for (const value of [null, undefined, 5, "x", [], { pageSize: 30 }]) {
    const result = prefs.normalizeViewPrefs(value);
    assert.strictEqual(result.pageSize, 20);
    assert.strictEqual(result.tab, null);
  }
  assert.strictEqual(prefs.normalizeViewPrefs({ pageSize: "50" }).pageSize, 20);
});

test("normalizeViewPrefs: tamaños permitidos", () => {
  const { prefs } = loadPrefs();
  for (const size of [10, 20, 50, 100]) {
    assert.strictEqual(
      prefs.normalizeViewPrefs({ pageSize: size }).pageSize,
      size,
    );
  }
});

test("normalizeViewPrefs: tab válido se conserva; vacío, no cadena o largo → null", () => {
  const { prefs } = loadPrefs();
  assert.strictEqual(prefs.normalizeViewPrefs({ tab: "copia" }).tab, "copia");
  assert.strictEqual(
    prefs.normalizeViewPrefs({ tab: "a".repeat(64) }).tab,
    "a".repeat(64),
  );
  for (const tab of ["", 5, null, undefined, {}, "a".repeat(65)]) {
    assert.strictEqual(prefs.normalizeViewPrefs({ tab }).tab, null);
  }
  assert.strictEqual(prefs.normalizeViewPrefs(null).tab, null);
});

test("saveViewPrefs escribe tab y loadViewPrefs lo devuelve", () => {
  const { prefs, dom } = loadPrefs();
  prefs.saveViewPrefs(dom.localStorage, { pageSize: 50, tab: "limpieza" });
  const stored = JSON.parse(dom.localStorage.getItem(prefs.STORAGE_KEY));
  assert.strictEqual(stored.tab, "limpieza");
  assert.strictEqual(stored.version, 1);
  assert.strictEqual(prefs.loadViewPrefs(dom.localStorage).tab, "limpieza");
});

test("loadViewPrefs: sin datos o con JSON corrupto da los de por defecto", () => {
  const { prefs, dom } = loadPrefs();
  assert.strictEqual(prefs.loadViewPrefs(dom.localStorage).pageSize, 20);
  dom.localStorage.setItem(prefs.STORAGE_KEY, "{no es json");
  const result = prefs.loadViewPrefs(dom.localStorage);
  assert.strictEqual(result.pageSize, 20);
  assert.strictEqual(result.tab, null);
});

test("loadViewPrefs: localStorage que lanza al acceder o al leer", () => {
  const { prefs, dom } = loadPrefs({ localStorage: "throws" });
  assert.strictEqual(dom.localStorage, null);
  const getter = () => dom.window.localStorage;
  assert.strictEqual(prefs.loadViewPrefs(getter).pageSize, 20);
  const failing = {
    getItem() {
      throw new Error("denegado");
    },
  };
  assert.strictEqual(prefs.loadViewPrefs(failing).pageSize, 20);
  assert.strictEqual(prefs.loadViewPrefs(null).pageSize, 20);
});

test("saveViewPrefs: fallar al guardar no lanza", () => {
  const { prefs, dom } = loadPrefs({ localStorage: "throws" });
  const failing = {
    setItem() {
      throw new Error("cuota");
    },
  };
  assert.strictEqual(prefs.saveViewPrefs(failing, { pageSize: 50 }), false);
  assert.strictEqual(
    prefs.saveViewPrefs(() => dom.window.localStorage, { pageSize: 50 }),
    false,
  );
  assert.strictEqual(prefs.saveViewPrefs(null, {}), false);
});

test("guardar y cargar: ida y vuelta normalizada", () => {
  const { prefs, dom } = loadPrefs();
  assert.strictEqual(
    prefs.saveViewPrefs(dom.localStorage, {
      pageSize: 100,
      collapsed: ["inactive"],
    }),
    true,
  );
  const stored = JSON.parse(dom.localStorage.getItem(prefs.STORAGE_KEY));
  assert.deepStrictEqual(stored, { version: 1, pageSize: 100, tab: null });
  const result = prefs.loadViewPrefs(dom.localStorage);
  assert.strictEqual(result.pageSize, 100);
  assert.strictEqual("collapsed" in result, false);
});

test("normalizeViewPrefs: collapsed guardado (incluido channels) se ignora", () => {
  const { prefs } = loadPrefs();
  for (const collapsed of [["hidden"], ["channels"], "hidden"]) {
    const result = prefs.normalizeViewPrefs({ pageSize: 50, collapsed });
    assert.deepStrictEqual({ ...result }, { pageSize: 50, tab: null });
  }
  assert.strictEqual(prefs.COLLAPSIBLE_IDS, undefined);
});

test("loadDom siembra localStorage antes de ejecutar los scripts", () => {
  const seeded = JSON.stringify({ pageSize: 10, tab: "copia" });
  const { prefs, dom } = loadPrefs({
    localStorage: { youtubeGroupsOptionsView: seeded },
  });
  const result = prefs.loadViewPrefs(dom.window.localStorage);
  assert.strictEqual(result.pageSize, 10);
  assert.strictEqual(result.tab, "copia");
});

/**
 * Carga view-prefs.js y pager.js y devuelve la API del paginador.
 * @returns {{pager: Object, dom: Object}} API y entorno.
 */
function loadPager() {
  const dom = loadDom({
    url: "https://example.com/options/options.html",
    scripts: ["options/view-prefs.js", "options/pager.js"],
  });
  return { pager: dom.global("YouTubeGroupsPager"), dom };
}

test("resolvePage: sin previo, página 1 y pageCount mínimo 1", () => {
  const { pager } = loadPager();
  const result = pager.resolvePage(null, { total: 0, pageSize: 20, query: "" });
  assert.deepStrictEqual(
    { ...result },
    { page: 1, pageCount: 1, start: 0, end: 0, pageSize: 20, query: "" },
  );
  const second = pager.resolvePage(null, {
    total: 25,
    pageSize: 20,
    query: "",
  });
  assert.strictEqual(second.pageCount, 2);
  assert.strictEqual(second.end, 20);
});

test("resolvePage: búsqueda nueva vuelve a la 1", () => {
  const { pager } = loadPager();
  const prev = { page: 2, pageSize: 10, query: "" };
  const result = pager.resolvePage(prev, {
    total: 30,
    pageSize: 10,
    query: "a",
  });
  assert.strictEqual(result.page, 1);
  assert.strictEqual(result.query, "a");
});

test("resolvePage: mismos criterios conservan la página; si no existe, la última", () => {
  const { pager } = loadPager();
  const prev = { page: 3, pageSize: 10, query: "" };
  const same = (total) =>
    pager.resolvePage(prev, { total, pageSize: 10, query: "" });
  assert.strictEqual(same(30).page, 3);
  assert.strictEqual(same(21).page, 3);
  const last = same(12);
  assert.strictEqual(last.page, 2);
  assert.strictEqual(last.start, 10);
  assert.strictEqual(last.end, 12);
  assert.strictEqual(same(0).page, 1);
});

test("resolvePage: cambio de tamaño lleva a la página del primer canal visible", () => {
  const { pager } = loadPager();
  // Página 3 de tamaño 10 empieza en el índice 20.
  const bigger = pager.resolvePage(
    { page: 3, pageSize: 10, query: "" },
    { total: 100, pageSize: 50, query: "" },
  );
  assert.strictEqual(bigger.page, 1);
  const smaller = pager.resolvePage(
    { page: 2, pageSize: 50, query: "" },
    { total: 100, pageSize: 10, query: "" },
  );
  assert.strictEqual(smaller.page, 6);
  assert.strictEqual(smaller.start, 50);
});

test("describePage: singular y plural", () => {
  const { pager } = loadPager();
  assert.strictEqual(
    pager.describePage({ page: 2, pageCount: 5, total: 87 }),
    "Página 2 de 5 · 87 canales",
  );
  assert.strictEqual(
    pager.describePage({ page: 1, pageCount: 1, total: 1 }),
    "Página 1 de 1 · 1 canal",
  );
});

test("createListFrame: marco sin details con h2, cuerpo y región viva", () => {
  const { pager, dom } = loadPager();
  const container = dom.document.createElement("section");
  const frame = pager.createListFrame(container, {
    titleId: "options-x-title",
    label: "Lista X",
  });
  assert.strictEqual(frame.details, undefined);
  assert.strictEqual(container.querySelector("details, summary"), null);
  assert.strictEqual(frame.frame.tagName, "DIV");
  assert.strictEqual(frame.frame.parentNode, container);
  assert.strictEqual(frame.title.tagName, "H2");
  assert.strictEqual(frame.title.id, "options-x-title");
  assert.strictEqual(frame.title.parentNode, frame.frame);
  assert.ok(frame.body.parentNode === frame.frame);
  assert.strictEqual(frame.body.getAttribute("role"), "group");
  assert.strictEqual(frame.body.getAttribute("aria-label"), "Lista X");
  const live = container.querySelector('[role="status"]');
  assert.ok(live);
  assert.strictEqual(live.getAttribute("aria-live"), "polite");
  assert.ok(!frame.body.contains(live));
  frame.announce("Página 2 de 3 · 50 canales");
  assert.strictEqual(live.textContent, "Página 2 de 3 · 50 canales");
});

test("createListFrame: con controls, van justo tras el título y fuera del cuerpo", () => {
  const { pager, dom } = loadPager();
  const container = dom.document.createElement("section");
  const controls = dom.document.createElement("label");
  const frame = pager.createListFrame(container, {
    titleId: "options-x-title",
    label: "Lista X",
    controls,
  });
  assert.strictEqual(controls.parentNode, frame.frame);
  assert.strictEqual(frame.frame.firstElementChild, frame.title);
  assert.strictEqual(frame.frame.children[1], controls);
  assert.ok(!frame.body.contains(controls));
});

test("createListFrame: sin controls, el marco es título, región viva y cuerpo", () => {
  const { pager, dom } = loadPager();
  const container = dom.document.createElement("section");
  const frame = pager.createListFrame(container, {
    titleId: "options-x-title",
    label: "Lista X",
  });
  assert.deepStrictEqual(
    [...frame.frame.children].map((node) => node.tagName),
    ["H2", "DIV", "DIV"],
  );
});

test("ocultos: con pageSizeControl, pintar dos veces deja el mismo nodo en su sitio", async () => {
  const dom = await loadHidden(3);
  const section = dom.document.createElement("section");
  dom.document.body.append(section);
  const pageSizeControl = dom.document.createElement("label");
  const list = dom.global("YouTubeGroupsHiddenList").create(section, {
    showNotice() {},
    pageSizeControl,
  });
  const data = {
    hiddenChannels: manyHidden(3).channels,
    avatars: {},
    query: "",
  };
  list.render(data);
  const frame = section.querySelector(".options__list-frame");
  assert.strictEqual(pageSizeControl.parentNode, frame);
  assert.strictEqual(frame.children[1], pageSizeControl);
  list.render(data);
  assert.strictEqual(pageSizeControl.parentNode, frame);
  assert.strictEqual(frame.children[1], pageSizeControl);
  assert.strictEqual(frame.querySelectorAll("label").length, 1);
});

test("createPageControls: botones, aria-label y extremos desactivados", () => {
  const { pager } = loadPager();
  const calls = [];
  const first = pager.createPageControls({
    label: "Canales ocultos",
    page: 1,
    pageCount: 3,
    total: 50,
    onPage: (page, key) => calls.push([page, key]),
  });
  const buttons = first.querySelectorAll("button");
  assert.strictEqual(buttons.length, 2);
  const [prev, next] = buttons;
  assert.strictEqual(
    prev.getAttribute("aria-label"),
    "Página anterior de Canales ocultos",
  );
  assert.strictEqual(
    next.getAttribute("aria-label"),
    "Página siguiente de Canales ocultos",
  );
  assert.strictEqual(prev.disabled, true);
  assert.strictEqual(next.disabled, false);
  assert.ok(first.textContent.includes("Página 1 de 3 · 50 canales"));
  next.click();
  assert.strictEqual(calls[0][0], 2);
  assert.deepStrictEqual(calls[0], [2, "page-next"]);

  const last = pager.createPageControls({
    label: "X",
    page: 3,
    pageCount: 3,
    total: 50,
    onPage: (page, key) => calls.push([page, key]),
  });
  const [p2, n2] = last.querySelectorAll("button");
  assert.strictEqual(p2.disabled, false);
  assert.strictEqual(n2.disabled, true);
  p2.click();
  assert.deepStrictEqual(calls[1], [2, "page-prev"]);
});

/**
 * Crea un marco y una paginación de prueba.
 * @returns {Object} Entorno, marco, paginación y contador de repintados.
 */
function makePaging() {
  const { pager, dom } = loadPager();
  const container = dom.document.createElement("section");
  dom.document.body.append(container);
  const frame = pager.createListFrame(container, {
    titleId: "options-x-title",
    label: "Lista X",
  });
  const announced = [];
  const realAnnounce = frame.announce;
  frame.announce = (text) => {
    announced.push(text);
    realAnnounce(text);
  };
  const state = { renders: 0, paging: null, info: null, data: null };
  const paging = pager.createListPaging(frame, {
    label: "Lista X",
    rerender() {
      state.renders += 1;
      state.info = paging.resolve(state.data);
      frame.body.replaceChildren();
      const controls = paging.controls();
      if (controls) {
        frame.body.append(controls);
      }
    },
  });
  state.paging = paging;
  return { dom, frame, paging, state, announced };
}

test("createListPaging: sin pageSize usa 20 y 25 elementos dan 2 páginas", () => {
  const { paging } = makePaging();
  const info = paging.resolve({ total: 25, pageSize: undefined, query: "" });
  assert.strictEqual(info.pageCount, 2);
  assert.strictEqual(info.start, 0);
  assert.strictEqual(info.end, 20);
});

test("createListPaging: con una página, controls es null", () => {
  const { paging } = makePaging();
  paging.resolve({ total: 5, pageSize: 20, query: "" });
  assert.strictEqual(paging.controls(), null);
});

test("createListPaging: Siguiente repinta, anuncia y deja el foco en page-prev", () => {
  const { frame, paging, state, announced } = makePaging();
  state.data = { total: 25, pageSize: undefined, query: "" };
  paging.resolve(state.data);
  const controls = paging.controls();
  frame.body.append(controls);
  controls.querySelector('[data-focus-key="page-next"]').click();
  assert.strictEqual(state.renders, 1);
  assert.deepStrictEqual(announced, ["Página 2 de 2 · 25 canales"]);
  assert.strictEqual(state.info.page, 2);
  assert.strictEqual(state.info.focusKey, "page-prev");
});

test("createListPaging: focusNext manda sobre el control enfocado", () => {
  const { dom, frame, paging } = makePaging();
  const button = dom.document.createElement("button");
  button.setAttribute("data-focus-key", "otro");
  frame.body.append(button);
  button.focus();
  paging.focusNext("x");
  const info = paging.resolve({ total: 3, pageSize: 20, query: "" });
  assert.strictEqual(info.focusKey, "x");
  const next = paging.resolve({ total: 3, pageSize: 20, query: "" });
  assert.strictEqual(next.focusKey, "otro");
});

test("createListPaging: una búsqueda nueva vuelve a la página 1", () => {
  const { paging, state } = makePaging();
  state.data = { total: 25, pageSize: 10, query: "" };
  paging.resolve(state.data);
  paging.controls().querySelector('[data-focus-key="page-next"]').click();
  assert.strictEqual(state.info.page, 2);
  const same = paging.resolve({ total: 25, pageSize: 10, query: "" });
  assert.strictEqual(same.page, 2);
  const search = paging.resolve({ total: 25, pageSize: 10, query: "a" });
  assert.strictEqual(search.page, 1);
});

test("captureFocus/restoreFocus: devuelve el foco al control con la misma clave", () => {
  const { pager, dom } = loadPager();
  const root = dom.document.createElement("div");
  dom.document.body.append(root);
  const a = dom.document.createElement("button");
  a.setAttribute("data-focus-key", "a");
  root.append(a);
  a.focus();
  const key = pager.captureFocus(root);
  assert.strictEqual(key, "a");
  root.replaceChildren();
  const b = dom.document.createElement("button");
  b.setAttribute("data-focus-key", "a");
  root.append(b);
  pager.restoreFocus(root, key);
  assert.strictEqual(dom.document.activeElement, b);
  assert.doesNotThrow(() => pager.restoreFocus(root, null));
  assert.doesNotThrow(() => pager.restoreFocus(root, "no-existe"));
});

/**
 * Carga la página de opciones con preferencias de vista sembradas.
 * @param {Object|"throws"|null} seed - Preferencias, `"throws"` o `null`.
 * @returns {Promise<Object>} DOM cargado.
 */
async function loadOptionsWithView(seed) {
  const localStorage =
    seed === "throws"
      ? "throws"
      : seed
        ? { youtubeGroupsOptionsView: JSON.stringify(seed) }
        : undefined;
  const dom = loadOptionsDom({ store: {}, localStorage });
  await dom.flush();
  return dom;
}

const LIST_IDS = ["unclassified", "hidden", "inactive"];

/**
 * Selector único de tamaño de página de las tres listas.
 * @param {Object} dom - DOM cargado.
 * @returns {HTMLSelectElement} Selector.
 */
function sizeSelectOf(dom) {
  return dom.document.getElementById("options-page-size");
}

/**
 * Cambia un selector de tamaño y avisa con `change`.
 * @param {Object} dom - DOM cargado.
 * @param {HTMLSelectElement} select - Selector.
 * @param {string} value - Valor nuevo.
 * @returns {void}
 */
function changeSize(dom, select, value) {
  select.value = value;
  select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
}

test("estructura: las listas son hijas de #canales y no hay selector por lista", async () => {
  const dom = await loadOptionsWithView(null);
  const { document } = dom;
  const canales = document.getElementById("canales");
  assert.strictEqual(canales.parentElement.tagName, "MAIN");
  assert.strictEqual(document.querySelector("details details"), null);
  for (const listId of LIST_IDS) {
    const section = document.getElementById(`options-${listId}`);
    assert.strictEqual(section.parentElement, canales);
    assert.strictEqual(section.firstElementChild.tagName, "DIV");
    assert.strictEqual(section.querySelector("details"), null);
    assert.strictEqual(
      section.querySelector("select.options__page-size"),
      null,
    );
    assert.strictEqual(section.querySelector("label.options__page-size"), null);
  }
});

test("el selector único de tamaño de #canales muestra 20 por defecto", async () => {
  const dom = await loadOptionsWithView(null);
  const selects = dom.document.querySelectorAll(
    "#canales select#options-page-size",
  );
  assert.strictEqual(selects.length, 1);
  const select = sizeSelectOf(dom);
  assert.ok(select.closest("#canales > .options__toolbar"));
  assert.strictEqual(select.getAttribute("aria-label"), "Canales por página");
  assert.deepStrictEqual(
    [...select.options].map((option) => option.value),
    ["10", "20", "50", "100"],
  );
  assert.strictEqual(select.value, "20");
  assert.ok(select.closest("label").textContent.includes("canales por página"));
});

test("el selector muestra el valor guardado y cambiarlo lo guarda", async () => {
  const dom = await loadOptionsWithView({ pageSize: 50, collapsed: [] });
  const select = sizeSelectOf(dom);
  assert.strictEqual(select.value, "50");
  changeSize(dom, select, "100");
  const saved = JSON.parse(
    dom.localStorage.getItem("youtubeGroupsOptionsView"),
  );
  assert.strictEqual(saved.pageSize, 100);
});

test("cambiar el selector repinta las listas, guarda y conserva el foco", async () => {
  const dom = await loadHidden(25);
  dom.document.getElementById("options-tab-canales").click();
  const hiddenSection = dom.document.getElementById("options-hidden");
  assert.strictEqual(hiddenSection.querySelectorAll("li").length, 20);
  const select = sizeSelectOf(dom);
  select.focus();
  changeSize(dom, select, "50");
  await dom.flush();
  const saved = JSON.parse(
    dom.localStorage.getItem("youtubeGroupsOptionsView"),
  );
  assert.strictEqual(saved.pageSize, 50);
  assert.strictEqual(
    hiddenSection.querySelectorAll(".options__pager").length,
    0,
  );
  assert.strictEqual(hiddenSection.querySelectorAll("li").length, 25);
  assert.strictEqual(dom.document.activeElement, select);
  assert.ok(select.isConnected);
});

test("preferencias antiguas con collapsed cargan sin error y no se reescriben", async () => {
  for (const collapsed of [["hidden"], ["channels"]]) {
    const dom = await loadOptionsWithView({ pageSize: 20, collapsed });
    for (const listId of LIST_IDS) {
      const section = dom.document.getElementById(`options-${listId}`);
      assert.ok(section.querySelector(".options__list-frame"));
      assert.strictEqual(section.querySelector("details"), null);
    }
    changeSize(dom, sizeSelectOf(dom), "50");
    const saved = JSON.parse(
      dom.localStorage.getItem("youtubeGroupsOptionsView"),
    );
    assert.strictEqual(saved.version, 1);
    assert.strictEqual(saved.pageSize, 50);
    assert.strictEqual("collapsed" in saved, false);
    assert.deepStrictEqual(Object.keys(saved).sort(), [
      "pageSize",
      "tab",
      "version",
    ]);
  }
});

test("con localStorage que lanza, la página carga con 20 y las listas visibles", async () => {
  const dom = await loadOptionsWithView("throws");
  assert.strictEqual(sizeSelectOf(dom).value, "20");
  for (const listId of LIST_IDS) {
    assert.ok(
      dom.document.querySelector(`#options-${listId} .options__list-frame`),
    );
  }
  assert.doesNotThrow(() => changeSize(dom, sizeSelectOf(dom), "10"));
});

const YT = "https://www.youtube.com";

/**
 * Crea el valor de `youtubeHiddenChannels` con `count` canales (c01, c02...);
 * el más reciente es el primero de la lista.
 * @param {number} count - Número de canales ocultos.
 * @returns {Object} Valor guardado.
 */
function manyHidden(count) {
  const channels = {};
  for (let i = 1; i <= count; i += 1) {
    const handle = `c${String(i).padStart(2, "0")}`;
    const url = `${YT}/@${handle}`;
    channels[url] = { name: `Canal ${handle}`, url, hiddenAt: 1000 - i };
  }
  return { version: 1, channels };
}

/**
 * Carga la página de opciones con `count` canales ocultos.
 * @param {number} count - Número de canales ocultos.
 * @param {Object} [view] - Preferencias de vista sembradas.
 * @returns {Promise<Object>} DOM cargado.
 */
async function loadHidden(count, view) {
  const localStorage = view
    ? { youtubeGroupsOptionsView: JSON.stringify(view) }
    : undefined;
  const dom = loadOptionsDom({
    store: { youtubeHiddenChannels: manyHidden(count) },
    localStorage,
  });
  await dom.flush();
  return dom;
}

/**
 * Botón de la sección de ocultos por su `data-focus-key`.
 * @param {Object} dom - DOM cargado.
 * @param {string} key - Clave.
 * @returns {HTMLElement} Botón.
 */
function hiddenButton(dom, key) {
  return dom.document.querySelector(
    `#options-hidden [data-focus-key="${key}"]`,
  );
}

test("ocultos: 20 filas, controles y Siguiente muestra 5 y anuncia", async () => {
  const dom = await loadHidden(25);
  dom.document.getElementById("options-tab-canales").click();
  const section = dom.document.getElementById("options-hidden");
  assert.strictEqual(section.querySelectorAll("li").length, 20);
  assert.strictEqual(
    section.querySelector(".options__pager-status").textContent,
    "Página 1 de 2 · 25 canales",
  );
  assert.strictEqual(
    section.querySelector("h2").textContent,
    "Canales ocultos (25)",
  );
  hiddenButton(dom, "page-next").click();
  assert.strictEqual(section.querySelectorAll("li").length, 5);
  assert.strictEqual(
    section.querySelector('[role="status"]').textContent,
    "Página 2 de 2 · 25 canales",
  );
  assert.strictEqual(
    dom.document.activeElement,
    hiddenButton(dom, "page-prev"),
  );
});

test("ocultos: con una sola página no hay controles", async () => {
  const dom = await loadHidden(20);
  assert.strictEqual(
    dom.document.querySelectorAll("#options-hidden .options__pager").length,
    0,
  );
});

test("ocultos: dejar de ocultar el único de la página 2 vuelve a la 1", async () => {
  const dom = await loadHidden(21);
  const section = dom.document.getElementById("options-hidden");
  hiddenButton(dom, "page-next").click();
  assert.strictEqual(section.querySelectorAll("li").length, 1);
  section.querySelector("li button").click();
  await dom.flush();
  await dom.flush();
  assert.strictEqual(section.querySelectorAll("li").length, 20);
  assert.strictEqual(
    section.querySelector("h2").textContent,
    "Canales ocultos (20)",
  );
});

test("ocultos: buscar vuelve a la página 1", async () => {
  const dom = await loadHidden(25);
  const section = dom.document.getElementById("options-hidden");
  hiddenButton(dom, "page-next").click();
  const search = dom.document.getElementById("options-search-channels");
  search.value = "canal c";
  search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await dom.flush();
  assert.strictEqual(
    section.querySelector(".options__pager-status").textContent,
    "Página 1 de 2 · 25 canales",
  );
});

test("ocultos: el buscador de Grupos no cambia la página, el de Canales sí", async () => {
  const dom = await loadHidden(25);
  const section = dom.document.getElementById("options-hidden");
  const status = () =>
    section.querySelector(".options__pager-status").textContent;
  hiddenButton(dom, "page-next").click();
  assert.strictEqual(status(), "Página 2 de 2 · 25 canales");
  const groups = dom.document.getElementById("options-search-groups");
  groups.value = "x";
  groups.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await dom.flush();
  assert.strictEqual(status(), "Página 2 de 2 · 25 canales");
  const channels = dom.document.getElementById("options-search-channels");
  channels.value = "canal c";
  channels.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await dom.flush();
  assert.strictEqual(status(), "Página 1 de 2 · 25 canales");
});

test("ocultos: un cambio de datos externo no cambia de página", async () => {
  const dom = await loadHidden(45);
  const section = dom.document.getElementById("options-hidden");
  hiddenButton(dom, "page-next").click();
  await dom.browser.storage.local.set({
    youtubeHiddenChannels: manyHidden(44),
  });
  await dom.flush();
  assert.strictEqual(
    section.querySelector(".options__pager-status").textContent,
    "Página 2 de 3 · 44 canales",
  );
});

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Carga la página de opciones con `count` canales inactivos (i01, i02...) en el
 * grupo A y un canal activo en el grupo B.
 * @param {number} count - Número de canales inactivos.
 * @param {Object} [view] - Preferencias de vista sembradas.
 * @returns {Promise<Object>} DOM cargado.
 */
async function loadInactive(count, view) {
  const now = Date.now();
  const inactive = [];
  const subs = {};
  const activity = {};
  for (let i = 1; i <= count; i += 1) {
    const handle = `i${String(i).padStart(2, "0")}`;
    const url = `${YT}/@${handle}`;
    inactive.push({ name: `Inactivo ${handle}`, url });
    subs[url] = {
      name: `Inactivo ${handle}`,
      url,
      firstSeen: now - 400 * DAY_MS,
    };
    activity[url] = {
      trackedSince: now - 7 * 30 * DAY_MS,
      lastPublished: null,
    };
  }
  const anchor = `${YT}/@activo`;
  subs[anchor] = { name: "Activo", url: anchor, firstSeen: now - 400 * DAY_MS };
  activity[anchor] = {
    trackedSince: now - 7 * 30 * DAY_MS,
    lastPublished: now - DAY_MS,
  };
  const store = groupsStore([
    makeGroup("a", { name: "A", channels: inactive }),
    makeGroup("b", { name: "B", channels: [{ name: "Activo", url: anchor }] }),
  ]);
  store.youtubeSubscriptions = { version: 1, channels: subs };
  store.youtubeChannelActivity = {
    version: 1,
    lastFeedAt: now - DAY_MS,
    channels: activity,
  };
  const localStorage = view
    ? { youtubeGroupsOptionsView: JSON.stringify(view) }
    : undefined;
  const dom = loadOptionsDom({ store, localStorage });
  await dom.flush();
  return dom;
}

/**
 * Texto de un botón de la sección de inactivos.
 * @param {Object} dom - DOM cargado.
 * @param {string} text - Texto del botón.
 * @returns {HTMLElement|undefined} Botón.
 */
function inactiveButton(dom, text) {
  return [...dom.document.querySelectorAll("#options-inactive button")].find(
    (button) => button.textContent === text,
  );
}

test("inactivos: la selección se conserva entre páginas y quitar usa toda", async () => {
  const dom = await loadInactive(25);
  const section = dom.document.getElementById("options-inactive");
  assert.strictEqual(section.querySelectorAll("li").length, 20);
  assert.strictEqual(
    section.querySelector(".options__pager-status").textContent,
    "Página 1 de 2 · 25 canales",
  );
  section.querySelector("input[data-key]").click();
  assert.ok(inactiveButton(dom, "Quitar de los grupos (1)"));
  section.querySelector('[data-focus-key="page-next"]').click();
  assert.strictEqual(section.querySelectorAll("li").length, 5);
  assert.strictEqual(
    section.querySelector('[role="status"]').textContent,
    "Página 2 de 2 · 25 canales",
  );
  assert.ok(inactiveButton(dom, "Quitar de los grupos (1)"));
  section.querySelector("input[data-key]").click();
  assert.ok(inactiveButton(dom, "Quitar de los grupos (2)"));
  inactiveButton(dom, "Quitar de los grupos (2)").click();
  await dom.flush();
  await dom.flush();
  assert.strictEqual(dom.store.youtubeGroups.groups[0].channels.length, 23);
});

test("inactivos: Seleccionar la página solo marca la página", async () => {
  const dom = await loadInactive(25);
  const section = dom.document.getElementById("options-inactive");
  const all = section.querySelector('[aria-label="Seleccionar la página"]');
  assert.ok(all);
  all.click();
  assert.ok(inactiveButton(dom, "Quitar de los grupos (20)"));
  section.querySelector('[data-focus-key="page-next"]').click();
  const box = section.querySelector('[aria-label="Seleccionar la página"]');
  assert.strictEqual(box.checked, false);
  assert.strictEqual(box.indeterminate, false);
  assert.ok(inactiveButton(dom, "Quitar de los grupos (20)"));
});

test("inactivos: cambiar el umbral conserva la página si existe", async () => {
  const dom = await loadInactive(25);
  dom.document.getElementById("options-tab-canales").click();
  const section = dom.document.getElementById("options-inactive");
  section.querySelector('[data-focus-key="page-next"]').click();
  const select = section.querySelector(".options__inactive-threshold");
  select.value = "3";
  select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  await dom.flush();
  assert.strictEqual(
    section.querySelector(".options__pager-status").textContent,
    "Página 2 de 2 · 25 canales",
  );
  assert.strictEqual(
    dom.document.activeElement,
    section.querySelector(".options__inactive-threshold"),
  );
});

/**
 * Carga la página de opciones con `count` suscripciones sin grupo (s01, s02...;
 * la más reciente es la de número mayor) y un grupo "M" con la palabra clave
 * "rock", que sugiere las suscripciones cuyo nombre la contiene.
 * @param {number} count - Número de suscripciones.
 * @param {Array<number>} rock - Números de las suscripciones con "rock".
 * @param {Object} [view] - Preferencias de vista sembradas.
 * @returns {Promise<Object>} DOM cargado.
 */
async function loadUnclassified(count, rock = [], view) {
  const channels = {};
  for (let i = 1; i <= count; i += 1) {
    const handle = `s${String(i).padStart(2, "0")}`;
    const url = `${YT}/@${handle}`;
    const name = rock.includes(i) ? `Rock ${handle}` : `Sub ${handle}`;
    channels[url] = { name, url, firstSeen: i };
  }
  const store = groupsStore([
    { ...makeGroup("m", { name: "M" }), keywords: ["rock"] },
  ]);
  store.youtubeSubscriptions = { version: 1, channels };
  const localStorage = view
    ? { youtubeGroupsOptionsView: JSON.stringify(view) }
    : undefined;
  const dom = loadOptionsDom({ store, localStorage });
  await dom.flush();
  return dom;
}

/**
 * Botón de la bandeja de sin grupo por su texto.
 * @param {Object} dom - DOM cargado.
 * @param {string} text - Texto del botón.
 * @returns {HTMLElement|undefined} Botón.
 */
function unclassifiedButton(dom, text) {
  return [
    ...dom.document.querySelectorAll("#options-unclassified button"),
  ].find((button) => button.textContent === text);
}

test("sin grupo: 20 filas, controles y la selección se conserva entre páginas", async () => {
  const dom = await loadUnclassified(25);
  const section = dom.document.getElementById("options-unclassified");
  assert.strictEqual(section.querySelectorAll("li").length, 20);
  assert.strictEqual(
    section.querySelector("h2").textContent,
    "Canales sin grupo (25)",
  );
  section.querySelector("input[data-url]").click();
  assert.ok(unclassifiedButton(dom, "Añadir a… (1)"));
  section.querySelector('[data-focus-key="page-next"]').click();
  assert.strictEqual(section.querySelectorAll("li").length, 5);
  assert.strictEqual(
    section.querySelector('[role="status"]').textContent,
    "Página 2 de 2 · 25 canales",
  );
  assert.ok(unclassifiedButton(dom, "Añadir a… (1)"));
  const all = section.querySelector('[aria-label="Seleccionar la página"]');
  all.click();
  assert.ok(unclassifiedButton(dom, "Añadir a… (6)"));
});

test("sin grupo: aplicar sugerencias cuenta y aplica solo las de la página", async () => {
  const dom = await loadUnclassified(25, [25, 24, 3]);
  const section = dom.document.getElementById("options-unclassified");
  const groupsSets = [];
  const original = dom.browser.storage.local.set;
  dom.browser.storage.local.set = (items) => {
    if ("youtubeGroups" in items) {
      groupsSets.push(items);
    }
    return original(items);
  };
  const apply = unclassifiedButton(dom, "Aplicar sugerencias de la página (2)");
  assert.ok(apply);
  apply.click();
  await dom.flush();
  await dom.flush();
  assert.strictEqual(groupsSets.length, 1);
  assert.strictEqual(dom.store.youtubeGroups.groups[0].channels.length, 2);
  assert.strictEqual(
    unclassifiedButton(dom, "Aplicar sugerencias de la página (1)"),
    undefined,
  );
  section.querySelector('[data-focus-key="page-next"]').click();
  assert.ok(unclassifiedButton(dom, "Aplicar sugerencias de la página (1)"));
});

test("sin grupo: la página se mantiene tras añadir si sigue existiendo", async () => {
  const dom = await loadUnclassified(45);
  const section = dom.document.getElementById("options-unclassified");
  section.querySelector('[data-focus-key="page-next"]').click();
  section.querySelector("input[data-url]").click();
  unclassifiedButton(dom, "Añadir a… (1)").click();
  const select = section.querySelector(".options__transfer-select");
  select.value = "m";
  select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  unclassifiedButton(dom, "Añadir").click();
  await dom.flush();
  await dom.flush();
  assert.strictEqual(dom.store.youtubeGroups.groups[0].channels.length, 1);
  assert.strictEqual(
    section.querySelector(".options__pager-status").textContent,
    "Página 2 de 3 · 44 canales",
  );
});

test("sin grupo: cambiar el tamaño conserva el primer canal visible", async () => {
  const dom = await loadUnclassified(25);
  const section = dom.document.getElementById("options-unclassified");
  const sizeSelect = sizeSelectOf(dom);
  const setSize = async (value) => {
    sizeSelect.value = value;
    sizeSelect.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    await dom.flush();
  };
  await setSize("10");
  section.querySelector('[data-focus-key="page-next"]').click();
  section.querySelector('[data-focus-key="page-next"]').click();
  assert.strictEqual(
    section.querySelector(".options__pager-status").textContent,
    "Página 3 de 3 · 25 canales",
  );
  await setSize("20");
  assert.strictEqual(
    section.querySelector(".options__pager-status").textContent,
    "Página 2 de 2 · 25 canales",
  );
  assert.strictEqual(section.querySelector("li a").textContent, "Sub s05");
});

test("Canales sin grupo: nombre en botones, etiquetas de las listas y ayuda de palabras clave", async () => {
  const dom = await loadUnclassified(25);
  assert.ok(
    dom.document.querySelector(
      '#options-unclassified [aria-label="Página siguiente de Canales sin grupo"]',
    ),
  );
  assert.strictEqual(
    dom.global("YouTubeGroupsUnclassified").LABEL,
    "Canales sin grupo",
  );
  assert.strictEqual(
    dom.global("YouTubeGroupsHiddenList").LABEL,
    "Canales ocultos",
  );
  assert.strictEqual(
    dom.global("YouTubeGroupsInactiveList").LABEL,
    "Canales inactivos",
  );
  dom.document.querySelector(".options__name").click();
  assert.ok(
    dom.document
      .querySelector(".options__keywords-help")
      .textContent.includes("«Canales sin grupo»"),
  );
});

/**
 * Pinta una lista de sin grupo nueva con `collectRules` contado.
 * @param {Array<Object>} groups - Árbol de grupos.
 * @returns {Promise<{section: HTMLElement, calls: number}>} Sección y contador.
 */
async function renderUnclassifiedCounting(groups) {
  const dom = await loadUnclassified(1);
  const rulesApi = dom.global("YouTubeGroupsKeywordRules");
  const original = rulesApi.collectRules;
  const originalSuggest = rulesApi.suggestForSubscriptions;
  const result = { calls: 0, returned: null, passed: [] };
  rulesApi.collectRules = (tree) => {
    result.calls += 1;
    result.returned = original(tree);
    return result.returned;
  };
  rulesApi.suggestForSubscriptions = (items, tree, rules) => {
    result.passed.push(rules);
    return originalSuggest(items, tree, rules);
  };
  const section = dom.document.createElement("section");
  dom.document.body.append(section);
  const list = dom
    .global("YouTubeGroupsUnclassified")
    .create(section, { showNotice() {} });
  const url = `${YT}/@rock01`;
  list.render({
    groups,
    subscriptions: { [url]: { name: "Rock 01", url, firstSeen: 1 } },
    avatars: {},
    query: "",
  });
  result.section = section;
  return result;
}

test("sin grupo: un render calcula las reglas una sola vez y pinta la sugerencia", async () => {
  const result = await renderUnclassifiedCounting([
    { ...makeGroup("m", { name: "M" }), keywords: ["rock"] },
  ]);
  assert.strictEqual(result.calls, 1);
  assert.strictEqual(result.passed.length, 1);
  assert.ok(Array.isArray(result.passed[0]));
  assert.strictEqual(result.passed[0], result.returned);
  assert.ok(result.section.querySelector(".options__suggestion"));
  assert.ok(
    result.section.textContent.includes("Aplicar sugerencias de la página (1)"),
  );
});

test("sin grupo: sin palabras clave sigue saliendo la ayuda", async () => {
  const result = await renderUnclassifiedCounting([
    makeGroup("m", { name: "M" }),
  ]);
  assert.strictEqual(result.calls, 1);
  assert.ok(
    result.section.textContent.includes("Escribe palabras clave en un grupo"),
  );
});
