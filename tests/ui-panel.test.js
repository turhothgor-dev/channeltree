// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { loadDom, manifestScripts } = require("./helpers/load-dom");
const { GUIDE_HTML } = require("./helpers/youtube-fixtures");

const MENU = "#youtube-groups-menu";
const GEAR = ".youtube-groups__guide-menu-button";

/**
 * Carga una página con la guía, la estabiliza y abre el menú con el engranaje.
 * @param {Object} [options] - Opciones de loadDom (store...).
 * @returns {Promise<Object>} loadDom con `gear` y `menu`.
 */
async function loadWithMenu(options = {}) {
  const dom = loadDom({ html: GUIDE_HTML, ...options });
  await dom.flush();
  const gear = dom.document.querySelector(GEAR);
  gear.click();
  await dom.flush();
  return { ...dom, gear, menu: dom.document.querySelector(MENU) };
}

test("YouTubeGroupsPanel.create no toca el DOM", () => {
  const scripts = manifestScripts().filter((file) => file !== "content.js");
  const dom = loadDom({ scripts });
  const before = dom.document.body.innerHTML;

  const Panel = dom.global("YouTubeGroupsPanel");
  assert.strictEqual(typeof Panel.create, "function");
  const panel = Panel.create({ state: {} });

  assert.strictEqual(dom.document.body.innerHTML, before);
  for (const name of ["toggleMenu", "openMenu", "closeMenu", "isMenuOpen"]) {
    assert.strictEqual(typeof panel[name], "function", name);
  }
  assert.strictEqual(panel.createGroupsPanel, undefined);
});

test("tras cargar no hay panel flotante ni menú", async () => {
  const dom = loadDom({ html: GUIDE_HTML });
  await dom.flush();

  assert.strictEqual(dom.document.querySelector("#youtube-groups-panel"), null);
  assert.strictEqual(dom.document.querySelector(MENU), null);
});

test("el engranaje crea un único menú en body, visible y colocado", async () => {
  const { document, gear, menu } = await loadWithMenu();

  assert.strictEqual(document.querySelectorAll(MENU).length, 1);
  assert.strictEqual(menu.parentElement, document.body);
  assert.strictEqual(menu.hidden, false);
  assert.strictEqual(gear.getAttribute("aria-expanded"), "true");
  assert.strictEqual(menu.querySelector("details, summary"), null);
  assert.strictEqual(
    menu.getAttribute("aria-labelledby"),
    "youtube-groups-menu-title",
  );
  assert.strictEqual(
    menu.querySelector("h2#youtube-groups-menu-title").textContent,
    "Opciones de visualización",
  );
  assert.deepStrictEqual(
    Array.from(menu.querySelectorAll('[role="tab"]'), (tab) => tab.textContent),
    ["Listas", "Filtros", "Ajustes"],
  );
  assert.strictEqual(
    menu.querySelector(".youtube-groups__backup-export"),
    null,
  );
  assert.match(menu.style.left, /^\d+px$/);
  assert.match(menu.style.top, /^\d+px$/);
});

test('el menú no tiene "Más opciones…" y abrirlo solo pide los atajos', async () => {
  const { messages, menu } = await loadWithMenu();

  assert.strictEqual(menu.querySelector(".youtube-groups__menu-more"), null);
  assert.strictEqual(menu.querySelector(".youtube-groups__menu-footer"), null);
  assert.deepStrictEqual(messages, [{ type: "youtube-groups:get-shortcuts" }]);
});

test('el engranaje tiene el título "Opciones: listas, filtros y ajustes"', async () => {
  const { gear } = await loadWithMenu();

  assert.strictEqual(gear.title, "Opciones: listas, filtros y ajustes");
});

test("el menú no tiene Canal actual ni Vídeo actual", async () => {
  const { menu } = await loadWithMenu();

  assert.strictEqual(
    menu.querySelector(".youtube-groups__current-channel"),
    null,
  );
  assert.strictEqual(
    menu.querySelector(".youtube-groups__current-video"),
    null,
  );
});

test("Escape cierra el menú y devuelve el foco al engranaje", async () => {
  const { document, window, gear, menu } = await loadWithMenu();

  document.dispatchEvent(
    new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );

  assert.strictEqual(menu.hidden, true);
  assert.strictEqual(gear.getAttribute("aria-expanded"), "false");
  assert.strictEqual(document.activeElement, gear);
});

test("Escape no cierra el menú con un modal de lista abierto y sí lo hace con preventDefault sin él", async () => {
  const { document, window, menu } = await loadWithMenu();
  const modal = document.createElement("div");
  modal.className = "youtube-groups__channel-list-modal";
  document.body.appendChild(modal);

  const withModal = new window.KeyboardEvent("keydown", {
    key: "Escape",
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(withModal);
  assert.strictEqual(menu.hidden, false);
  assert.strictEqual(withModal.defaultPrevented, false);

  modal.remove();
  const withoutModal = new window.KeyboardEvent("keydown", {
    key: "Escape",
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(withoutModal);
  assert.strictEqual(menu.hidden, true);
  assert.strictEqual(withoutModal.defaultPrevented, true);
});

test("pointerdown fuera cierra el menú y dentro no", async () => {
  const { document, window, menu } = await loadWithMenu();

  menu
    .querySelector('[role="tab"]')
    .dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
  assert.strictEqual(menu.hidden, false);

  document.body.dispatchEvent(
    new window.Event("pointerdown", { bubbles: true }),
  );
  assert.strictEqual(menu.hidden, true);
});

test("el engranaje otra vez cierra el menú y reabrir reutiliza el elemento", async () => {
  const { document, window, gear, menu } = await loadWithMenu();
  const select = menu.querySelector('[data-filter="duration"]');
  select.value = "short";
  select.dispatchEvent(new window.Event("change"));

  gear.click();
  assert.strictEqual(menu.hidden, true);

  gear.click();
  assert.strictEqual(menu.hidden, false);
  assert.strictEqual(document.querySelectorAll(MENU).length, 1);
  assert.strictEqual(document.querySelector(MENU), menu);
  assert.strictEqual(
    menu.querySelector('[data-tab="filtros"]').textContent,
    "Filtros (1)",
  );
});

const TABS = ["listas", "filtros", "ajustes"];
const tabOf = (menu, name) => menu.querySelector(`[data-tab="${name}"]`);
const panelOf = (menu, name) =>
  menu.querySelector(`#youtube-groups-menu-panel-${name}`);

test("al abrir, Listas es la pestaña activa y cada panel es un tabpanel", async () => {
  const { menu } = await loadWithMenu();
  const classes = {
    listas: "youtube-groups__playlists",
    filtros: "youtube-groups__filters",
    ajustes: "youtube-groups__settings",
  };

  for (const name of TABS) {
    const tab = tabOf(menu, name);
    const panel = panelOf(menu, name);
    const active = name === "listas";
    assert.strictEqual(tab.getAttribute("aria-selected"), String(active));
    assert.strictEqual(tab.tabIndex, active ? 0 : -1);
    assert.strictEqual(panel.hidden, !active);
    assert.strictEqual(panel.getAttribute("role"), "tabpanel");
    assert.strictEqual(panel.getAttribute("tabindex"), "0");
    assert.strictEqual(
      panel.getAttribute("aria-labelledby"),
      `youtube-groups-menu-tab-${name}`,
    );
    assert.strictEqual(tab.id, `youtube-groups-menu-tab-${name}`);
    assert.strictEqual(
      tab.getAttribute("aria-controls"),
      `youtube-groups-menu-panel-${name}`,
    );
    assert.ok(panel.classList.contains(classes[name]));
  }
});

test("clic en Ajustes muestra solo su panel", async () => {
  const { menu } = await loadWithMenu();

  tabOf(menu, "ajustes").click();

  for (const name of TABS) {
    assert.strictEqual(panelOf(menu, name).hidden, name !== "ajustes");
    assert.strictEqual(
      tabOf(menu, name).getAttribute("aria-selected"),
      String(name === "ajustes"),
    );
  }
});

test("las flechas, Inicio y Fin cambian de pestaña y mueven el foco", async () => {
  const { document, window, menu } = await loadWithMenu();
  let bubbled = 0;
  document.addEventListener("keydown", () => (bubbled += 1));
  const press = (name, key) => {
    const event = new window.KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
    });
    tabOf(menu, name).dispatchEvent(event);
    return event;
  };

  tabOf(menu, "ajustes").click();
  let event = press("ajustes", "ArrowRight");
  assert.strictEqual(
    tabOf(menu, "listas").getAttribute("aria-selected"),
    "true",
  );
  assert.strictEqual(document.activeElement, tabOf(menu, "listas"));
  assert.strictEqual(event.defaultPrevented, true);

  event = press("listas", "ArrowLeft");
  assert.strictEqual(document.activeElement, tabOf(menu, "ajustes"));
  assert.strictEqual(event.defaultPrevented, true);

  press("ajustes", "Home");
  assert.strictEqual(document.activeElement, tabOf(menu, "listas"));
  press("listas", "End");
  assert.strictEqual(document.activeElement, tabOf(menu, "ajustes"));
  assert.strictEqual(panelOf(menu, "ajustes").hidden, false);
  assert.strictEqual(bubbled, 0);

  event = press("ajustes", "a");
  assert.strictEqual(event.defaultPrevented, false);
  assert.strictEqual(
    tabOf(menu, "ajustes").getAttribute("aria-selected"),
    "true",
  );
});

test("con Ajustes activo, un filtro actualiza el contador de la pestaña", async () => {
  const { window, menu } = await loadWithMenu();
  tabOf(menu, "ajustes").click();

  const select = menu.querySelector('[data-filter="duration"]');
  select.value = "short";
  select.dispatchEvent(new window.Event("change"));

  assert.strictEqual(tabOf(menu, "filtros").textContent, "Filtros (1)");
});

const selectedTab = (menu) =>
  menu.querySelector('[role="tab"][aria-selected="true"]').dataset.tab;

/** Carga la guía con `sessionStorage` sembrado y abre el menú. */
async function loadSeededMenu(seed) {
  const dom = loadDom({ html: GUIDE_HTML, sessionStorage: seed });
  await dom.flush();
  dom.document.querySelector(GEAR).click();
  await dom.flush();
  return { ...dom, menu: dom.document.querySelector(MENU) };
}

test("activar una pestaña la guarda y reabrir el menú la conserva", async () => {
  const { window, gear, menu, flush } = await loadWithMenu();

  tabOf(menu, "filtros").click();

  assert.strictEqual(
    window.sessionStorage.getItem("youtubeGroupsMenuTab"),
    "filtros",
  );
  gear.click();
  await flush();
  gear.click();
  await flush();
  assert.strictEqual(menu.hidden, false);
  assert.strictEqual(selectedTab(menu), "filtros");
});

test("un DOM nuevo abre en la pestaña guardada, o en Listas si es desconocida", async () => {
  const saved = await loadSeededMenu({ youtubeGroupsMenuTab: "ajustes" });
  assert.strictEqual(selectedTab(saved.menu), "ajustes");
  assert.strictEqual(panelOf(saved.menu, "ajustes").hidden, false);

  const unknown = await loadSeededMenu({ youtubeGroupsMenuTab: "otra" });
  assert.strictEqual(selectedTab(unknown.menu), "listas");
});

test("sin sessionStorage utilizable abre en Listas y cambiar de pestaña no lanza", async () => {
  const dom = loadDom({ html: GUIDE_HTML });
  await dom.flush();
  const proto = dom.window.Storage.prototype;
  proto.getItem = () => {
    throw new Error("sin almacenamiento");
  };
  proto.setItem = () => {
    throw new Error("sin almacenamiento");
  };

  dom.document.querySelector(GEAR).click();
  await dom.flush();
  const menu = dom.document.querySelector(MENU);

  assert.strictEqual(selectedTab(menu), "listas");
  assert.doesNotThrow(() => tabOf(menu, "ajustes").click());
  assert.strictEqual(selectedTab(menu), "ajustes");
});

const rectOf = (top, height) => () => ({
  top,
  bottom: top + height,
  left: 100,
  right: 130,
  width: height === 0 ? 0 : 360,
  height,
});

test("cambiar de pestaña con el menú abierto lo recoloca dentro de la ventana", async () => {
  const dom = loadDom({ html: GUIDE_HTML });
  await dom.flush();
  const gear = dom.document.querySelector(GEAR);
  gear.getBoundingClientRect = rectOf(400, 30);
  dom.window.innerHeight = 800;
  gear.click();
  await dom.flush();
  const menu = dom.document.querySelector(MENU);
  menu.getBoundingClientRect = rectOf(0, 100);
  tabOf(menu, "filtros").click();
  assert.strictEqual(menu.style.top, "400px");

  menu.getBoundingClientRect = rectOf(0, 600);
  tabOf(menu, "ajustes").click();

  assert.strictEqual(menu.style.top, "192px");
});

test("un ResizeObserver observa el menú abierto, lo recoloca y se desconecta al cerrar", async () => {
  const dom = loadDom({ html: GUIDE_HTML });
  await dom.flush();
  const observers = [];
  dom.window.ResizeObserver = class {
    constructor(callback) {
      this.callback = callback;
      this.observed = [];
      this.disconnected = false;
      observers.push(this);
    }
    observe(element) {
      this.observed.push(element);
    }
    disconnect() {
      this.disconnected = true;
    }
  };
  const gear = dom.document.querySelector(GEAR);
  gear.getBoundingClientRect = rectOf(400, 30);
  gear.click();
  await dom.flush();
  const menu = dom.document.querySelector(MENU);

  assert.strictEqual(observers.length, 1);
  assert.deepStrictEqual(observers[0].observed, [menu]);
  menu.getBoundingClientRect = rectOf(0, 600);
  observers[0].callback();
  assert.strictEqual(menu.style.top, "192px");

  gear.click();
  await dom.flush();
  assert.strictEqual(observers[0].disconnected, true);
});

test("sin ResizeObserver abrir el menú no lanza", async () => {
  const { window, menu } = await loadWithMenu();

  assert.strictEqual(typeof window.ResizeObserver, "undefined");
  assert.strictEqual(menu.hidden, false);
});

test("yt-navigate-start cierra el menú", async () => {
  const { document, window, menu } = await loadWithMenu();

  document.dispatchEvent(new window.Event("yt-navigate-start"));

  assert.strictEqual(menu.hidden, true);
});

const TOAST = "#youtube-groups-toast";

/** Almacén con dos listas: "Uno" con dos vídeos y "Dos" vacía. */
function playlistsStore() {
  const video = (id, title) => ({
    id,
    title,
    channelName: "Canal",
    addedAt: 1,
  });
  return {
    youtubePlaylists: {
      version: 1,
      playlists: [
        {
          id: "p1",
          name: "Uno",
          videos: [
            video("abc123DEF45", "Primero"),
            video("zyx987WVU65", "Segundo"),
          ],
        },
        { id: "p2", name: "Dos", videos: [] },
      ],
    },
  };
}

/** Carga el menú con `confirm` que lanza y la sección Listas pintada. */
function loadPlaylists(store = playlistsStore()) {
  return loadWithMenu({
    store,
    confirm: () => {
      throw new Error("confirm no debe llamarse");
    },
  });
}

const names = (store) =>
  store.youtubePlaylists.playlists.map((playlist) => playlist.name);

/** Botón "Eliminar" de la primera lista del menú. */
function firstDeleteButton(menu) {
  return Array.from(
    menu.querySelectorAll(".youtube-groups__playlist-item button"),
  ).find((button) => button.textContent === "Eliminar");
}

/** Abre el modal "Ver" de la primera lista. */
async function openFirstModal({ document, flush, menu }) {
  menu.querySelector(".youtube-groups__playlist-item button").click();
  await flush();
  return document.querySelector(
    ".youtube-groups__channel-list-modal--playlist",
  );
}

test('la "×" del modal de lista usa la clase común de botón de icono (ADR 0041)', async () => {
  const dom = await loadPlaylists();
  const modal = await openFirstModal(dom);
  const close = modal.querySelector(".youtube-groups__close-channels-button");

  assert.ok(close.classList.contains("youtube-groups__icon-button"));
  assert.ok(!close.classList.contains("youtube-groups__icon-button--small"));
});

test("los botones de Listas y del modal usan la clase común de texto (ADR 0046)", async () => {
  const dom = await loadPlaylists();
  const modal = await openFirstModal(dom);
  const shared = [
    "action-button",
    "mini-action-button",
    "primary-button",
    "secondary-button",
    "noaction-button",
  ];
  const controls = [
    ...dom.menu.querySelectorAll(
      ".youtube-groups__playlists button, .youtube-groups__playlists a",
    ),
    ...modal.querySelectorAll(
      ".youtube-groups__channel-list-content button, .youtube-groups__channel-list-content a",
    ),
  ].filter(
    (el) =>
      !el.classList.contains("youtube-groups__icon-button") &&
      !el.closest(".youtube-groups__playlist-video > a"),
  );
  const byText = new Map();

  assert.ok(controls.length > 0);
  for (const el of controls) {
    assert.ok(
      el.classList.contains("youtube-groups__text-button"),
      el.textContent,
    );
    for (const name of shared) {
      assert.ok(!el.classList.contains(name), `${el.textContent}: ${name}`);
    }
    byText.set(el.textContent, el);
  }
  for (const text of ["Ver", "Reproducir", "Renombrar", "Eliminar", "Quitar"]) {
    assert.ok(byText.has(text), text);
    assert.ok(
      byText.get(text).classList.contains("youtube-groups__text-button--small"),
      text,
    );
  }
  for (const text of ["Reproducir lo visible", "Crear", "Vaciar lista"]) {
    assert.ok(byText.has(text), text);
    assert.ok(
      !byText
        .get(text)
        .classList.contains("youtube-groups__text-button--small"),
      text,
    );
  }
});

test("todos los botones de las tres pestañas y del modal usan la clase común de texto (ADR 0046)", async () => {
  const dom = await loadPlaylists();
  const modal = await openFirstModal(dom);
  const shared = [
    "action-button",
    "mini-action-button",
    "primary-button",
    "secondary-button",
    "noaction-button",
  ];
  const controls = [
    ...dom.menu.querySelectorAll(
      '[role="tabpanel"] button, [role="tabpanel"] a',
    ),
    ...modal.querySelectorAll("button, a"),
  ].filter(
    (el) =>
      !el.classList.contains("youtube-groups__icon-button") &&
      !el.matches(".youtube-groups__playlist-video > a"),
  );
  const byText = new Map();

  for (const el of controls) {
    assert.ok(
      el.classList.contains("youtube-groups__text-button"),
      el.textContent,
    );
    for (const name of shared) {
      assert.ok(!el.classList.contains(name), `${el.textContent}: ${name}`);
    }
    byText.set(el.textContent, el);
  }
  for (const text of [
    "Quitar filtros",
    "Restablecer",
    "Actualizar ahora",
    "Usar esta cuenta",
    "Cambiar atajos",
  ]) {
    assert.ok(byText.has(text), text);
  }
  assert.ok(
    byText
      .get("Restablecer")
      .classList.contains("youtube-groups__text-button--small"),
  );
});

test("Eliminar lista no pide confirmación y Deshacer la devuelve en su sitio", async () => {
  const { document, flush, store, menu } = await loadPlaylists();
  const items = () => menu.querySelectorAll(".youtube-groups__playlist-item");

  firstDeleteButton(menu).click();
  await flush();

  assert.deepStrictEqual(names(store), ["Dos"]);
  assert.strictEqual(items().length, 1);
  const toast = document.querySelector(TOAST);
  assert.strictEqual(toast.hidden, false);
  assert.match(toast.textContent, /Lista «Uno» eliminada/);

  toast.querySelector("button").click();
  await flush();

  assert.deepStrictEqual(names(store), ["Uno", "Dos"]);
  assert.strictEqual(items().length, 2);
  assert.match(toast.textContent, /Deshecho/);
});

test("Quitar un vídeo avisa y Deshacer lo devuelve con el modal abierto", async () => {
  const dom = await loadPlaylists();
  const { document, flush, store } = dom;
  const modal = await openFirstModal(dom);

  modal.querySelector(".youtube-groups__playlist-remove-button").click();
  await flush();

  assert.deepStrictEqual(
    store.youtubePlaylists.playlists[0].videos.map((item) => item.id),
    ["zyx987WVU65"],
  );
  const toast = document.querySelector(TOAST);
  assert.match(toast.textContent, /«Primero» quitado de «Uno»/);

  toast.querySelector("button").click();
  await flush();

  assert.deepStrictEqual(
    store.youtubePlaylists.playlists[0].videos.map((item) => item.id),
    ["abc123DEF45", "zyx987WVU65"],
  );
  const reopened = document.querySelector(
    ".youtube-groups__channel-list-modal--playlist",
  );
  assert.strictEqual(reopened.querySelectorAll("li").length, 2);
});

test("Vaciar lista deja 0 vídeos y Deshacer los devuelve en orden", async () => {
  const dom = await loadPlaylists();
  const { document, flush, store } = dom;
  const modal = await openFirstModal(dom);

  modal.querySelector(".youtube-groups__playlist-clear-button").click();
  await flush();

  assert.strictEqual(store.youtubePlaylists.playlists[0].videos.length, 0);
  const current = document.querySelector(
    ".youtube-groups__channel-list-modal--playlist",
  );
  assert.strictEqual(
    current.querySelector(".youtube-groups__playlist-clear-button").disabled,
    true,
  );
  const toast = document.querySelector(TOAST);
  assert.match(toast.textContent, /Lista «Uno» vaciada \(2 vídeos\)/);

  toast.querySelector("button").click();
  await flush();

  assert.deepStrictEqual(
    store.youtubePlaylists.playlists[0].videos.map((item) => item.id),
    ["abc123DEF45", "zyx987WVU65"],
  );
});

test("Vaciar lista cuenta los vídeos realmente vaciados, no los del modal", async () => {
  const dom = await loadPlaylists();
  const { document, flush, store } = dom;
  const modal = await openFirstModal(dom);

  // Otra pestaña guarda un tercer vídeo mientras el modal sigue abierto.
  store.youtubePlaylists.playlists[0].videos.push({
    id: "qwe456RTY78",
    title: "Tercero",
    channelName: "Canal",
    addedAt: 2,
  });
  modal.querySelector(".youtube-groups__playlist-clear-button").click();
  await flush();

  assert.match(
    document.querySelector(TOAST).textContent,
    /Lista «Uno» vaciada \(3 vídeos\)/,
  );
});

test("Deshacer no pisa un cambio posterior de las listas", async () => {
  const { document, flush, store, menu } = await loadPlaylists();
  firstDeleteButton(menu).click();
  await flush();

  store.youtubePlaylists = { version: 1, playlists: [] };
  document.querySelector(`${TOAST} button`).click();
  await flush();

  assert.match(
    document.querySelector(TOAST).textContent,
    /No se puede deshacer: las listas han cambiado desde entonces/,
  );
  assert.deepStrictEqual(store.youtubePlaylists.playlists, []);
});

test("el nombre de lista con HTML aparece literal en el aviso", async () => {
  const store = playlistsStore();
  store.youtubePlaylists.playlists[0].name = "<b>Negrita</b>";
  const { document, flush, menu } = await loadPlaylists(store);
  firstDeleteButton(menu).click();
  await flush();

  const toast = document.querySelector(TOAST);
  assert.match(toast.textContent, /<b>Negrita<\/b>/);
  assert.strictEqual(toast.querySelector("b"), null);
});

test("un pointerdown sobre el aviso no cierra el menú", async () => {
  const { document, window, flush, menu } = await loadPlaylists();
  firstDeleteButton(menu).click();
  await flush();

  document
    .querySelector(`${TOAST} button`)
    .dispatchEvent(new window.Event("pointerdown", { bubbles: true }));

  assert.strictEqual(menu.hidden, false);
});

test("la limpieza ya no está en el menú (vive en la página de opciones)", async () => {
  const { menu } = await loadWithMenu();

  assert.strictEqual(menu.querySelector(".youtube-groups__cleanup"), null);
  assert.strictEqual(
    menu.querySelector(".youtube-groups__cleanup-analyze"),
    null,
  );
});
