// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { loadOptionsDom } = require("./helpers/load-dom");
const { makeGroup, groupsStore } = require("./helpers/youtube-fixtures");

test("el editor pinta el árbol de grupos y el resumen", async () => {
  const store = groupsStore([
    makeGroup("a", { name: "A", subgroups: [makeGroup("a1", { name: "A1" })] }),
    makeGroup("b", { name: "B" }),
  ]);
  const dom = loadOptionsDom({ store });
  await dom.flush();

  const rows = [...dom.document.querySelectorAll('[role="treeitem"]')];
  assert.strictEqual(rows.length, 3);
  assert.deepStrictEqual(
    rows.map((row) => row.querySelector(".options__name").textContent),
    ["A", "A1", "B"],
  );
  assert.strictEqual(
    dom.document.getElementById("options-summary").textContent,
    "3 grupos",
  );
});

/**
 * Carga el editor con A (subgrupo A1) y B.
 * @returns {Promise<Object>} DOM cargado.
 */
async function loadEditor() {
  const store = groupsStore([
    makeGroup("a", { name: "A", subgroups: [makeGroup("a1", { name: "A1" })] }),
    makeGroup("b", { name: "B" }),
  ]);
  const dom = loadOptionsDom({ store });
  await dom.flush();
  return dom;
}

/**
 * Devuelve la fila del árbol con ese nombre.
 * @param {Object} dom - DOM cargado.
 * @param {string} name - Nombre del grupo.
 * @returns {Element} Fila.
 */
function rowOf(dom, name) {
  return [...dom.document.querySelectorAll('[role="treeitem"]')].find(
    (row) => row.querySelector(".options__name").textContent === name,
  );
}

test("las acciones de fila son solo icono y siguen el orden previsto", async () => {
  const dom = await loadEditor();
  const buttons = [
    ...rowOf(dom, "A").querySelectorAll(".options__actions button"),
  ];
  assert.deepStrictEqual(
    buttons.map((b) => b.getAttribute("aria-label")),
    [
      "Renombrar",
      "Icono y color",
      "Eliminar",
      "Mover a…",
      "Fusionar con…",
      "Añadir subgrupo",
    ],
  );
  for (const button of buttons) {
    assert.strictEqual(button.title, button.getAttribute("aria-label"));
    assert.ok(button.querySelector("svg"));
    assert.strictEqual(button.textContent, "");
  }
  for (const label of ["Subir", "Bajar"]) {
    assert.strictEqual(
      dom.document.querySelector(`[aria-label="${label}"]`),
      null,
    );
  }
});

test("las acciones de fila y el plegado usan la clase común de botón de icono pequeña", async () => {
  const dom = await loadEditor();
  const row = rowOf(dom, "A");
  const buttons = [
    ...row.querySelectorAll(".options__actions button"),
    row.querySelector(".options__toggle"),
  ];
  for (const button of buttons) {
    assert.ok(button.classList.contains("youtube-groups__icon-button"));
    assert.ok(button.classList.contains("youtube-groups__icon-button--small"));
    assert.ok(!button.classList.contains("options__action"));
  }
  for (const label of ["+ Grupo", "Ordenar A-Z"]) {
    const text = [...dom.document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === label,
    );
    if (text) {
      assert.ok(!text.classList.contains("youtube-groups__icon-button"), label);
    }
  }
});

test("Alt+↓ sobre la fila mueve A tras B", async () => {
  const dom = await loadEditor();
  rowOf(dom, "A").dispatchEvent(
    new dom.window.KeyboardEvent("keydown", {
      key: "ArrowDown",
      altKey: true,
      bubbles: true,
    }),
  );
  // La escritura notifica a onChanged en un turno posterior.
  await dom.flush();
  await dom.flush();
  const names = [...dom.document.querySelectorAll(".options__name")].map(
    (n) => n.textContent,
  );
  assert.deepStrictEqual(names, ["B", "A", "A1"]);
});

test("Renombrar abre el campo con el nombre", async () => {
  const dom = await loadEditor();
  rowOf(dom, "A").querySelector('[aria-label="Renombrar"]').click();
  await dom.flush();
  const input = dom.document.querySelector(".options__editor input");
  assert.strictEqual(input.value, "A");
});

test("Añadir subgrupo abre un campo de creación dentro de A", async () => {
  const dom = await loadEditor();
  rowOf(dom, "A").querySelector('[aria-label="Añadir subgrupo"]').click();
  await dom.flush();
  const input = dom.document.querySelector(".options__editor input");
  assert.ok(input);
  assert.strictEqual(input.value, "");
  assert.ok(rowOf(dom, "A").parentElement.contains(input));
});

test("Eliminar quita A y muestra el aviso con Deshacer", async () => {
  const dom = await loadEditor();
  rowOf(dom, "A").querySelector('[aria-label="Eliminar"]').click();
  await dom.flush();
  await dom.flush();
  assert.strictEqual(rowOf(dom, "A"), undefined);
  const notice = dom.document.querySelector(".options__notice");
  assert.ok(notice.textContent.includes("Deshacer"));
});

test("con búsqueda no hay Mover a…", async () => {
  const dom = await loadEditor();
  const search = dom.document.getElementById("options-search-groups");
  search.value = "a1";
  search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await dom.flush();
  const labels = [
    ...rowOf(dom, "A1").querySelectorAll(".options__actions button"),
  ].map((b) => b.getAttribute("aria-label"));
  assert.deepStrictEqual(labels, [
    "Renombrar",
    "Icono y color",
    "Eliminar",
    "Añadir subgrupo",
  ]);
});

test("F2 sobre la fila abre renombrar", async () => {
  const dom = await loadEditor();
  rowOf(dom, "A").dispatchEvent(
    new dom.window.KeyboardEvent("keydown", { key: "F2", bubbles: true }),
  );
  await dom.flush();
  assert.ok(dom.document.querySelector(".options__editor input"));
});

test("sin grupo seleccionado el panel de canales invita a elegir grupo o subgrupo, y el selector de copiar conserva su texto", async () => {
  const store = groupsStore([
    makeGroup("a", {
      name: "A",
      channels: [{ name: "Canal", url: "https://www.youtube.com/@canal" }],
    }),
    makeGroup("b", { name: "B" }),
  ]);
  const dom = loadOptionsDom({ store });
  await dom.flush();
  const panel = dom.document.getElementById("options-channels");
  assert.strictEqual(
    panel.textContent,
    "Elige un grupo o subgrupo para ver sus canales",
  );

  rowOf(dom, "A").querySelector(".options__name").click();
  await dom.flush();
  panel.querySelector("input[data-url]").click();
  await dom.flush();
  [...panel.querySelectorAll("button")]
    .find((b) => b.textContent === "Copiar a…")
    .click();
  await dom.flush();
  const select = panel.querySelector(".options__transfer-select");
  assert.strictEqual(select.options[0].textContent, "Elige un grupo");
});

test("cambiar de grupo vacía la selección de canales del panel", async () => {
  const store = groupsStore([
    makeGroup("a", {
      name: "A",
      channels: [{ name: "Uno", url: "https://www.youtube.com/@uno" }],
    }),
    makeGroup("b", {
      name: "B",
      channels: [{ name: "Dos", url: "https://www.youtube.com/@dos" }],
    }),
  ]);
  const dom = loadOptionsDom({ store });
  await dom.flush();
  const panel = dom.document.getElementById("options-channels");

  rowOf(dom, "A").querySelector(".options__name").click();
  await dom.flush();
  panel.querySelector("input[data-url]").click();
  await dom.flush();
  assert.strictEqual(
    panel.querySelectorAll("input[data-url]:checked").length,
    1,
  );

  rowOf(dom, "B").querySelector(".options__name").click();
  await dom.flush();
  assert.strictEqual(panel.querySelectorAll("input[data-url]").length, 1);
  assert.strictEqual(
    panel.querySelectorAll("input[data-url]:checked").length,
    0,
  );
});

const YT = "https://www.youtube.com";

/**
 * Crea el valor de `youtubeSubscriptions` a partir de [handle, nombre, firstSeen].
 * @param {Array<Array>} entries - Suscripciones.
 * @returns {Object} Valor guardado.
 */
function subscriptionsValue(entries) {
  const channels = {};
  for (const [handle, name, firstSeen] of entries) {
    channels[`${YT}/@${handle}`] = {
      name,
      url: `${YT}/@${handle}`,
      firstSeen,
    };
  }
  return { version: 1, channels };
}

/**
 * Carga el editor con A (subgrupo A1 con "uno") y tres suscripciones.
 * @param {Object} [extra] - Claves extra del almacenamiento.
 * @returns {Promise<Object>} DOM cargado.
 */
async function loadWithSubscriptions(extra = {}) {
  const store = groupsStore([
    makeGroup("a", {
      name: "A",
      subgroups: [
        makeGroup("a1", {
          name: "A1",
          channels: [{ name: "Uno", url: `${YT}/@uno` }],
        }),
      ],
    }),
  ]);
  store.youtubeSubscriptions = subscriptionsValue([
    ["uno", "Uno", 100],
    ["dos", "Dos", 200],
    ["tres", "Tres", 300],
  ]);
  Object.assign(store, extra);
  const dom = loadOptionsDom({ store });
  await dom.flush();
  return dom;
}

test("la bandeja lista las suscripciones sin grupo, las más recientes primero", async () => {
  const dom = await loadWithSubscriptions();
  const section = dom.document.getElementById("options-unclassified");
  assert.strictEqual(
    section.querySelector("h2").textContent,
    "Canales sin grupo (2)",
  );
  const links = [...section.querySelectorAll("a")];
  assert.deepStrictEqual(
    links.map((a) => a.textContent),
    ["Tres", "Dos"],
  );
  assert.strictEqual(links[0].getAttribute("target"), "_blank");
  assert.strictEqual(
    section.querySelectorAll(".youtube-groups__avatar-initial").length,
    2,
  );
});

test("la bandeja explica los casos vacíos", async () => {
  const none = loadOptionsDom({ store: groupsStore([]) });
  await none.flush();
  assert.ok(
    none.document
      .getElementById("options-unclassified")
      .textContent.includes("Aún no se conoce ninguna suscripción."),
  );

  const store = groupsStore([
    makeGroup("a", {
      name: "A",
      channels: [{ name: "Uno", url: `${YT}/@uno` }],
    }),
  ]);
  store.youtubeSubscriptions = subscriptionsValue([["uno", "Uno", 1]]);
  const all = loadOptionsDom({ store });
  await all.flush();
  assert.ok(
    all.document
      .getElementById("options-unclassified")
      .textContent.includes(
        "Todas las suscripciones conocidas están en algún grupo.",
      ),
  );
});

test("el buscador filtra la bandeja y sin coincidencias lo dice", async () => {
  const dom = await loadWithSubscriptions();
  const section = dom.document.getElementById("options-unclassified");
  const search = dom.document.getElementById("options-search-channels");
  search.value = "dos";
  search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await dom.flush();
  assert.deepStrictEqual(
    [...section.querySelectorAll("a")].map((a) => a.textContent),
    ["Dos"],
  );
  search.value = "zzz";
  search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await dom.flush();
  assert.ok(
    section.textContent.includes(
      "Ningún canal sin grupo coincide con la búsqueda.",
    ),
  );
});

test("un cambio de youtubeSubscriptions añade la suscripción sin recargar", async () => {
  const dom = await loadWithSubscriptions();
  const value = subscriptionsValue([
    ["uno", "Uno", 100],
    ["dos", "Dos", 200],
    ["tres", "Tres", 300],
    ["cuatro", "Cuatro", 400],
  ]);
  await dom.browser.storage.local.set({ youtubeSubscriptions: value });
  await dom.flush();
  const section = dom.document.getElementById("options-unclassified");
  assert.strictEqual(
    section.querySelector("h2").textContent,
    "Canales sin grupo (3)",
  );
  assert.strictEqual(section.querySelector("a").textContent, "Cuatro");
});

/**
 * Cambia una casilla y dispara su evento.
 * @param {Object} dom - DOM cargado.
 * @param {Element} box - Casilla.
 * @param {boolean} checked - Nuevo estado.
 * @returns {void}
 */
function setChecked(dom, box, checked) {
  box.checked = checked;
  box.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
}

/**
 * Busca un botón por su texto dentro de un elemento.
 * @param {Element} root - Contenedor.
 * @param {string} text - Texto del botón.
 * @returns {Element|undefined} Botón.
 */
function buttonByText(root, text) {
  return [...root.querySelectorAll("button")].find(
    (b) => b.textContent === text,
  );
}

test("la bandeja selecciona y añade a un subgrupo", async () => {
  const dom = await loadWithSubscriptions();
  const section = dom.document.getElementById("options-unclassified");
  const addButton = () =>
    [...section.querySelectorAll("button")].find((b) =>
      b.textContent.startsWith("Añadir a…"),
    );
  assert.strictEqual(addButton().textContent, "Añadir a… (0)");
  assert.strictEqual(addButton().disabled, true);

  const boxes = [...section.querySelectorAll("input[data-url]")];
  setChecked(dom, boxes[0], true);
  setChecked(dom, boxes[1], true);
  assert.strictEqual(addButton().textContent, "Añadir a… (2)");

  const selectAll = section.querySelector(
    '[aria-label="Seleccionar la página"]',
  );
  assert.strictEqual(selectAll.checked, true);
  assert.strictEqual(selectAll.indeterminate, false);
  setChecked(dom, boxes[1], false);
  assert.strictEqual(selectAll.indeterminate, true);
  setChecked(dom, selectAll, true);
  assert.ok(boxes.every((box) => box.checked));
  assert.strictEqual(addButton().textContent, "Añadir a… (2)");

  const groupsSets = [];
  const original = dom.browser.storage.local.set;
  dom.browser.storage.local.set = (items) => {
    if ("youtubeGroups" in items) {
      groupsSets.push(items);
    }
    return original.call(dom.browser.storage.local, items);
  };

  addButton().click();
  const select = section.querySelector('[aria-label="Añadir a"]');
  assert.strictEqual(select.options[0].textContent, "Elige un grupo");
  const confirm = buttonByText(section, "Añadir");
  assert.strictEqual(confirm.disabled, true);
  select.value = "a1";
  select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  assert.strictEqual(confirm.disabled, false);
  confirm.click();
  await dom.flush();
  await dom.flush();
  await dom.flush();

  assert.strictEqual(groupsSets.length, 1);
  assert.ok(section.textContent.includes("2 añadidos a «A1»"));
  assert.ok(
    section.textContent.includes(
      "Todas las suscripciones conocidas están en algún grupo.",
    ),
  );
});

test("Escape en el selector de la bandeja lo cierra sin escribir", async () => {
  const dom = await loadWithSubscriptions();
  const section = dom.document.getElementById("options-unclassified");
  setChecked(dom, section.querySelector("input[data-url]"), true);
  const original = dom.browser.storage.local.set;
  let writes = 0;
  dom.browser.storage.local.set = (items) => {
    writes += 1;
    return original.call(dom.browser.storage.local, items);
  };
  [...section.querySelectorAll("button")]
    .find((b) => b.textContent.startsWith("Añadir a…"))
    .click();
  const select = section.querySelector('[aria-label="Añadir a"]');
  select.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  await dom.flush();
  assert.strictEqual(section.querySelector('[aria-label="Añadir a"]'), null);
  assert.strictEqual(writes, 0);
});

/**
 * Carga el editor con A (subgrupos "b2" y "B1"), C y B, en ese orden.
 * @param {Array<Object>} [channels] - Canales de A.
 * @returns {Promise<Object>} DOM cargado.
 */
async function loadSortEditor(channels = []) {
  const store = groupsStore([
    makeGroup("a", {
      name: "A",
      channels,
      subgroups: [
        makeGroup("s1", { name: "b2" }),
        makeGroup("s2", { name: "B1" }),
      ],
    }),
    makeGroup("c", { name: "C" }),
    makeGroup("b", { name: "B" }),
  ]);
  const dom = loadOptionsDom({ store });
  await dom.flush();
  return dom;
}

/**
 * Nombres de las filas del árbol, en orden.
 * @param {Object} dom - DOM cargado.
 * @returns {string[]} Nombres.
 */
function treeNames(dom) {
  return [...dom.document.querySelectorAll(".options__name")].map(
    (n) => n.textContent,
  );
}

/**
 * Espera a que termine una escritura y su repintado.
 * @param {Object} dom - DOM cargado.
 * @returns {Promise<void>}
 */
async function settle(dom) {
  for (let i = 0; i < 4; i += 1) {
    await dom.flush();
  }
}

test("Ordenar subgrupos A-Z ordena los hijos de A y se puede deshacer", async () => {
  const dom = await loadSortEditor();
  const sort = rowOf(dom, "A").querySelector(
    '[aria-label="Ordenar subgrupos A-Z"]',
  );
  assert.strictEqual(sort.disabled, false);
  sort.focus();
  sort.click();
  await settle(dom);
  assert.deepStrictEqual(treeNames(dom), ["A", "B1", "b2", "C", "B"]);
  // El foco no se pierde: pasa al "Deshacer" del aviso.
  assert.strictEqual(
    dom.document.activeElement,
    dom.document.querySelector(".options__notice button"),
  );
  const notice = dom.document.querySelector(".options__notice");
  assert.ok(notice.textContent.includes("Ordenados los subgrupos de «A»"));
  const undo = [...notice.querySelectorAll("button")].find(
    (b) => b.textContent === "Deshacer",
  );
  assert.ok(undo);
  assert.strictEqual(
    rowOf(dom, "A").querySelector('[aria-label="Ordenar subgrupos A-Z"]'),
    null,
  );
  undo.click();
  await settle(dom);
  assert.deepStrictEqual(treeNames(dom), ["A", "b2", "B1", "C", "B"]);
  assert.ok(
    dom.document
      .querySelector(".options__notice")
      .textContent.includes("Deshecho"),
  );
  // Sin subgrupos no hay botón.
  assert.strictEqual(
    rowOf(dom, "C").querySelector('[aria-label="Ordenar subgrupos A-Z"]'),
    null,
  );
});

test("Ordenar subgrupos A-Z no aparece con 0, 1 o 2 subgrupos ya ordenados", async () => {
  const store = groupsStore([
    makeGroup("a", { name: "A" }),
    makeGroup("b", {
      name: "B",
      subgroups: [makeGroup("b1", { name: "B1" })],
    }),
    makeGroup("c", {
      name: "C",
      subgroups: [
        makeGroup("c1", { name: "C1" }),
        makeGroup("c2", { name: "C2" }),
      ],
    }),
  ]);
  const dom = loadOptionsDom({ store });
  await dom.flush();
  for (const name of ["A", "B", "C"]) {
    assert.strictEqual(
      rowOf(dom, name).querySelector('[aria-label="Ordenar subgrupos A-Z"]'),
      null,
    );
  }
  assert.strictEqual(
    dom.document.getElementById("options-sort-root").hidden,
    true,
  );
});

test("Ordenar A-Z de la cabecera ordena la raíz y se oculta", async () => {
  const dom = await loadSortEditor();
  const button = dom.document.getElementById("options-sort-root");
  assert.strictEqual(button.hidden, false);
  button.focus();
  button.click();
  await settle(dom);
  assert.deepStrictEqual(treeNames(dom), ["A", "b2", "B1", "B", "C"]);
  assert.strictEqual(button.hidden, true);
  assert.strictEqual(
    dom.document.activeElement,
    dom.document.querySelector(".options__notice button"),
  );
  assert.ok(
    dom.document
      .querySelector(".options__notice")
      .textContent.includes("Ordenados los grupos de primer nivel"),
  );
});

test("con búsqueda el Ordenar A-Z de la cabecera está oculto", async () => {
  const dom = await loadSortEditor();
  const search = dom.document.getElementById("options-search-groups");
  search.value = "a";
  search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await dom.flush();
  assert.strictEqual(
    dom.document.getElementById("options-sort-root").hidden,
    true,
  );
  assert.strictEqual(
    rowOf(dom, "A").querySelector('[aria-label="Ordenar subgrupos A-Z"]'),
    null,
  );
});

test("Ordenar A-Z del panel ordena los canales y con búsqueda no aparece", async () => {
  const dom = await loadSortEditor([
    { name: "Zeta", url: `${YT}/@zeta` },
    { name: "alfa", url: `${YT}/@alfa` },
    { name: "Beta", url: `${YT}/@beta` },
  ]);
  rowOf(dom, "A").querySelector(".options__name").click();
  await dom.flush();
  const panel = dom.document.getElementById("options-channels");
  const sortButton = () =>
    [...panel.querySelectorAll("button")].find(
      (b) => b.textContent === "Ordenar A-Z",
    );
  assert.strictEqual(sortButton().disabled, false);
  sortButton().click();
  await settle(dom);
  assert.deepStrictEqual(
    [...panel.querySelectorAll(".options__channel-link")].map(
      (a) => a.textContent,
    ),
    ["alfa", "Beta", "Zeta"],
  );
  const notice = dom.document.querySelector(".options__notice");
  assert.ok(notice.textContent.includes("Ordenados los canales de «A»"));
  assert.ok(notice.textContent.includes("Deshacer"));
  assert.strictEqual(sortButton().disabled, true);

  const search = dom.document.getElementById("options-search-groups");
  search.value = "a";
  search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await dom.flush();
  assert.strictEqual(sortButton(), undefined);
});

/**
 * Carga el editor con A (canal X, subgrupo A1) y B (canales X e Y).
 * @returns {Promise<Object>} DOM cargado.
 */
async function loadMergeEditor() {
  const store = groupsStore([
    makeGroup("a", {
      name: "A",
      channels: [{ name: "X", url: `${YT}/@x` }],
      subgroups: [makeGroup("a1", { name: "A1" })],
    }),
    makeGroup("b", {
      name: "B",
      channels: [
        { name: "Y", url: `${YT}/@y` },
        { name: "X", url: `${YT}/@x` },
      ],
    }),
  ]);
  const dom = loadOptionsDom({ store });
  await dom.flush();
  return dom;
}

/**
 * Elige un destino en el selector de fusionar.
 * @param {Object} dom - DOM cargado.
 * @param {string} value - Id del destino.
 * @returns {void}
 */
function chooseMergeTarget(dom, value) {
  const select = dom.document.querySelector(".options__merge-select");
  select.value = value;
  select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
}

test("Fusionar con… abre el selector sin A ni A1 y Fusionar espera destino", async () => {
  const dom = await loadMergeEditor();
  rowOf(dom, "A").querySelector('[aria-label="Fusionar con…"]').click();
  await dom.flush();
  const select = dom.document.querySelector(".options__merge-select");
  assert.strictEqual(select.getAttribute("aria-label"), "Fusionar con");
  assert.deepStrictEqual(
    [...select.options].map((o) => o.textContent.trim()),
    ["Elige un grupo", "B"],
  );
  const confirm = buttonByText(dom.document, "Fusionar");
  assert.strictEqual(confirm.disabled, true);
  chooseMergeTarget(dom, "b");
  assert.strictEqual(confirm.disabled, false);
});

test("Fusionar junta A en B, avisa y se puede deshacer", async () => {
  const dom = await loadMergeEditor();
  rowOf(dom, "A").querySelector(".options__name").click();
  await dom.flush();
  rowOf(dom, "A").querySelector('[aria-label="Fusionar con…"]').click();
  await dom.flush();
  chooseMergeTarget(dom, "b");
  buttonByText(dom.document, "Fusionar").click();
  await settle(dom);
  assert.deepStrictEqual(treeNames(dom), ["B", "A1"]);
  const notice = dom.document.querySelector(".options__notice");
  assert.ok(notice.textContent.includes("Fusionado «A» en «B»"));
  assert.ok(notice.textContent.includes("1 ya estaba"));
  assert.ok(notice.textContent.includes("1 subgrupo movido"));
  const panel = dom.document.getElementById("options-channels");
  assert.ok(panel.textContent.includes("Canales de «B»"));
  assert.deepStrictEqual(
    [...panel.querySelectorAll(".options__channel-link")].map(
      (a) => a.textContent,
    ),
    ["Y", "X"],
  );
  buttonByText(notice, "Deshacer").click();
  await settle(dom);
  assert.deepStrictEqual(treeNames(dom), ["A", "A1", "B"]);
  assert.ok(
    dom.document
      .querySelector(".options__notice")
      .textContent.includes("Deshecho"),
  );
});

test("doble clic en Fusionar escribe una sola vez", async () => {
  const dom = await loadMergeEditor();
  const original = dom.browser.storage.local.set;
  let writes = 0;
  dom.browser.storage.local.set = (items) => {
    writes += 1;
    return original.call(dom.browser.storage.local, items);
  };
  rowOf(dom, "A").querySelector('[aria-label="Fusionar con…"]').click();
  await dom.flush();
  chooseMergeTarget(dom, "b");
  const confirm = buttonByText(dom.document, "Fusionar");
  confirm.click();
  confirm.click();
  await settle(dom);
  assert.strictEqual(writes, 1);
  assert.deepStrictEqual(treeNames(dom), ["B", "A1"]);
});

test("Escape cierra el selector de fusionar sin escribir y Mover a… lo cierra", async () => {
  const dom = await loadMergeEditor();
  const original = dom.browser.storage.local.set;
  let writes = 0;
  dom.browser.storage.local.set = (items) => {
    writes += 1;
    return original.call(dom.browser.storage.local, items);
  };
  rowOf(dom, "A").querySelector('[aria-label="Fusionar con…"]').click();
  await dom.flush();
  dom.document
    .querySelector(".options__merge-select")
    .dispatchEvent(
      new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  await dom.flush();
  assert.strictEqual(
    dom.document.querySelector(".options__merge-select"),
    null,
  );
  assert.strictEqual(dom.document.activeElement, rowOf(dom, "A"));
  assert.strictEqual(writes, 0);

  rowOf(dom, "A").querySelector('[aria-label="Fusionar con…"]').click();
  await dom.flush();
  rowOf(dom, "A").querySelector('[aria-label="Mover a…"]').click();
  await dom.flush();
  assert.strictEqual(
    dom.document.querySelector(".options__merge-select"),
    null,
  );
  assert.ok(dom.document.querySelector(".options__move-select"));
});

test("con búsqueda no hay Fusionar con… ni Ordenar subgrupos A-Z", async () => {
  const dom = await loadMergeEditor();
  const search = dom.document.getElementById("options-search-groups");
  search.value = "a";
  search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await dom.flush();
  const row = rowOf(dom, "A");
  assert.strictEqual(row.querySelector('[aria-label="Fusionar con…"]'), null);
  assert.strictEqual(
    row.querySelector('[aria-label="Ordenar subgrupos A-Z"]'),
    null,
  );
});

test("el nombre del grupo lleva el nombre completo en el title", async () => {
  const longName = "Ciencia y tecnología divulgativa";
  const store = groupsStore([makeGroup("c", { name: longName })]);
  const dom = loadOptionsDom({ store });
  await dom.flush();
  const name = dom.document.querySelector(".options__name");
  assert.strictEqual(name.getAttribute("title"), longName);
});

/**
 * Crea el valor de `youtubeHiddenChannels` a partir de [handle, nombre, hiddenAt].
 * @param {Array<Array>} entries - Canales ocultos.
 * @returns {Object} Valor guardado.
 */
function hiddenValue(entries) {
  const channels = {};
  for (const [handle, name, hiddenAt] of entries) {
    const url = `${YT}/@${handle}`;
    channels[url] = { name, url, hiddenAt };
  }
  return { version: 1, channels };
}

/**
 * Carga el editor con canales ocultos.
 * @param {Array<Array>} entries - Canales ocultos.
 * @returns {Promise<{dom: Object, store: Object}>} DOM y almacenamiento.
 */
async function loadWithHidden(entries) {
  const store = groupsStore([]);
  store.youtubeHiddenChannels = hiddenValue(entries);
  const dom = loadOptionsDom({ store });
  await dom.flush();
  return { dom, store: dom.store };
}

test("la sección de ocultos lista los canales, el más reciente primero", async () => {
  const { dom } = await loadWithHidden([
    ["a", "Alfa", 100],
    ["b", "Beta", 200],
  ]);
  const section = dom.document.getElementById("options-hidden");
  assert.strictEqual(
    section.querySelector("h2").textContent,
    "Canales ocultos (2)",
  );
  assert.deepStrictEqual(
    [...section.querySelectorAll("a")].map((a) => a.textContent),
    ["Beta", "Alfa"],
  );
});

test("Dejar de ocultar usa la clase común de botón de icono pequeña", async () => {
  const { dom } = await loadWithHidden([["a", "Alfa", 100]]);
  const button = dom.document.querySelector(
    '[aria-label="Dejar de ocultar «Alfa»"]',
  );
  assert.ok(button.classList.contains("youtube-groups__icon-button"));
  assert.ok(button.classList.contains("youtube-groups__icon-button--small"));
  assert.ok(!button.classList.contains("options__action"));
});

test("dejar de ocultar quita el canal, avisa y Deshacer lo devuelve", async () => {
  const { dom, store } = await loadWithHidden([
    ["a", "Alfa", 100],
    ["b", "Beta", 200],
  ]);
  const section = dom.document.getElementById("options-hidden");
  section.querySelector('[aria-label="Dejar de ocultar «Alfa»"]').click();
  await dom.flush();
  assert.strictEqual(
    section.querySelector("h2").textContent,
    "Canales ocultos (1)",
  );
  assert.deepStrictEqual(Object.keys(store.youtubeHiddenChannels.channels), [
    `${YT}/@b`,
  ]);
  const notice = dom.document.querySelector(".options__notice");
  assert.ok(notice.textContent.includes("Canal «Alfa» visible de nuevo"));
  buttonByText(notice, "Deshacer").click();
  await dom.flush();
  await dom.flush();
  assert.strictEqual(
    section.querySelector("h2").textContent,
    "Canales ocultos (2)",
  );
  assert.strictEqual(
    store.youtubeHiddenChannels.channels[`${YT}/@a`].hiddenAt,
    100,
  );
});

test("el buscador filtra los ocultos sin acentos ni mayúsculas", async () => {
  const { dom } = await loadWithHidden([
    ["a", "Canción", 100],
    ["b", "Beta", 200],
  ]);
  const section = dom.document.getElementById("options-hidden");
  const search = dom.document.getElementById("options-search-channels");
  search.value = "CANCION";
  search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await dom.flush();
  assert.deepStrictEqual(
    [...section.querySelectorAll("a")].map((a) => a.textContent),
    ["Canción"],
  );
  search.value = "zzz";
  search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await dom.flush();
  assert.ok(
    section.textContent.includes(
      "Ningún canal oculto coincide con la búsqueda.",
    ),
  );
});

test("un cambio externo de youtubeHiddenChannels repinta la sección", async () => {
  const { dom } = await loadWithHidden([["a", "Alfa", 100]]);
  await dom.browser.storage.local.set({
    youtubeHiddenChannels: hiddenValue([
      ["a", "Alfa", 100],
      ["c", "Gamma", 300],
    ]),
  });
  await dom.flush();
  const section = dom.document.getElementById("options-hidden");
  assert.strictEqual(
    section.querySelector("h2").textContent,
    "Canales ocultos (2)",
  );
});

test("sin canales ocultos la sección lo dice", async () => {
  const dom = loadOptionsDom({ store: groupsStore([]) });
  await dom.flush();
  const section = dom.document.getElementById("options-hidden");
  assert.strictEqual(
    section.querySelector("h2").textContent,
    "Canales ocultos (0)",
  );
  assert.ok(section.textContent.includes("No hay canales ocultos."));
});

test("un deshacer correcto borra el error de un intento anterior", async () => {
  const { dom } = await loadWithHidden([
    ["a", "Alfa", 100],
    ["b", "Beta", 200],
  ]);
  const section = dom.document.getElementById("options-hidden");
  section.querySelector('[aria-label="Dejar de ocultar «Alfa»"]').click();
  await dom.flush();
  const notice = dom.document.querySelector(".options__notice");

  const originalSet = dom.browser.storage.local.set;
  dom.browser.storage.local.set = async () => {
    throw new Error("fallo");
  };
  section.querySelector('[aria-label="Dejar de ocultar «Beta»"]').click();
  await dom.flush();
  assert.ok(section.querySelector('[role="alert"]'));

  dom.browser.storage.local.set = originalSet;
  buttonByText(notice, "Deshacer").click();
  await dom.flush();
  await dom.flush();
  assert.strictEqual(section.querySelector('[role="alert"]'), null);
  assert.strictEqual(
    section.querySelector("h2").textContent,
    "Canales ocultos (2)",
  );
});

test("el nombre de un canal oculto con <b> se muestra literal", async () => {
  const { dom } = await loadWithHidden([["a", "<b>Alfa</b>", 100]]);
  const section = dom.document.getElementById("options-hidden");
  assert.strictEqual(section.querySelectorAll("b").length, 0);
  assert.strictEqual(section.querySelector("a").textContent, "<b>Alfa</b>");
});

const DAY = 24 * 60 * 60 * 1000;

/**
 * Carga el editor con el canal "Uno" en el grupo A, suscrito y observado.
 * @param {Object} [options] - Opciones.
 * @param {string} [options.name] - Nombre del canal.
 * @param {number} [options.lastFeedAt] - Última visita al feed.
 * @param {boolean} [options.withActivity] - Si hay `youtubeChannelActivity`.
 * @returns {Promise<Object>} DOM cargado.
 */
async function loadWithActivity({
  name = "Uno",
  lastFeedAt = Date.now() - DAY,
  withActivity = true,
  unoPublished = null,
  withAnchor = true,
} = {}) {
  const now = Date.now();
  // "Dos" (grupo B, con un vídeo visto ayer) evita el estado "no-data".
  const groupList = [
    makeGroup("a", {
      name: "A",
      channels: [{ name, url: `${YT}/@uno` }],
    }),
  ];
  const subs = [["uno", name, now - 400 * DAY]];
  const channels = {
    [`${YT}/@uno`]: {
      trackedSince: now - 7 * 30 * DAY,
      lastPublished: unoPublished,
    },
  };
  if (withAnchor) {
    groupList.push(
      makeGroup("b", {
        name: "B",
        channels: [{ name: "Dos", url: `${YT}/@dos` }],
      }),
    );
    subs.push(["dos", "Dos", now - 400 * DAY]);
    channels[`${YT}/@dos`] = {
      trackedSince: now - 7 * 30 * DAY,
      lastPublished: now - DAY,
    };
  }
  const store = groupsStore(groupList);
  store.youtubeSubscriptions = subscriptionsValue(subs);
  if (withActivity) {
    store.youtubeChannelActivity = { version: 1, lastFeedAt, channels };
  }
  const dom = loadOptionsDom({ store });
  await dom.flush();
  return dom;
}

test("la sección de inactivos lista el canal observado sin vídeos", async () => {
  const dom = await loadWithActivity();
  const section = dom.document.getElementById("options-inactive");
  assert.strictEqual(
    section.querySelector("h2").textContent,
    "Canales inactivos (1)",
  );
  assert.ok(
    section.textContent.includes(
      "Nunca se ha visto un vídeo suyo (observado 7 meses; revisa antes de quitar) · En: A",
    ),
  );
  assert.strictEqual(
    section.querySelector(".options__inactive-threshold").value,
    "6",
  );
});

test("cambiar el umbral a 12 meses quita el canal de la lista", async () => {
  const dom = await loadWithActivity();
  const section = dom.document.getElementById("options-inactive");
  const select = section.querySelector(".options__inactive-threshold");
  select.value = "12";
  select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  await dom.flush();
  assert.ok(
    section.textContent.includes("Ningún canal inactivo en el plazo elegido."),
  );
  assert.strictEqual(
    section.querySelector("h2").textContent,
    "Canales inactivos (0)",
  );
});

test("quitar de los grupos saca el canal del árbol y Deshacer lo devuelve", async () => {
  const dom = await loadWithActivity();
  const section = dom.document.getElementById("options-inactive");
  section.querySelector("input[data-key]").click();
  const remove = buttonByText(section, "Quitar de los grupos (1)");
  assert.ok(remove);
  remove.click();
  await dom.flush();
  await dom.flush();
  assert.deepStrictEqual(dom.store.youtubeGroups.groups[0].channels, []);
  assert.strictEqual(
    section.querySelector("h2").textContent,
    "Canales inactivos (0)",
  );
  const notice = dom.document.querySelector(".options__notice");
  assert.ok(notice.textContent.includes("1 canal quitado de sus grupos"));
  buttonByText(notice, "Deshacer").click();
  await dom.flush();
  await dom.flush();
  assert.strictEqual(dom.store.youtubeGroups.groups[0].channels.length, 1);
  assert.strictEqual(
    section.querySelector("h2").textContent,
    "Canales inactivos (1)",
  );
});

test("sin actividad guardada la sección explica que faltan datos", async () => {
  const dom = await loadWithActivity({ withActivity: false });
  const section = dom.document.getElementById("options-inactive");
  assert.ok(section.textContent.includes("Aún no hay datos: visita tus"));
});

test("con el feed visitado hace 40 días la sección lo indica", async () => {
  const dom = await loadWithActivity({ lastFeedAt: Date.now() - 40 * DAY });
  const section = dom.document.getElementById("options-inactive");
  assert.ok(
    section.textContent.includes(
      "Hace más de 30 días que no se visitan tus suscripciones",
    ),
  );
  assert.strictEqual(section.querySelector("a"), null);
});

test("el buscador filtra los inactivos y un cambio externo repinta", async () => {
  const dom = await loadWithActivity({ name: "Canción" });
  const section = dom.document.getElementById("options-inactive");
  const search = dom.document.getElementById("options-search-channels");
  search.value = "CANCION";
  search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await dom.flush();
  assert.deepStrictEqual(
    [...section.querySelectorAll("a")].map((a) => a.textContent),
    ["Canción"],
  );
  search.value = "zzz";
  search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await dom.flush();
  assert.ok(
    section.textContent.includes(
      "Ningún canal inactivo coincide con la búsqueda.",
    ),
  );
  search.value = "";
  search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await dom.flush();
  await dom.browser.storage.local.set({
    youtubeChannelActivity: {
      version: 1,
      lastFeedAt: Date.now() - DAY,
      channels: {
        [`${YT}/@uno`]: {
          trackedSince: Date.now() - 7 * 30 * DAY,
          lastPublished: Date.now() - 10 * DAY,
        },
      },
    },
  });
  await dom.flush();
  assert.strictEqual(
    section.querySelector("h2").textContent,
    "Canales inactivos (0)",
  );
});

test("el nombre de un canal inactivo con <b> se muestra literal", async () => {
  const dom = await loadWithActivity({ name: "<b>Uno</b>" });
  const section = dom.document.getElementById("options-inactive");
  assert.strictEqual(section.querySelectorAll("b").length, 0);
  assert.strictEqual(section.querySelector("a").textContent, "<b>Uno</b>");
});

test("sin ningún vídeo visto la sección explica que no hay datos", async () => {
  const dom = await loadWithActivity({ withAnchor: false });
  const section = dom.document.getElementById("options-inactive");
  assert.ok(
    section.textContent.includes(
      "No se ha podido leer la antigüedad de ningún vídeo",
    ),
  );
  assert.strictEqual(section.querySelector("a"), null);
  assert.strictEqual(
    section.querySelector("h2").textContent,
    "Canales inactivos (0)",
  );
});

test("con un canal observado desde ayer la sección dice '1 día'", async () => {
  const dom = await loadWithActivity();
  const section = dom.document.getElementById("options-inactive");
  const now = Date.now();
  await dom.browser.storage.local.set({
    youtubeChannelActivity: {
      version: 1,
      lastFeedAt: now - DAY,
      channels: {
        [`${YT}/@uno`]: { trackedSince: now - DAY, lastPublished: now - DAY },
      },
    },
  });
  await dom.flush();
  assert.ok(
    section.textContent.includes("Se observa la actividad desde hace 1 día."),
  );
});

test("al repintar por un cambio externo se conserva el foco en la casilla", async () => {
  const dom = await loadWithActivity();
  dom.document.getElementById("options-tab-canales").click();
  const section = dom.document.getElementById("options-inactive");
  const box = section.querySelector("input[data-key]");
  box.focus();
  const now = Date.now();
  await dom.browser.storage.local.set({
    youtubeChannelActivity: {
      version: 1,
      lastFeedAt: now - 2 * DAY,
      channels: {
        [`${YT}/@uno`]: {
          trackedSince: now - 7 * 30 * DAY,
          lastPublished: null,
        },
        [`${YT}/@dos`]: {
          trackedSince: now - 7 * 30 * DAY,
          lastPublished: now - DAY,
        },
      },
    },
  });
  await dom.flush();
  const again = section.querySelector("input[data-key]");
  assert.notStrictEqual(again, box);
  assert.strictEqual(dom.document.activeElement, again);
});

test("si cambian a la vez la actividad y las suscripciones se repinta una vez", async () => {
  const dom = await loadWithActivity();
  const section = dom.document.getElementById("options-inactive");
  let renders = 0;
  const listBody = section.querySelector(".options__list-body");
  const original = listBody.replaceChildren.bind(listBody);
  listBody.replaceChildren = (...args) => {
    renders += 1;
    return original(...args);
  };
  const now = Date.now();
  await dom.browser.storage.local.set({
    youtubeChannelActivity: {
      version: 1,
      lastFeedAt: now - 2 * DAY,
      channels: {
        [`${YT}/@uno`]: {
          trackedSince: now - 7 * 30 * DAY,
          lastPublished: null,
        },
        [`${YT}/@dos`]: {
          trackedSince: now - 7 * 30 * DAY,
          lastPublished: now - DAY,
        },
      },
    },
    youtubeSubscriptions: subscriptionsValue([
      ["uno", "Uno", now - 400 * DAY],
      ["dos", "Dos", now - 400 * DAY],
    ]),
  });
  await dom.flush();
  assert.strictEqual(renders, 1);
});

/**
 * Carga el editor con el grupo "Música" (sin canales) y lo selecciona.
 * @param {Object} [extra] - Campos extra del grupo.
 * @returns {Promise<Object>} DOM cargado.
 */
async function loadKeywordsEditor(extra = {}) {
  const store = groupsStore([
    { ...makeGroup("m", { name: "Música" }), ...extra },
  ]);
  const dom = loadOptionsDom({ store });
  await dom.flush();
  rowOf(dom, "Música").querySelector(".options__name").click();
  return dom;
}

/**
 * Escribe en el campo de palabras clave.
 * @param {Object} dom - DOM cargado.
 * @param {string} value - Texto.
 * @returns {Element} Campo.
 */
function typeKeywords(dom, value) {
  const input = dom.document.getElementById("options-keywords");
  input.value = value;
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  return input;
}

/**
 * Pulsa una tecla en el campo de palabras clave.
 * @param {Object} dom - DOM cargado.
 * @param {string} key - Tecla.
 * @returns {void}
 */
function pressKeywordsKey(dom, key) {
  dom.document
    .getElementById("options-keywords")
    .dispatchEvent(
      new dom.window.KeyboardEvent("keydown", { key, bubbles: true }),
    );
}

test("palabras clave: se ve el campo vacío y se guardan con el botón", async () => {
  const dom = await loadKeywordsEditor();
  const channels = dom.document.getElementById("options-channels");
  assert.strictEqual(dom.document.getElementById("options-keywords").value, "");
  assert.strictEqual(
    dom.document.querySelector('label[for="options-keywords"]').textContent,
    "Palabras clave",
  );
  assert.strictEqual(
    buttonByText(channels, "Guardar palabras clave").disabled,
    true,
  );
  typeKeywords(dom, "Música, jazz");
  buttonByText(channels, "Guardar palabras clave").click();
  await settle(dom);
  assert.deepStrictEqual(dom.store.youtubeGroups.groups[0].keywords, [
    "Música",
    "jazz",
  ]);
  assert.ok(
    dom.document
      .querySelector(".options__notice")
      .textContent.includes("Palabras clave guardadas"),
  );
  rowOf(dom, "Música").querySelector(".options__name").click();
  assert.strictEqual(
    dom.document.getElementById("options-keywords").value,
    "Música, jazz",
  );
});

test("palabras clave: Intro guarda, '--' da error y vaciar quita el campo", async () => {
  const dom = await loadKeywordsEditor({ keywords: ["jazz"] });
  assert.strictEqual(
    dom.document.getElementById("options-keywords").value,
    "jazz",
  );
  typeKeywords(dom, "--");
  pressKeywordsKey(dom, "Enter");
  await settle(dom);
  const error = dom.document.querySelector(
    ".options__keywords .options__field-error",
  );
  assert.strictEqual(error.textContent, "«--» no tiene letras ni números");
  assert.strictEqual(error.getAttribute("role"), "alert");
  assert.deepStrictEqual(dom.store.youtubeGroups.groups[0].keywords, ["jazz"]);

  typeKeywords(dom, "blues");
  pressKeywordsKey(dom, "Enter");
  await settle(dom);
  assert.deepStrictEqual(dom.store.youtubeGroups.groups[0].keywords, ["blues"]);

  typeKeywords(dom, "");
  pressKeywordsKey(dom, "Enter");
  await settle(dom);
  assert.ok(!("keywords" in dom.store.youtubeGroups.groups[0]));
});

test("palabras clave: un cambio externo conserva el texto y Escape lo restaura", async () => {
  const dom = await loadKeywordsEditor({ keywords: ["jazz"] });
  typeKeywords(dom, "jazz, soul");
  await dom.browser.storage.local.set({
    youtubeGroups: dom.store.youtubeGroups,
  });
  await settle(dom);
  const input = dom.document.getElementById("options-keywords");
  assert.strictEqual(input.value, "jazz, soul");
  pressKeywordsKey(dom, "Escape");
  assert.strictEqual(
    dom.document.getElementById("options-keywords").value,
    "jazz",
  );
});

test("palabras clave: un valor con HTML se muestra literal", async () => {
  const dom = await loadKeywordsEditor({ keywords: ["<b>x</b>"] });
  const channels = dom.document.getElementById("options-channels");
  assert.strictEqual(
    dom.document.getElementById("options-keywords").value,
    "<b>x</b>",
  );
  assert.strictEqual(channels.querySelector(".options__keywords b"), null);
});

/**
 * Carga el editor con los grupos y suscripciones dados.
 * @param {Array<Object>} groups - Grupos.
 * @param {Array<Array>} subs - Suscripciones [handle, nombre, firstSeen].
 * @returns {Promise<Object>} DOM cargado.
 */
async function loadSuggestions(groups, subs) {
  const store = groupsStore(groups);
  store.youtubeSubscriptions = subscriptionsValue(subs);
  const dom = loadOptionsDom({ store });
  await dom.flush();
  return dom;
}

/**
 * Cuenta las escrituras de `youtubeGroups`.
 * @param {Object} dom - DOM cargado.
 * @returns {{count: function(): number}} Contador.
 */
function countGroupWrites(dom) {
  let writes = 0;
  const original = dom.browser.storage.local.set;
  dom.browser.storage.local.set = (items) => {
    if ("youtubeGroups" in items) {
      writes += 1;
    }
    return original.call(dom.browser.storage.local, items);
  };
  return { count: () => writes };
}

test("sugerencias: la fila sugiere el grupo, se añade y Deshacer lo devuelve", async () => {
  const dom = await loadSuggestions(
    [{ ...makeGroup("m", { name: "Música" }), keywords: ["jazz"] }],
    [
      ["jazz", "Jazz Club", 2],
      ["cocina", "Cocina Fácil", 1],
    ],
  );
  const section = dom.document.getElementById("options-unclassified");
  const suggestions = [...section.querySelectorAll(".options__suggestion")];
  assert.deepStrictEqual(
    suggestions.map((s) => s.textContent),
    ["Sugerencia: «Música» (por «jazz»)"],
  );
  assert.strictEqual(
    section.querySelectorAll(".options__suggestion-apply").length,
    1,
  );
  buttonByText(section, "Añadir a «Música»").click();
  await settle(dom);
  assert.deepStrictEqual(
    dom.store.youtubeGroups.groups[0].channels.map((c) => c.name),
    ["Jazz Club"],
  );
  assert.strictEqual(
    section.querySelector("h2").textContent,
    "Canales sin grupo (1)",
  );
  const notice = dom.document.querySelector(".options__notice");
  assert.ok(notice.textContent.includes("«Jazz Club» añadido a «Música»"));
  const undo = buttonByText(notice, "Deshacer");
  assert.strictEqual(dom.document.activeElement, undo);
  undo.click();
  await settle(dom);
  assert.deepStrictEqual(dom.store.youtubeGroups.groups[0].channels, []);
  assert.strictEqual(
    section.querySelector("h2").textContent,
    "Canales sin grupo (2)",
  );
});

test("sugerencias: Aplicar sugerencias añade todas con una escritura", async () => {
  const dom = await loadSuggestions(
    [
      { ...makeGroup("m", { name: "Música" }), keywords: ["jazz"] },
      { ...makeGroup("c", { name: "Cocina" }), keywords: ["receta"] },
    ],
    [
      ["jazz", "Jazz Club", 2],
      ["receta", "Receta Diaria", 1],
    ],
  );
  const section = dom.document.getElementById("options-unclassified");
  const writes = countGroupWrites(dom);
  buttonByText(section, "Aplicar sugerencias de la página (2)").click();
  await settle(dom);
  assert.strictEqual(writes.count(), 1);
  assert.deepStrictEqual(
    dom.store.youtubeGroups.groups.map((g) => g.channels.length),
    [1, 1],
  );
  assert.ok(
    dom.document
      .querySelector(".options__notice")
      .textContent.includes("2 canales añadidos a sus grupos sugeridos"),
  );
});

test("sugerencias: Aplicar sugerencias solo usa las filas visibles", async () => {
  const dom = await loadSuggestions(
    [
      { ...makeGroup("m", { name: "Música" }), keywords: ["jazz"] },
      { ...makeGroup("c", { name: "Cocina" }), keywords: ["receta"] },
    ],
    [
      ["jazz", "Jazz Club", 2],
      ["receta", "Receta Diaria", 1],
    ],
  );
  const section = dom.document.getElementById("options-unclassified");
  const search = dom.document.getElementById("options-search-channels");
  search.value = "receta";
  search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await dom.flush();
  buttonByText(section, "Aplicar sugerencias de la página (1)").click();
  await settle(dom);
  assert.deepStrictEqual(
    dom.store.youtubeGroups.groups.map((g) => g.channels.length),
    [0, 1],
  );
});

test("sugerencias: sin palabras clave sale la ayuda y no hay botón de aplicar", async () => {
  const dom = await loadWithSubscriptions();
  const section = dom.document.getElementById("options-unclassified");
  assert.ok(
    section.textContent.includes(
      "Escribe palabras clave en un grupo (panel «Canales») para que aquí se sugiera a qué grupo añadir cada suscripción.",
    ),
  );
  assert.strictEqual(
    [...section.querySelectorAll("button")].some((b) =>
      b.textContent.startsWith("Aplicar sugerencias"),
    ),
    false,
  );
});

test("sugerencias: un nombre con HTML se muestra literal", async () => {
  const dom = await loadSuggestions(
    [{ ...makeGroup("m", { name: "Música" }), keywords: ["b"] }],
    [["x", "<b>a</b> b", 1]],
  );
  const section = dom.document.getElementById("options-unclassified");
  assert.strictEqual(section.querySelector("li b"), null);
  assert.ok(
    section
      .querySelector(".options__suggestion")
      .textContent.includes("(por «b»)"),
  );
});

test("la página de opciones tiene título, índice y secciones", async () => {
  const dom = await loadEditor();
  const { document } = dom;

  assert.strictEqual(
    document.querySelector("h1").textContent,
    "ChannelTree · Opciones",
  );
  const links = [...document.querySelectorAll('.options__tabs [role="tab"]')];
  assert.deepStrictEqual(
    links.map((a) => [a.textContent.trim(), a.getAttribute("aria-controls")]),
    [
      ["Grupos", "grupos"],
      ["Canales", "canales"],
      ["Datos", "datos"],
    ],
  );
  for (const a of links) {
    assert.ok(document.getElementById(a.getAttribute("aria-controls")));
  }
  assert.strictEqual(links.length, 3);
  assert.strictEqual(document.getElementById("atajos"), null);
  assert.strictEqual(document.getElementById("ajustes"), null);
  assert.ok(document.querySelector("#grupos #options-tree"));
  assert.ok(document.querySelector("main > #canales > #options-hidden"));
  assert.ok(document.querySelector("main > #datos > #copia"));
  assert.strictEqual(typeof dom.global("YouTubeGroupsBackup"), "object");
  assert.strictEqual(typeof dom.global("YouTubeGroupsSettings"), "object");
});

/**
 * Guarda `youtubeSubscriptions` con descripciones y espera al repintado.
 * @param {Object} dom - DOM cargado.
 * @param {Array<Array>} entries - [handle, nombre, descripción].
 * @returns {Promise<void>}
 */
async function setSubscriptionDescriptions(dom, entries) {
  const value = subscriptionsValue(entries.map(([h, n]) => [h, n, 100]));
  for (const [handle, , description] of entries) {
    if (description !== undefined) {
      value.channels[`${YT}/@${handle}`].description = description;
    }
  }
  await dom.browser.storage.local.set({ youtubeSubscriptions: value });
  await dom.flush();
}

const LONG_DESCRIPTION = `${"a".repeat(240)}b`;

/**
 * Comprueba que hay una única descripción truncada con su title completo.
 * @param {Element} section - Sección de lista.
 * @returns {void}
 */
function assertTruncatedDescription(section) {
  const nodes = [...section.querySelectorAll(".options__channel-description")];
  assert.strictEqual(nodes.length, 1);
  assert.strictEqual(nodes[0].textContent, `${"a".repeat(240)}…`);
  assert.strictEqual(nodes[0].getAttribute("title"), LONG_DESCRIPTION);
}

test("sin grupo: muestra la descripción corta, la larga truncada y texto literal", async () => {
  const dom = await loadWithSubscriptions();
  await setSubscriptionDescriptions(dom, [
    ["dos", "Dos", "Canal de <b>cocina</b>"],
    ["tres", "Tres", LONG_DESCRIPTION],
  ]);
  const section = dom.document.getElementById("options-unclassified");
  const nodes = [...section.querySelectorAll(".options__channel-description")];
  assert.strictEqual(nodes.length, 2);
  // Misma antigüedad: se ordenan por nombre (Dos, Tres).
  assert.strictEqual(nodes[0].textContent, "Canal de <b>cocina</b>");
  assert.strictEqual(nodes[0].getAttribute("title"), null);
  assert.strictEqual(nodes[1].textContent, `${"a".repeat(240)}…`);
  assert.strictEqual(nodes[1].getAttribute("title"), LONG_DESCRIPTION);
  assert.strictEqual(section.querySelectorAll("b").length, 0);
});

test("la descripción es hija directa de la fila, tras el bloque de texto y antes de los botones", async () => {
  const dom = await loadWithSubscriptions();
  await setSubscriptionDescriptions(dom, [["dos", "Dos", "Canal de cocina"]]);
  const section = dom.document.getElementById("options-unclassified");
  const node = section.querySelector(".options__channel-description");
  const row = node.parentElement;
  assert.ok(row.classList.contains("options__channel"));
  assert.strictEqual(node.closest(".options__channel-text"), null);
  const text = node.previousElementSibling;
  assert.ok(text.classList.contains("options__channel-text"));
});

test("ocultos e inactivos: la descripción es hija directa de la fila tras el texto", async () => {
  const { dom } = await loadWithHidden([["a", "Alfa", 100]]);
  await setSubscriptionDescriptions(dom, [["a", "Alfa", "Corta"]]);
  const hidden = dom.document
    .getElementById("options-hidden")
    .querySelector(".options__channel-description");
  assert.ok(hidden.parentElement.classList.contains("options__channel"));
  assert.ok(
    hidden.previousElementSibling.classList.contains("options__channel-text"),
  );
  assert.strictEqual(hidden.nextElementSibling.tagName, "BUTTON");

  const inactiveDom = await loadWithActivity();
  const now = Date.now();
  const value = subscriptionsValue([
    ["uno", "Uno", now - 400 * DAY],
    ["dos", "Dos", now - 400 * DAY],
  ]);
  value.channels[`${YT}/@uno`].description = "Corta";
  await inactiveDom.browser.storage.local.set({ youtubeSubscriptions: value });
  await inactiveDom.flush();
  const inactive = inactiveDom.document
    .getElementById("options-inactive")
    .querySelector(".options__channel-description");
  assert.ok(inactive.parentElement.classList.contains("options__channel"));
  assert.ok(
    inactive.previousElementSibling.classList.contains("options__channel-text"),
  );
});

test("sin grupo: sin descripción no hay línea de descripción", async () => {
  const dom = await loadWithSubscriptions();
  const section = dom.document.getElementById("options-unclassified");
  assert.strictEqual(
    section.querySelectorAll(".options__channel-description").length,
    0,
  );
});

test("ocultos: muestra la descripción de la suscripción y se repinta al cambiar", async () => {
  const { dom } = await loadWithHidden([
    ["a", "Alfa", 100],
    ["x", "Ajeno", 50],
  ]);
  const section = dom.document.getElementById("options-hidden");
  assert.strictEqual(
    section.querySelectorAll(".options__channel-description").length,
    0,
  );
  await setSubscriptionDescriptions(dom, [["a", "Alfa", LONG_DESCRIPTION]]);
  assertTruncatedDescription(section);
  await setSubscriptionDescriptions(dom, [["a", "Alfa", "Corta <b>"]]);
  const node = section.querySelector(".options__channel-description");
  assert.strictEqual(node.textContent, "Corta <b>");
  assert.strictEqual(node.getAttribute("title"), null);
});

test("inactivos: muestra la descripción del canal", async () => {
  const dom = await loadWithActivity();
  const section = dom.document.getElementById("options-inactive");
  assert.strictEqual(
    section.querySelectorAll(".options__channel-description").length,
    0,
  );
  const now = Date.now();
  const value = subscriptionsValue([
    ["uno", "Uno", now - 400 * DAY],
    ["dos", "Dos", now - 400 * DAY],
  ]);
  value.channels[`${YT}/@uno`].description = LONG_DESCRIPTION;
  await dom.browser.storage.local.set({ youtubeSubscriptions: value });
  await dom.flush();
  assertTruncatedDescription(section);
  value.channels[`${YT}/@uno`].description = "Corta <b>";
  await dom.browser.storage.local.set({ youtubeSubscriptions: value });
  await dom.flush();
  const node = section.querySelector(".options__channel-description");
  assert.strictEqual(node.textContent, "Corta <b>");
  assert.strictEqual(node.getAttribute("title"), null);
  assert.strictEqual(section.querySelectorAll("b").length, 0);
});

/**
 * Carga el editor con un grupo A de `count` canales ("Canal 01"...) y un grupo B.
 * @param {number} count - Canales de A.
 * @returns {Promise<Object>} DOM cargado.
 */
async function loadPagedEditor(count) {
  const channels = Array.from({ length: count }, (_, i) => {
    const n = String(i + 1).padStart(2, "0");
    return { name: `Canal ${n}`, url: `${YT}/@canal${n}` };
  });
  const store = groupsStore([
    makeGroup("a", { name: "A", channels }),
    makeGroup("b", { name: "B", channels: [] }),
  ]);
  const dom = loadOptionsDom({ store });
  await dom.flush();
  rowOf(dom, "A").querySelector(".options__name").click();
  await dom.flush();
  return dom;
}

/**
 * Nombres de los canales de la página visible del panel.
 * @param {Object} dom - DOM cargado.
 * @returns {string[]} Nombres.
 */
function panelNames(dom) {
  return [
    ...dom.document.querySelectorAll(
      "#options-channels .options__channel-link",
    ),
  ].map((a) => a.textContent);
}

test("el panel de canales pagina de 20 en 20 y conserva el foco en Siguiente", async () => {
  const dom = await loadPagedEditor(45);
  const panel = dom.document.getElementById("options-channels");
  assert.strictEqual(panelNames(dom).length, 20);
  assert.ok(panel.textContent.includes("Página 1 de 3 · 45 canales"));
  const next = panel.querySelector('[data-focus-key="page-next"]');
  next.focus();
  next.click();
  await dom.flush();
  assert.strictEqual(panelNames(dom)[0], "Canal 21");
  assert.strictEqual(panelNames(dom).length, 20);
  assert.ok(panel.textContent.includes("Página 2 de 3"));
  assert.strictEqual(
    dom.document.activeElement.getAttribute("data-focus-key"),
    "page-next",
  );
});

test("la última página del panel tiene los canales restantes", async () => {
  const dom = await loadPagedEditor(25);
  const panel = dom.document.getElementById("options-channels");
  panel.querySelector('[data-focus-key="page-next"]').click();
  await dom.flush();
  assert.strictEqual(panelNames(dom)[0], "Canal 21");
  assert.strictEqual(panelNames(dom).length, 5);
  assert.ok(panel.textContent.includes("Página 2 de 2"));
});

test("el panel de canales va después del árbol en el documento", async () => {
  const dom = await loadPagedEditor(1);
  const tree = dom.document.querySelector(".options__tree-pane");
  const panel = dom.document.getElementById("options-channels");
  assert.ok(
    tree.compareDocumentPosition(panel) &
      dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
  );
});

test("con 20 canales o menos no hay controles de página", async () => {
  const dom = await loadPagedEditor(20);
  assert.strictEqual(panelNames(dom).length, 20);
  assert.strictEqual(
    dom.document.querySelector("#options-channels .options__pager"),
    null,
  );
});

test("la selección del panel se conserva entre páginas y Quitar actúa sobre toda", async () => {
  const dom = await loadPagedEditor(25);
  const panel = dom.document.getElementById("options-channels");
  const boxes = () => [...panel.querySelectorAll("input[data-url]")];
  setChecked(dom, boxes()[0], true);
  setChecked(dom, boxes()[1], true);
  panel.querySelector('[data-focus-key="page-next"]').click();
  await dom.flush();
  setChecked(dom, boxes()[0], true);
  assert.ok(buttonByText(panel, "Quitar (3)"));
  buttonByText(panel, "Quitar (3)").click();
  await settle(dom);
  assert.ok(panel.textContent.includes("22 canales"));
});

test("Seleccionar la página marca solo los visibles y queda indeterminada", async () => {
  const dom = await loadPagedEditor(25);
  const panel = dom.document.getElementById("options-channels");
  const allBox = panel.querySelector('[data-focus="select-all"]');
  setChecked(dom, allBox, true);
  assert.ok(buttonByText(panel, "Quitar (20)"));
  const boxes = [...panel.querySelectorAll("input[data-url]")];
  setChecked(dom, boxes[0], false);
  assert.strictEqual(allBox.indeterminate, true);
  assert.strictEqual(allBox.checked, false);
  assert.ok(buttonByText(panel, "Quitar (19)"));
});

test("la búsqueda y el cambio de grupo vuelven a la página 1", async () => {
  const dom = await loadPagedEditor(120);
  const panel = dom.document.getElementById("options-channels");
  panel.querySelector('[data-focus-key="page-next"]').click();
  await dom.flush();
  assert.ok(panel.textContent.includes("Página 2 de 6"));
  const search = dom.document.getElementById("options-search-groups");
  search.value = "1";
  search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await dom.flush();
  assert.ok(panel.textContent.includes("Página 1 de 2 · 40 canales"));

  search.value = "";
  search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await dom.flush();
  panel.querySelector('[data-focus-key="page-next"]').click();
  await dom.flush();
  rowOf(dom, "B").querySelector(".options__name").click();
  await dom.flush();
  rowOf(dom, "A").querySelector(".options__name").click();
  await dom.flush();
  assert.ok(panel.textContent.includes("Página 1 de 6"));
});

test("quitar todos los de la última página deja la página anterior", async () => {
  const dom = await loadPagedEditor(41);
  const panel = dom.document.getElementById("options-channels");
  const next = () => panel.querySelector('[data-focus-key="page-next"]');
  next().click();
  await dom.flush();
  next().click();
  await dom.flush();
  assert.ok(panel.textContent.includes("Página 3 de 3"));
  setChecked(dom, panel.querySelector('[data-focus="select-all"]'), true);
  buttonByText(panel, "Quitar (1)").click();
  await settle(dom);
  assert.ok(panel.textContent.includes("Página 2 de 2 · 40 canales"));
  assert.strictEqual(panelNames(dom).length, 20);
});

/**
 * Paridad de cada fila visible del árbol: "odd", "even" o "ambas"/"ninguna" si es inconsistente.
 * @param {Object} dom - DOM cargado.
 * @returns {string[]} Parejas "nombre:paridad" en orden de pantalla.
 */
function stripes(dom) {
  return [...dom.document.querySelectorAll("#options-tree .options__row")].map(
    (row) => {
      const odd = row.classList.contains("options__row--odd");
      const even = row.classList.contains("options__row--even");
      const kind =
        odd && even ? "ambas" : odd ? "odd" : even ? "even" : "ninguna";
      return `${row.querySelector(".options__name").textContent}:${kind}`;
    },
  );
}

test("las filas del árbol alternan impar y par según su orden visible", async () => {
  const store = groupsStore([
    makeGroup("a", {
      name: "A",
      subgroups: [
        makeGroup("a1", { name: "A1" }),
        makeGroup("a2", { name: "A2" }),
      ],
    }),
    makeGroup("b", { name: "B" }),
  ]);
  const dom = loadOptionsDom({ store });
  await dom.flush();
  assert.deepStrictEqual(stripes(dom), [
    "A:odd",
    "A1:even",
    "A2:odd",
    "B:even",
  ]);

  // Plegar A: quedan A y B.
  rowOf(dom, "A").querySelector(".options__toggle").click();
  await settle(dom);
  assert.deepStrictEqual(stripes(dom), ["A:odd", "B:even"]);

  // Una búsqueda que solo deja B.
  const search = dom.document.getElementById("options-search-groups");
  search.value = "B";
  search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await settle(dom);
  assert.deepStrictEqual(stripes(dom), ["B:odd"]);

  // Sin búsqueda y tras mover A tras B, el orden nuevo vuelve a alternar.
  search.value = "";
  search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await settle(dom);
  rowOf(dom, "A").dispatchEvent(
    new dom.window.KeyboardEvent("keydown", {
      key: "ArrowDown",
      altKey: true,
      bubbles: true,
    }),
  );
  await settle(dom);
  assert.deepStrictEqual(stripes(dom), ["B:odd", "A:even"]);
});

/**
 * Carga dos grupos (Alfa y Beta) y tres canales sin grupo.
 * @returns {Promise<Object>} DOM cargado.
 */
async function loadTwoSearches() {
  const store = groupsStore([
    makeGroup("a", { name: "Alfa" }),
    makeGroup("b", { name: "Beta" }),
  ]);
  store.youtubeSubscriptions = subscriptionsValue([
    ["uno", "Uno", 100],
    ["dos", "Dos", 200],
    ["tres", "Tres", 300],
  ]);
  const dom = loadOptionsDom({ store });
  await dom.flush();
  return dom;
}

/**
 * Escribe en un campo y espera al repintado.
 * @param {Object} dom - DOM cargado.
 * @param {HTMLInputElement} input - Campo.
 * @param {string} value - Texto.
 * @returns {Promise<void>}
 */
async function typeIn(dom, input, value) {
  input.value = value;
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await dom.flush();
}

const unclassifiedRows = (dom) =>
  dom.document.querySelectorAll("#options-unclassified li").length;

test("buscadores: no hay en la cabecera y cada uno está en su pestaña", async () => {
  const dom = await loadTwoSearches();
  const doc = dom.document;
  assert.strictEqual(doc.getElementById("options-search"), null);
  assert.strictEqual(doc.querySelector(".options__header input"), null);
  const follows = (a, b) =>
    Boolean(
      a.compareDocumentPosition(b) &
      dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
    );

  const groups = doc.getElementById("options-search-groups");
  assert.ok(doc.getElementById("grupos").contains(groups));
  assert.strictEqual(
    groups.closest("label").textContent.trim(),
    "Buscar grupos y canales",
  );
  assert.ok(follows(doc.querySelector("#grupos .options__toolbar"), groups));
  assert.ok(follows(groups, doc.getElementById("options-tree")));

  const channels = doc.getElementById("options-search-channels");
  assert.ok(doc.getElementById("canales").contains(channels));
  assert.strictEqual(
    channels.closest("label").textContent.trim(),
    "Buscar canales",
  );
  assert.ok(follows(doc.getElementById("options-page-size"), channels));
  assert.ok(follows(channels, doc.getElementById("options-unclassified")));
});

test("buscadores: son independientes y se conservan al cambiar de pestaña", async () => {
  const dom = await loadTwoSearches();
  const doc = dom.document;
  const groups = doc.getElementById("options-search-groups");
  const channels = doc.getElementById("options-search-channels");

  await typeIn(dom, groups, "alfa");
  assert.deepStrictEqual(treeNames(dom), ["Alfa"]);
  assert.strictEqual(unclassifiedRows(dom), 3);

  await typeIn(dom, groups, "");
  await typeIn(dom, channels, "dos");
  assert.deepStrictEqual(treeNames(dom), ["Alfa", "Beta"]);
  assert.ok(
    !doc
      .getElementById("options-summary")
      .textContent.includes("Sin resultados"),
  );
  assert.strictEqual(unclassifiedRows(dom), 1);

  await typeIn(dom, groups, "beta");
  for (const id of ["datos", "grupos", "canales"]) {
    doc.getElementById(`options-tab-${id}`).click();
  }
  assert.strictEqual(groups.value, "beta");
  assert.strictEqual(channels.value, "dos");
  assert.deepStrictEqual(treeNames(dom), ["Beta"]);
  assert.strictEqual(unclassifiedRows(dom), 1);
});

test("buscadores: Escape en el de Canales lo vacía", async () => {
  const dom = await loadTwoSearches();
  const channels = dom.document.getElementById("options-search-channels");
  await typeIn(dom, channels, "dos");
  assert.strictEqual(unclassifiedRows(dom), 1);
  const event = new dom.window.KeyboardEvent("keydown", {
    key: "Escape",
    bubbles: true,
    cancelable: true,
  });
  channels.dispatchEvent(event);
  await dom.flush();
  assert.strictEqual(event.defaultPrevented, true);
  assert.strictEqual(channels.value, "");
  assert.strictEqual(unclassifiedRows(dom), 3);
});

/**
 * Carga el editor con el grupo A (canales "uno" y "dos") seleccionado.
 * @param {string|undefined} description - Descripción de "uno".
 * @returns {Promise<Object>} DOM cargado.
 */
async function loadGroupPanelWithDescription(description) {
  const store = groupsStore([
    makeGroup("a", {
      name: "A",
      channels: [
        { name: "Uno", url: `${YT}/@uno` },
        { name: "Dos", url: `${YT}/@dos` },
      ],
    }),
  ]);
  const value = subscriptionsValue([["uno", "Uno", 100]]);
  if (description !== undefined) {
    value.channels[`${YT}/@uno`].description = description;
  }
  store.youtubeSubscriptions = value;
  const dom = loadOptionsDom({ store });
  await dom.flush();
  rowOf(dom, "A").querySelector(".options__name").click();
  await dom.flush();
  return dom;
}

test("panel del grupo: muestra la descripción del canal tras su texto", async () => {
  const dom = await loadGroupPanelWithDescription("Canal de <b>cocina</b>");
  const panel = dom.document.getElementById("options-channels");
  const nodes = [...panel.querySelectorAll(".options__channel-description")];
  // "dos" no está en las suscripciones: sin descripción.
  assert.strictEqual(nodes.length, 1);
  assert.strictEqual(nodes[0].textContent, "Canal de <b>cocina</b>");
  assert.strictEqual(nodes[0].getAttribute("title"), null);
  assert.strictEqual(panel.querySelectorAll("b").length, 0);
  assert.ok(nodes[0].parentElement.classList.contains("options__channel"));
  assert.ok(
    nodes[0].previousElementSibling.classList.contains("options__channel-text"),
  );
});

test("panel del grupo: sin descripción no hay línea y al llegar se trunca", async () => {
  const dom = await loadGroupPanelWithDescription(undefined);
  const panel = dom.document.getElementById("options-channels");
  assert.strictEqual(
    panel.querySelectorAll(".options__channel-description").length,
    0,
  );
  await setSubscriptionDescriptions(dom, [["uno", "Uno", LONG_DESCRIPTION]]);
  assertTruncatedDescription(panel);
});
