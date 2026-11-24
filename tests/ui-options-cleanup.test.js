// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { loadOptionsDom } = require("./helpers/load-dom");
const {
  CHANNEL_URL,
  makeGroup,
  groupsStore,
} = require("./helpers/youtube-fixtures");

const NOTICE = ".options__notice";

/**
 * Almacén con un canal repetido en el grupo "A".
 * @param {string} [name] - Nombre del canal.
 * @returns {Object} Almacén.
 */
function duplicatesStore(name = "Canal") {
  return groupsStore([
    makeGroup("A", {
      channels: [
        { name, url: CHANNEL_URL },
        { name, url: CHANNEL_URL },
      ],
    }),
  ]);
}

/**
 * Carga la página con un canal repetido y un `confirm` que lanza.
 * @param {Object} [store] - Almacén inicial.
 * @returns {Promise<Object>} DOM cargado.
 */
async function loadWithDuplicates(store = duplicatesStore()) {
  const dom = loadOptionsDom({
    store,
    confirm: () => {
      throw new Error("confirm no debe llamarse");
    },
  });
  await dom.flush();
  return dom;
}

/**
 * Texto del informe de limpieza.
 * @param {Object} dom - DOM cargado.
 * @returns {string} Texto.
 */
function report(dom) {
  return dom.document.querySelector("#limpieza .options__cleanup-report")
    .textContent;
}

/**
 * Pulsa "Analizar" y espera.
 * @param {Object} dom - DOM cargado.
 * @returns {Promise<void>}
 */
async function analyze(dom) {
  dom.document.querySelector(".options__cleanup-analyze").click();
  await dom.flush();
}

/**
 * Analiza y pulsa "Limpiar".
 * @param {Object} dom - DOM cargado.
 * @returns {Promise<void>}
 */
async function clean(dom) {
  await analyze(dom);
  dom.document.querySelector(".options__cleanup-apply").click();
  for (let turn = 0; turn < 5; turn += 1) {
    await dom.flush();
  }
}

test("Analizar con un canal repetido muestra Canales repetidos: 1", async () => {
  const dom = await loadWithDuplicates();

  assert.strictEqual(
    dom.document.querySelector(".options__cleanup-result").hidden,
    true,
  );
  await analyze(dom);

  assert.strictEqual(
    dom.document.querySelector(".options__cleanup-result").hidden,
    false,
  );
  assert.match(report(dom), /Canales repetidos: 1/);
  assert.strictEqual(
    dom.document.getElementById("options-cleanup-title").textContent,
    "Limpieza",
  );
});

test("Limpiar no pide confirmación, deja un canal y Deshacer lo devuelve", async () => {
  const dom = await loadWithDuplicates();
  await clean(dom);

  assert.strictEqual(dom.store.youtubeGroups.groups[0].channels.length, 1);
  assert.match(report(dom), /Canales repetidos: 0/);
  const notice = dom.document.querySelector(NOTICE);
  assert.match(notice.textContent, /Limpieza hecha: 1 elementos/);
  const undo = notice.querySelector("button");
  assert.strictEqual(dom.document.activeElement, undo);

  undo.click();
  for (let turn = 0; turn < 5; turn += 1) {
    await dom.flush();
  }

  assert.strictEqual(dom.store.youtubeGroups.groups[0].channels.length, 2);
  assert.match(report(dom), /Canales repetidos: 1/);
});

test("Deshacer la limpieza no pisa un cambio posterior de los grupos", async () => {
  const dom = await loadWithDuplicates();
  await clean(dom);

  dom.store.youtubeGroups = { version: 1, groups: [makeGroup("B")] };
  dom.document.querySelector(`${NOTICE} button`).click();
  for (let turn = 0; turn < 5; turn += 1) {
    await dom.flush();
  }

  assert.match(
    dom.document.querySelector(NOTICE).textContent,
    /No se puede deshacer: los grupos han cambiado desde entonces/,
  );
  assert.strictEqual(dom.store.youtubeGroups.groups[0].name, "B");
});

test("un nombre de canal con HTML aparece literal en el informe", async () => {
  const dom = await loadWithDuplicates(duplicatesStore("<b>Negrita</b>"));
  await analyze(dom);

  assert.match(report(dom), /<b>Negrita<\/b>/);
  assert.strictEqual(
    dom.document.querySelector("#limpieza .options__cleanup-report b"),
    null,
  );
});
