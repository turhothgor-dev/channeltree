// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { loadDom, manifestScripts } = require("./helpers/load-dom");
const {
  makeGroup,
  groupsStore,
  GUIDE_HTML,
} = require("./helpers/youtube-fixtures");

const PICKER = ".youtube-groups__icon-picker";
const PICKER_FORM = ".youtube-groups__icon-picker-form";
const FORM_PREVIEW = ".youtube-groups__guide-form-icon-preview";

/**
 * Carga la guía con un grupo y abre el formulario de crear.
 * @returns {Promise<Object>} El resultado de loadDom, ya estabilizado.
 */
async function loadWithGuideForm() {
  const dom = loadDom({
    html: GUIDE_HTML,
    store: groupsStore([makeGroup("A")]),
  });
  await dom.flush();
  dom.document.querySelector(".youtube-groups__guide-create").click();
  return dom;
}

test('el botón "Icono" abre un único selector visible y no se duplica', async () => {
  const dom = await loadWithGuideForm();
  const iconButton = dom.document.querySelector(
    ".youtube-groups__guide-form-icon",
  );

  iconButton.click();
  iconButton.click();

  assert.strictEqual(dom.document.querySelectorAll(PICKER).length, 1);
  assert.strictEqual(dom.document.querySelector(PICKER).hidden, false);
  assert.strictEqual(dom.document.querySelector(PICKER_FORM).hidden, false);
});

test("las celdas de icono y Sin icono usan la clase común; colores y pestañas no (ADR 0041)", async () => {
  const dom = await loadWithGuideForm();
  dom.document.querySelector(".youtube-groups__guide-form-icon").click();
  const ICON = "youtube-groups__icon-button";
  const options = dom.document.querySelectorAll(
    ".youtube-groups__icon-picker-option",
  );

  assert.ok(options.length > 1);
  for (const option of options) {
    assert.ok(option.classList.contains(ICON));
  }
  assert.ok(
    dom.document
      .querySelector(".youtube-groups__icon-picker-option--none")
      .classList.contains(ICON),
  );
  for (const selector of [
    ".youtube-groups__icon-picker-color-option",
    ".youtube-groups__icon-picker-tab",
  ]) {
    const found = dom.document.querySelectorAll(selector);
    assert.ok(found.length > 0, selector);
    for (const el of found) {
      assert.ok(!el.classList.contains(ICON), selector);
    }
  }
});

test('elegir un icono y "Guardar" lo pone en la vista previa y oculta el selector', async () => {
  const dom = await loadWithGuideForm();
  dom.document.querySelector(".youtube-groups__guide-form-icon").click();
  assert.strictEqual(
    dom.document.querySelector(FORM_PREVIEW).children.length,
    0,
  );

  // El primer botón es "Sin icono"; el segundo, el primer icono del conjunto
  const options = dom.document.querySelectorAll(
    ".youtube-groups__icon-picker-option",
  );
  options[1].click();
  dom.document.querySelector(".youtube-groups__icon-picker-save").click();
  await dom.flush();

  assert.ok(dom.document.querySelector(`${FORM_PREVIEW} svg`));
  assert.strictEqual(dom.document.querySelector(PICKER).hidden, true);
  assert.strictEqual(dom.document.querySelector(PICKER_FORM).hidden, true);
});

test('"Cancelar" oculta el selector sin cambiar la vista previa', async () => {
  const dom = await loadWithGuideForm();
  dom.document.querySelector(".youtube-groups__guide-form-icon").click();
  dom.document
    .querySelectorAll(".youtube-groups__icon-picker-option")[1]
    .click();

  dom.document.querySelector(".youtube-groups__icon-picker-cancel").click();

  assert.strictEqual(dom.document.querySelector(PICKER).hidden, true);
  assert.strictEqual(dom.document.querySelector(PICKER_FORM).hidden, true);
  assert.strictEqual(
    dom.document.querySelector(FORM_PREVIEW).children.length,
    0,
  );
});

/** Carga los scripts del manifiesto sin content.js y devuelve el componente. */
function loadIconPicker() {
  const scripts = manifestScripts().filter((file) => file !== "content.js");
  const dom = loadDom({ scripts });
  return { dom, picker: dom.global("YouTubeGroupsIconPicker") };
}

test("openIconPicker abre el selector y Guardar llama a onSave con la elección", async () => {
  const { dom, picker } = loadIconPicker();
  const anchor = dom.document.createElement("button");
  dom.document.body.appendChild(anchor);
  const saved = [];

  picker.openIconPicker({ iconId: "", colorHex: "" }, anchor, (choice) => {
    saved.push(choice);
  });
  assert.strictEqual(dom.document.querySelector(PICKER).hidden, false);

  dom.document
    .querySelectorAll(".youtube-groups__icon-picker-option")[1]
    .click();
  dom.document.querySelector(".youtube-groups__icon-picker-save").click();
  await dom.flush();

  assert.strictEqual(saved.length, 1);
  assert.ok(saved[0].iconId);
  assert.strictEqual(saved[0].colorHex, "");
  assert.strictEqual(dom.document.querySelector(PICKER).hidden, true);
});

/** Abre el selector con un ancla simulada y devuelve su posición. */
function openAtAnchor(rect) {
  const { dom, picker } = loadIconPicker();
  const anchor = dom.document.createElement("button");
  dom.document.body.appendChild(anchor);
  anchor.getBoundingClientRect = () => rect;
  picker.openIconPicker({}, anchor, () => {});
  return dom.document.querySelector(PICKER).style;
}

test("openIconPicker usa la reserva de 290 x 400 junto al borde inferior derecho", () => {
  const style = openAtAnchor({ left: 1200, top: 770, bottom: 790 });

  assert.strictEqual(style.left, "984px");
  assert.strictEqual(style.top, "364px");
});

test("openIconPicker se coloca bajo el ancla cuando cabe", () => {
  const style = openAtAnchor({ left: 0, top: 0, bottom: 20 });

  assert.strictEqual(style.left, "6px");
  assert.strictEqual(style.top, "26px");
});

test("si onSave lanza, el error se muestra y el selector sigue abierto", async () => {
  const { dom, picker } = loadIconPicker();
  const anchor = dom.document.createElement("button");
  dom.document.body.appendChild(anchor);

  picker.openIconPicker({}, anchor, () => {
    throw new Error("Fallo al guardar");
  });
  dom.document.querySelector(".youtube-groups__icon-picker-save").click();
  await dom.flush();

  assert.strictEqual(
    dom.document.querySelector(".youtube-groups__icon-picker-error")
      .textContent,
    "Fallo al guardar",
  );
  assert.strictEqual(dom.document.querySelector(PICKER).hidden, false);
});

/** Abre el selector con un icono inicial y devuelve el entorno. */
function openWith(iconId, onSave = () => {}) {
  const { dom, picker } = loadIconPicker();
  const anchor = dom.document.createElement("button");
  dom.document.body.appendChild(anchor);
  picker.openIconPicker({ iconId, colorHex: "" }, anchor, onSave);
  return { dom, picker };
}

const TABS = '[role="tab"]';
const PANELS = '[role="tabpanel"]';

/** Pulsa una tecla en un elemento (con burbujeo y cancelable). */
function press(dom, element, key) {
  const event = new dom.window.KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  element.dispatchEvent(event);
  return event;
}

/** Id de la pestaña activa (la que tiene tabindex 0). */
function activeTab(dom) {
  const tabs = [...dom.document.querySelectorAll(TABS)];
  const active = tabs.filter((tab) => tab.getAttribute("tabindex") === "0");
  assert.strictEqual(active.length, 1);
  assert.strictEqual(active[0].getAttribute("aria-selected"), "true");
  return active[0];
}

test("hay una pestaña por categoría y cada una controla su panel", () => {
  const { dom } = openWith("");
  const icons = dom.global("YouTubeGroupsIcons");
  const tabs = [...dom.document.querySelectorAll(TABS)];
  const panels = [...dom.document.querySelectorAll(PANELS)];

  assert.deepStrictEqual(
    tabs.map((tab) => tab.textContent),
    [...icons.ICON_CATEGORIES].map((category) => category.label),
  );
  assert.strictEqual(panels.length, 3);
  assert.strictEqual(
    dom.document.querySelector('[role="tablist"]').getAttribute("aria-label"),
    "Categorías de iconos",
  );
  tabs.forEach((tab, index) => {
    assert.strictEqual(tab.getAttribute("aria-controls"), panels[index].id);
    assert.strictEqual(panels[index].getAttribute("aria-labelledby"), tab.id);
  });
});

test("sin icono se abre en General; con news, en Medios con el icono marcado", () => {
  const sin = openWith("");
  assert.strictEqual(activeTab(sin.dom).textContent, "General");
  const panelsSin = [...sin.dom.document.querySelectorAll(PANELS)];
  assert.deepStrictEqual(
    panelsSin.map((panel) => panel.hidden),
    [false, true, true],
  );

  const { dom } = openWith("news");
  assert.strictEqual(activeTab(dom).textContent, "Medios");
  const panels = [...dom.document.querySelectorAll(PANELS)];
  assert.deepStrictEqual(
    panels.map((panel) => panel.hidden),
    [true, false, true],
  );
  const news = dom.document.querySelector('[data-icon-id="news"]');
  assert.strictEqual(news.getAttribute("aria-pressed"), "true");
  assert.strictEqual(panels[1].contains(news), true);
});

test("las flechas, Inicio y Fin cambian y enfocan la pestaña", () => {
  const { dom } = openWith("sports");
  const tablist = dom.document.querySelector('[role="tablist"]');
  assert.strictEqual(activeTab(dom).textContent, "Deportes");

  press(dom, activeTab(dom), "ArrowRight");
  assert.strictEqual(activeTab(dom).textContent, "General");
  assert.strictEqual(dom.document.activeElement, activeTab(dom));

  press(dom, activeTab(dom), "ArrowLeft");
  assert.strictEqual(activeTab(dom).textContent, "Deportes");

  press(dom, activeTab(dom), "Home");
  assert.strictEqual(activeTab(dom).textContent, "General");

  press(dom, activeTab(dom), "End");
  assert.strictEqual(activeTab(dom).textContent, "Deportes");
  assert.strictEqual(dom.document.activeElement, activeTab(dom));
  assert.ok(tablist.contains(dom.document.activeElement));
});

test("una flecha en las pestañas no llega a los escuchadores de document", () => {
  const { dom } = openWith("");
  let reached = 0;
  dom.document.addEventListener("keydown", () => {
    reached += 1;
  });

  const event = press(dom, activeTab(dom), "ArrowRight");

  assert.strictEqual(event.defaultPrevented, true);
  assert.strictEqual(reached, 0);
});

test('"Sin icono" guarda iconId vacío y no cambia de pestaña', async () => {
  const saved = [];
  const { dom } = openWith("news", (choice) => saved.push(choice));

  dom.document
    .querySelector(".youtube-groups__icon-picker-option--none")
    .click();
  assert.strictEqual(activeTab(dom).textContent, "Medios");
  dom.document.querySelector(".youtube-groups__icon-picker-save").click();
  await dom.flush();

  assert.strictEqual(saved.length, 1);
  assert.strictEqual(saved[0].iconId, "");
});

test("cada icono tiene aria-label igual a su etiqueta", () => {
  const { dom } = openWith("");
  const icons = dom.global("YouTubeGroupsIcons");
  for (const icon of icons.ICON_SET) {
    const button = dom.document.querySelector(`[data-icon-id="${icon.id}"]`);
    assert.strictEqual(button.getAttribute("aria-label"), icon.label);
    assert.strictEqual(button.title, icon.label);
  }
});

test("hideIconPicker oculta el selector", () => {
  const { dom, picker } = loadIconPicker();
  const anchor = dom.document.createElement("button");
  dom.document.body.appendChild(anchor);
  picker.openIconPicker({}, anchor, () => {});

  picker.hideIconPicker();

  assert.strictEqual(dom.document.querySelector(PICKER).hidden, true);
  assert.strictEqual(dom.document.querySelector(PICKER_FORM).hidden, true);
});
