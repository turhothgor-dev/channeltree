// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { loadOptionsDom } = require("./helpers/load-dom");

const TYPE = "youtube-groups:sync";
const LIMIT = 97280;

/**
 * Respuesta de `status` con la sincronización desactivada.
 * @param {Object} [state] - Campos del estado que cambian.
 * @returns {Object} Respuesta de `inspect()`.
 */
function statusResponse(state = {}) {
  return {
    available: true,
    state: { version: 1, enabled: false, status: "off", ...state },
    localBytes: 1228,
    limitBytes: LIMIT,
    remote: { status: "empty" },
  };
}

/**
 * Carga la página de opciones con un respondedor de mensajes de sincronización.
 * @param {function(Object): *} responder - Respuesta por mensaje.
 * @param {Object} [store] - Contenido inicial del almacenamiento.
 * @returns {Promise<Object>} DOM cargado.
 */
async function load(responder, store = {}) {
  const dom = loadOptionsDom({ store, runtimeResponder: responder });
  await dom.flush();
  return dom;
}

/**
 * Marca o desmarca la casilla y espera a que termine.
 * @param {Object} dom - DOM cargado.
 * @param {boolean} checked - Valor nuevo.
 * @returns {Promise<void>}
 */
async function toggle(dom, checked) {
  const box = dom.document.getElementById("options-sync-enabled");
  box.checked = checked;
  box.dispatchEvent(new dom.window.Event("change"));
  await dom.flush();
}

const statusText = (dom) =>
  dom.document.querySelector("#sincronizacion .options__section-status")
    .textContent;
const noticeText = (dom) =>
  dom.document.querySelector(".options__notice")?.textContent || "";
const sent = (dom) => dom.messages.filter((m) => m.type === TYPE);
const buttons = (dom) =>
  [
    ...dom.document.querySelectorAll(
      "#sincronizacion .options__sync-choice button",
    ),
  ].map((button) => button.textContent);

test("desactivada: casilla sin marcar, estado y ocupación", async () => {
  const dom = await load(() => statusResponse());
  const box = dom.document.getElementById("options-sync-enabled");

  assert.strictEqual(
    dom.document.getElementById("options-sync-title").textContent,
    "Sincronización entre dispositivos",
  );
  assert.strictEqual(box.checked, false);
  assert.strictEqual(box.disabled, false);
  assert.match(statusText(dom), /^Desactivada\./);
  assert.match(statusText(dom), /Ocupan 1,2 KB de 95,0 KB\./);
  assert.deepStrictEqual(sent(dom), [{ type: TYPE, action: "status" }]);
});

test("activada: muestra las fechas de envío y recepción", async () => {
  const dom = await load(() =>
    statusResponse({
      enabled: true,
      status: "ok",
      lastSentAt: 1700000000000,
    }),
  );

  assert.strictEqual(
    dom.document.getElementById("options-sync-enabled").checked,
    true,
  );
  assert.match(statusText(dom), /^Activada\. Último envío: /);
  assert.doesNotMatch(statusText(dom), /Última recepción/);
});

test("marcar envía enable y avisa de que se ha activado", async () => {
  const dom = await load((message) =>
    message.action === "enable" ? { result: "enabled" } : statusResponse(),
  );
  await toggle(dom, true);

  assert.deepStrictEqual(sent(dom).at(-1), { type: TYPE, action: "enable" });
  assert.strictEqual(noticeText(dom), "Sincronización activada");
  assert.strictEqual(
    dom.document.getElementById("options-sync-enabled").checked,
    true,
  );
});

test("choose muestra los tres botones y Traer envía enable con pull", async () => {
  const dom = await load((message) =>
    message.action === "enable"
      ? message.direction
        ? { result: "enabled" }
        : { result: "choose", remoteUpdatedAt: 1700000000000 }
      : statusResponse(),
  );
  await toggle(dom, true);

  assert.strictEqual(
    dom.document.getElementById("options-sync-enabled").checked,
    false,
  );
  assert.deepStrictEqual(buttons(dom), [
    "Traer los sincronizados",
    "Enviar los de este dispositivo",
    "Cancelar",
  ]);
  assert.match(
    dom.document.querySelector(".options__sync-choice").textContent,
    /Ya hay datos sincronizados de otro dispositivo \(.+\)\. ¿Cuáles quieres conservar\?/,
  );

  dom.document
    .querySelectorAll("#sincronizacion .options__sync-choice button")[0]
    .click();
  await dom.flush();

  assert.deepStrictEqual(sent(dom).at(-1), {
    type: TYPE,
    action: "enable",
    direction: "pull",
  });
  assert.strictEqual(noticeText(dom), "Sincronización activada");
  assert.strictEqual(
    dom.document.getElementById("options-sync-enabled").checked,
    true,
  );
  assert.deepStrictEqual(buttons(dom), []);
});

test("Enviar los de este dispositivo envía enable con push", async () => {
  const dom = await load((message) =>
    message.action === "enable" && !message.direction
      ? { result: "choose", remoteUpdatedAt: 1 }
      : message.action === "enable"
        ? { result: "enabled" }
        : statusResponse(),
  );
  await toggle(dom, true);
  dom.document
    .querySelectorAll("#sincronizacion .options__sync-choice button")[1]
    .click();
  await dom.flush();

  assert.strictEqual(sent(dom).at(-1).direction, "push");
});

test("Cancelar cierra la elección sin enviar nada", async () => {
  const dom = await load((message) =>
    message.action === "enable"
      ? { result: "choose", remoteUpdatedAt: 1 }
      : statusResponse(),
  );
  await toggle(dom, true);
  const before = sent(dom).length;
  dom.document
    .querySelectorAll("#sincronizacion .options__sync-choice button")[2]
    .click();
  await dom.flush();

  assert.deepStrictEqual(buttons(dom), []);
  assert.strictEqual(sent(dom).length, before);
  assert.strictEqual(
    dom.document.getElementById("options-sync-enabled").checked,
    false,
  );
});

test("too-big muestra el tamaño y deja la casilla sin marcar", async () => {
  const dom = await load((message) =>
    message.action === "enable"
      ? { result: "too-big", bytes: 204800, limitBytes: LIMIT }
      : statusResponse(),
  );
  await toggle(dom, true);

  const text = dom.document.querySelector(
    "#sincronizacion .options__error",
  ).textContent;
  assert.match(text, /200,0 KB/);
  assert.match(text, /95,0 KB/);
  assert.strictEqual(
    dom.document.getElementById("options-sync-enabled").checked,
    false,
  );
  assert.strictEqual(noticeText(dom), "");
});

test("desmarcar envía disable y avisa", async () => {
  const dom = await load((message) =>
    message.action === "disable"
      ? { result: "disabled" }
      : statusResponse({ enabled: true, status: "ok" }),
  );
  await toggle(dom, false);

  assert.deepStrictEqual(sent(dom).at(-1), { type: TYPE, action: "disable" });
  assert.strictEqual(noticeText(dom), "Sincronización desactivada");
  assert.match(statusText(dom), /^Desactivada\./);
});

test("una recepción nueva en el almacenamiento avisa", async () => {
  const dom = await load(() =>
    statusResponse({ enabled: true, status: "ok", lastReceivedAt: 1000 }),
  );
  assert.strictEqual(noticeText(dom), "");

  await dom.browser.storage.local.set({
    youtubeSync: {
      version: 1,
      enabled: true,
      status: "ok",
      lastReceivedAt: 2000,
    },
  });
  await dom.flush();
  assert.strictEqual(
    noticeText(dom),
    "Grupos y ajustes actualizados desde otro dispositivo",
  );

  // El mismo lastReceivedAt no vuelve a avisar.
  dom.document.querySelector(".options__notice").replaceChildren();
  await dom.browser.storage.local.set({
    youtubeSync: {
      version: 1,
      enabled: true,
      status: "ok",
      lastReceivedAt: 2000,
      lastSentAt: 3000,
    },
  });
  await dom.flush();
  assert.strictEqual(noticeText(dom), "");
});

test("sin respuesta no está disponible y la casilla queda deshabilitada", async () => {
  const dom = await load(() => undefined);

  assert.match(
    statusText(dom),
    /La sincronización no está disponible en este navegador\./,
  );
  assert.strictEqual(
    dom.document.getElementById("options-sync-enabled").disabled,
    true,
  );
});

test("si enable falla pero queda activa con error, se pinta el estado real", async () => {
  let enabledAsked = false;
  const dom = await load((message) => {
    if (message.action === "enable") {
      enabledAsked = true;
      return { result: "error", message: "sin red" };
    }
    return enabledAsked
      ? statusResponse({ enabled: true, status: "error", error: "sin red" })
      : statusResponse();
  });
  await toggle(dom, true);

  assert.strictEqual(
    dom.document.getElementById("options-sync-enabled").checked,
    true,
  );
  assert.match(statusText(dom), /Error al sincronizar: sin red/);
  assert.match(
    dom.document.querySelector("#sincronizacion .options__error").textContent,
    /No se pudo activar la sincronización: sin red/,
  );
});

test("un error con etiquetas se muestra literal", async () => {
  const dom = await load(() =>
    statusResponse({ enabled: true, status: "error", error: "<b>fallo</b>" }),
  );

  assert.match(statusText(dom), /Error al sincronizar: <b>fallo<\/b>/);
  assert.strictEqual(dom.document.querySelector("#sincronizacion b"), null);
});
