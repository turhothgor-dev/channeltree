// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { loadDom } = require("./helpers/load-dom");

const TOAST = "#youtube-groups-toast";
const RECEIVED = "Grupos y ajustes actualizados desde otro dispositivo";
const TOO_BIG =
  "Sincronización desactivada: los grupos ya no caben en la cuota de Firefox";

/**
 * Carga el DOM con un estado de sincronización inicial.
 * @param {Object} state - Campos de `youtubeSync`.
 * @returns {Promise<Object>} DOM cargado.
 */
async function load(state) {
  const dom = loadDom({
    store: { youtubeSync: { version: 1, enabled: true, ...state } },
  });
  await dom.flush();
  return dom;
}

/**
 * Escribe el estado de sincronización y espera a que se aplique.
 * @param {Object} dom - DOM cargado.
 * @param {Object} state - Campos de `youtubeSync`.
 */
async function write(dom, state) {
  await dom.browser.storage.local.set({
    youtubeSync: { version: 1, enabled: true, ...state },
  });
  await dom.flush();
}

/** Texto del aviso, o "" si no existe o está oculto. */
function toastText(dom) {
  const toast = dom.document.querySelector(TOAST);
  return toast && !toast.hidden ? toast.textContent : "";
}

test("una recepción nueva muestra el aviso", async () => {
  const dom = await load({ status: "ok", lastReceivedAt: 1000 });
  assert.strictEqual(toastText(dom), "");

  await write(dom, { status: "ok", lastReceivedAt: 2000 });

  assert.ok(toastText(dom).includes(RECEIVED));
});

test("el mismo lastReceivedAt no muestra nada", async () => {
  const dom = await load({ status: "ok", lastReceivedAt: 1000 });

  await write(dom, { status: "ok", lastReceivedAt: 1000, lastSentAt: 5000 });

  assert.strictEqual(toastText(dom), "");
});

test("pasar a too-big muestra el aviso de cuota", async () => {
  const dom = await load({ status: "ok" });

  await write(dom, { enabled: false, status: "too-big" });

  assert.ok(toastText(dom).includes(TOO_BIG));
});
