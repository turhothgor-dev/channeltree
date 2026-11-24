// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { loadDom, manifestScripts } = require("./helpers/load-dom");

const TOAST = "#youtube-groups-toast";

/** Carga los scripts del manifiesto sin content.js y crea el componente. */
function loadToast() {
  const scripts = manifestScripts().filter((file) => file !== "content.js");
  const dom = loadDom({ scripts });
  const toast = dom.global("YouTubeGroupsToast");
  return { dom, toast, api: toast.create({}) };
}

test("crear el componente no toca el DOM", () => {
  const { dom } = loadToast();
  assert.strictEqual(dom.document.querySelector(TOAST), null);
});

test('show crea un único aviso con role="status", el texto y "Deshacer" enfocado', () => {
  const { dom, api } = loadToast();

  api.show("Hola", { onAction() {} });

  const toasts = dom.document.querySelectorAll(TOAST);
  assert.strictEqual(toasts.length, 1);
  assert.strictEqual(toasts[0].getAttribute("role"), "status");
  assert.strictEqual(toasts[0].hidden, false);
  assert.ok(toasts[0].textContent.includes("Hola"));
  const button = toasts[0].querySelector("button");
  assert.strictEqual(button.textContent, "Deshacer");
  assert.strictEqual(dom.document.activeElement, button);
});

test("un segundo show reutiliza el elemento y quita el botón sin onAction", () => {
  const { dom, api } = loadToast();

  api.show("Uno", { onAction() {} });
  api.show("Dos");

  const toasts = dom.document.querySelectorAll(TOAST);
  assert.strictEqual(toasts.length, 1);
  assert.strictEqual(toasts[0].querySelector("button"), null);
  assert.ok(toasts[0].textContent.includes("Dos"));
  assert.ok(!toasts[0].textContent.includes("Uno"));
});

test('pulsar "Deshacer" oculta el aviso y llama a onAction una vez', () => {
  const { dom, api } = loadToast();
  let calls = 0;

  api.show("Hola", {
    onAction() {
      calls += 1;
    },
  });
  dom.document.querySelector(`${TOAST} button`).click();

  assert.strictEqual(calls, 1);
  assert.strictEqual(dom.document.querySelector(TOAST).hidden, true);
});

test("un texto con <b> se muestra literal", () => {
  const { dom, api } = loadToast();

  api.show("Canal <b>X</b>");

  const toast = dom.document.querySelector(TOAST);
  assert.strictEqual(toast.querySelector("b"), null);
  assert.ok(toast.textContent.includes("<b>X</b>"));
});

test("a los 10 s se oculta", () => {
  const { dom, toast, api } = loadToast();
  const timers = [];
  dom.window.setTimeout = (fn, delay) => {
    timers.push({ fn, delay });
    return timers.length;
  };

  api.show("Hola", { onAction() {} });

  assert.strictEqual(timers.length, 1);
  assert.strictEqual(timers[0].delay, toast.DURATION_MS);
  assert.strictEqual(toast.DURATION_MS, 10000);
  assert.strictEqual(dom.document.querySelector(TOAST).hidden, false);
  timers[0].fn();
  assert.strictEqual(dom.document.querySelector(TOAST).hidden, true);
});
