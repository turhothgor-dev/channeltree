// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { loadDom, manifestScripts } = require("./helpers/load-dom");
const { GUIDE_HTML } = require("./helpers/youtube-fixtures");

const MENU = "#youtube-groups-menu";
const GEAR = ".youtube-groups__guide-menu-button";
const SECTION = `${MENU} .youtube-groups__shortcuts-section`;
const GET = "youtube-groups:get-shortcuts";
const OPEN = "youtube-groups:open-shortcut-settings";

/**
 * Carga la guía y la estabiliza, sin abrir el menú.
 * @param {Object} [options] - Opciones de loadDom.
 * @returns {Promise<Object>} DOM cargado.
 */
async function loadGuide(options = {}) {
  const dom = loadDom({ html: GUIDE_HTML, ...options });
  await dom.flush();
  return dom;
}

/**
 * Pulsa el engranaje y espera a que se estabilice.
 * @param {Object} dom - DOM cargado.
 * @returns {Promise<void>}
 */
async function clickGear(dom) {
  dom.document.querySelector(GEAR).click();
  await dom.flush();
}

/**
 * Carga la guía y abre el menú.
 * @param {Object} [options] - Opciones de loadDom.
 * @returns {Promise<Object>} DOM cargado con el menú abierto.
 */
async function loadOpen(options = {}) {
  const dom = await loadGuide(options);
  await clickGear(dom);
  return dom;
}

/**
 * Devuelve los pares descripción / atajo de la lista de atajos.
 * @param {Object} dom - DOM cargado.
 * @returns {string[][]} Un par por comando.
 */
function rows(dom) {
  return [...dom.document.querySelectorAll(`${SECTION} li`)].map((li) => [
    li.querySelector("span").textContent,
    li.querySelector("kbd").textContent,
  ]);
}

/**
 * Devuelve el botón "Cambiar atajos".
 * @param {Object} dom - DOM cargado.
 * @returns {HTMLButtonElement} Botón.
 */
function changeButton(dom) {
  return dom.document.querySelector(`${SECTION} button`);
}

/**
 * Devuelve el elemento de error de la sección.
 * @param {Object} dom - DOM cargado.
 * @returns {HTMLElement} Error.
 */
function errorEl(dom) {
  return dom.document.querySelector(`${SECTION} [role='alert']`);
}

test("Ajustes lista los comandos del manifiesto con su atajo", async () => {
  const dom = await loadOpen();

  assert.strictEqual(
    dom.document.querySelector(`${SECTION} h3`).textContent,
    "Atajos de teclado",
  );
  assert.ok(
    dom.document.querySelector(
      `${MENU} .youtube-groups__settings ${SECTION.replace(MENU + " ", "")}`,
    ),
  );
  assert.deepStrictEqual(rows(dom), [
    ["Abrir el editor de grupos", "Alt+Shift+G"],
    ["Limpiar la selección de grupos de la pestaña", "Alt+Shift+X"],
  ]);
});

test("un comando sin atajo muestra Sin asignar", async () => {
  const dom = await loadOpen({
    runtimeResponder: () => ({
      commands: [
        { name: "open-editor", description: "Abrir", shortcut: "" },
        { name: "clear-selection", description: "Limpiar", shortcut: "Ctrl+Y" },
      ],
      canOpenSettings: true,
    }),
  });

  assert.deepStrictEqual(rows(dom), [
    ["Abrir", "Sin asignar"],
    ["Limpiar", "Ctrl+Y"],
  ]);
});

test("una descripción con HTML aparece literal", async () => {
  const dom = await loadOpen({
    runtimeResponder: () => ({
      commands: [{ name: "x", description: "<b>negrita</b>", shortcut: "F1" }],
      canOpenSettings: true,
    }),
  });

  assert.deepStrictEqual(rows(dom), [["<b>negrita</b>", "F1"]]);
  assert.strictEqual(dom.document.querySelector(`${SECTION} li b`), null);
});

test("Cambiar atajos envía un único open-shortcut-settings", async () => {
  const dom = await loadOpen();
  const button = changeButton(dom);

  assert.strictEqual(button.textContent, "Cambiar atajos");
  assert.strictEqual(button.hidden, false);
  button.click();
  await dom.flush();

  assert.deepStrictEqual(
    dom.messages.filter((message) => message.type === OPEN),
    [{ type: OPEN }],
  );
  assert.strictEqual(errorEl(dom).hidden, true);
  assert.strictEqual(button.disabled, false);
});

test("sin canOpenSettings no hay botón visible y se explica about:addons", async () => {
  const dom = await loadOpen({
    runtimeResponder: () => ({ commands: [], canOpenSettings: false }),
  });

  assert.strictEqual(changeButton(dom).hidden, true);
  assert.ok(
    dom.document.querySelector(SECTION).textContent.includes("about:addons"),
  );
});

test("cargar la página sin abrir el menú no envía mensajes", async () => {
  const dom = await loadGuide();

  assert.deepStrictEqual(dom.messages, []);
});

test("abrir el menú envía un único get-shortcuts", async () => {
  const dom = await loadOpen();

  assert.deepStrictEqual(dom.messages, [{ type: GET }]);
});

test("reabrir el menú vuelve a pedir y pinta lo nuevo", async () => {
  let shortcut = "Alt+Shift+G";
  const dom = await loadOpen({
    runtimeResponder: () => ({
      commands: [{ name: "a", description: "Abrir", shortcut }],
      canOpenSettings: true,
    }),
  });
  assert.deepStrictEqual(rows(dom), [["Abrir", "Alt+Shift+G"]]);

  await clickGear(dom);
  shortcut = "Ctrl+Alt+H";
  await clickGear(dom);

  assert.strictEqual(dom.messages.filter((m) => m.type === GET).length, 2);
  assert.deepStrictEqual(rows(dom), [["Abrir", "Ctrl+Alt+H"]]);
});

test("si el fondo no responde se ve el error y los ajustes siguen habilitados", async () => {
  const dom = await loadOpen({ runtimeResponder: () => undefined });

  assert.strictEqual(errorEl(dom).hidden, false);
  assert.match(errorEl(dom).textContent, /^No se pudieron leer los atajos: .+/);
  assert.strictEqual(rows(dom).length, 0);
  assert.strictEqual(changeButton(dom).hidden, true);
  for (const select of dom.document.querySelectorAll(
    `${MENU} [data-setting]`,
  )) {
    assert.strictEqual(select.disabled, false);
  }
});

test("si el envío rechaza se ve el error con la causa", async () => {
  const dom = await loadOpen({
    runtimeResponder: () => Promise.reject(new Error("fallo de prueba")),
  });

  assert.strictEqual(
    errorEl(dom).textContent,
    "No se pudieron leer los atajos: fallo de prueba",
  );
  assert.strictEqual(rows(dom).length, 0);
});

test("con opened false se ve el error y el botón se rehabilita", async () => {
  const dom = await loadOpen({
    runtimeResponder: (message) =>
      message.type === OPEN
        ? { opened: false }
        : { commands: [], canOpenSettings: true },
  });
  const button = changeButton(dom);

  button.click();
  await dom.flush();

  assert.strictEqual(errorEl(dom).hidden, false);
  assert.strictEqual(
    errorEl(dom).textContent,
    "No se pudo abrir la configuración de atajos. Usa la ruta de about:addons.",
  );
  assert.strictEqual(button.disabled, false);
});

test("una respuesta antigua tardía no pisa la más reciente", async () => {
  const resolvers = [];
  const dom = await loadGuide({
    runtimeResponder: () =>
      new Promise((resolve) => {
        resolvers.push(resolve);
      }),
  });
  await clickGear(dom);
  await clickGear(dom);
  await clickGear(dom);
  assert.strictEqual(resolvers.length, 2);

  const answer = (description) => ({
    commands: [{ name: "a", description, shortcut: "F1" }],
    canOpenSettings: true,
  });
  resolvers[1](answer("Nueva"));
  await dom.flush();
  resolvers[0](answer("Vieja"));
  await dom.flush();

  assert.deepStrictEqual(rows(dom), [["Nueva", "F1"]]);
});

test("create no toca el DOM fuera del contenedor y no hay browser.commands", () => {
  const scripts = manifestScripts().filter((file) => file !== "content.js");
  const dom = loadDom({ scripts });
  const before = dom.document.body.innerHTML;
  const container = dom.document.createElement("div");

  const section = dom.global("YouTubeGroupsShortcutsSection").create(container);

  assert.strictEqual(typeof section.load, "function");
  assert.strictEqual(dom.document.body.innerHTML, before);
  assert.ok(container.children.length > 0);
  assert.strictEqual(dom.browser.commands, undefined);
  assert.deepStrictEqual(dom.messages, []);
});
