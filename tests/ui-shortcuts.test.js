// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { loadDom } = require("./helpers/load-dom");
const {
  CHANNEL_URL,
  makeGroup,
  groupsStore,
  GUIDE_HTML,
  SUBSCRIPTION_CARD_HTML,
} = require("./helpers/youtube-fixtures");

const TOAST = "#youtube-groups-toast";
const CLEAR_MESSAGE = { type: "youtube-groups:clear-selection" };

/** Tarjeta de un canal que no está en el grupo de prueba. */
const OTHER_CARD_HTML = SUBSCRIPTION_CARD_HTML.replace(
  'href="/@canal"',
  'href="/@otro"',
).replace(">Canal<", ">Otro<");

/**
 * Carga /feed/subscriptions con la guía, el grupo A (con @canal) y dos tarjetas.
 * @returns {Promise<Object>} El resultado de loadDom, ya estabilizado.
 */
async function loadWithGroup() {
  const dom = loadDom({
    html: GUIDE_HTML + SUBSCRIPTION_CARD_HTML + OTHER_CARD_HTML,
    store: groupsStore([
      makeGroup("A", { channels: [{ name: "Canal", url: CHANNEL_URL }] }),
    ]),
  });
  await dom.flush();
  return dom;
}

test("clear-selection vacía la selección sin navegar y avisa sin botón", async () => {
  const dom = await loadWithGroup();
  const cards = dom.document.querySelectorAll("ytd-rich-item-renderer");
  dom.document.querySelector(".youtube-groups__guide-item").click();
  await dom.flush();
  const clear = dom.document.querySelector(".youtube-groups__guide-clear");
  assert.strictEqual(clear.disabled, false);
  assert.ok(cards[1].classList.contains("youtube-groups--hidden"));
  const navigations = dom.navigations.count;

  const results = dom.sendRuntimeMessage(CLEAR_MESSAGE);
  await dom.flush();

  assert.deepStrictEqual(results, [undefined]);
  assert.strictEqual(clear.disabled, true);
  assert.strictEqual(clear.getAttribute("aria-label"), "Limpiar selección");
  assert.ok(!cards[1].classList.contains("youtube-groups--hidden"));
  assert.strictEqual(dom.navigations.count, navigations);
  const toast = dom.document.querySelector(TOAST);
  assert.strictEqual(toast.hidden, false);
  assert.ok(toast.textContent.includes("Selección limpiada"));
  assert.strictEqual(toast.querySelector("button"), null);
});

test("clear-selection con la selección vacía no muestra aviso", async () => {
  const dom = await loadWithGroup();

  dom.sendRuntimeMessage(CLEAR_MESSAGE);
  await dom.flush();

  const toast = dom.document.querySelector(TOAST);
  assert.ok(toast === null || toast.hidden === true);
});

test("un mensaje con otro tipo no cambia la selección ni avisa", async () => {
  const dom = await loadWithGroup();
  dom.document.querySelector(".youtube-groups__guide-item").click();
  await dom.flush();
  const clear = dom.document.querySelector(".youtube-groups__guide-clear");

  dom.sendRuntimeMessage({ type: "otro" });
  dom.sendRuntimeMessage(undefined);
  await dom.flush();

  assert.strictEqual(clear.disabled, false);
  const toast = dom.document.querySelector(TOAST);
  assert.ok(toast === null || toast.hidden === true);
});
