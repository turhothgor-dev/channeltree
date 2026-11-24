// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { loadOptionsDom } = require("./helpers/load-dom");
const { makeGroup, groupsStore } = require("./helpers/youtube-fixtures");

const CHANNEL = "https://www.youtube.com/@canal";

/**
 * Genera el texto de una copia con un grupo "Importado" y un canal.
 * @param {function(Object): void} [mutate] - Cambia la copia antes de serializar.
 * @returns {Promise<string>} Texto JSON de la copia.
 */
async function backupText(mutate) {
  const source = loadOptionsDom({
    store: groupsStore([
      makeGroup("imp", {
        name: "Importado",
        channels: [{ name: "Canal", url: CHANNEL }],
      }),
    ]),
  });
  await source.flush();
  const backup = JSON.parse(
    await source.global("YouTubeGroupsBackup").exportBackup(),
  );
  if (mutate) {
    mutate(backup);
  }
  return JSON.stringify(backup);
}

/**
 * Carga la página con un grupo previo y simula elegir un fichero.
 * @param {string} text - Contenido del fichero.
 * @param {Object} [options] - Opciones de loadOptionsDom.
 * @returns {Promise<Object>} DOM cargado.
 */
async function importText(text, options = {}) {
  const dom = loadOptionsDom({
    store: groupsStore([makeGroup("viejo", { name: "Viejo" })]),
    ...options,
  });
  await dom.flush();
  const input = dom.document.querySelector("#copia input[type=file]");
  Object.defineProperty(input, "files", {
    value: [{ text: async () => text }],
  });
  input.dispatchEvent(new dom.window.Event("change"));
  // Varias vueltas: importar guarda en cadena y cada guardado dispara onChanged.
  for (let turn = 0; turn < 5; turn += 1) {
    await dom.flush();
  }
  return dom;
}

/**
 * Texto de estado de la sección.
 * @param {Object} dom - DOM cargado.
 * @returns {string} Mensaje.
 */
function status(dom) {
  return dom.document.querySelector("#copia .options__section-status")
    .textContent;
}

test("Exportar copia descarga channeltree-AAAA-MM-DD.json", async () => {
  const dom = loadOptionsDom({
    store: groupsStore([makeGroup("a", { name: "A" })]),
  });
  await dom.flush();
  const revoked = [];
  dom.window.URL.createObjectURL = () => "blob:prueba";
  dom.window.URL.revokeObjectURL = (url) => revoked.push(url);
  const clicked = [];
  dom.window.HTMLAnchorElement.prototype.click = function click() {
    clicked.push({ href: this.href, download: this.download });
  };

  const button = [...dom.document.querySelectorAll("#copia button")].find(
    (b) => b.textContent === "Exportar copia",
  );
  button.click();
  await dom.flush();

  assert.strictEqual(clicked.length, 1);
  assert.match(clicked[0].download, /^channeltree-\d{4}-\d{2}-\d{2}\.json$/);
  assert.strictEqual(dom.document.querySelector("#copia a"), null);
});

test("Importar copia escribe los grupos y repinta el árbol", async () => {
  const dom = await importText(await backupText());

  assert.strictEqual(status(dom), "Copia importada.");
  assert.strictEqual(
    dom.store.youtubeGroups.groups.some((g) => g.name === "Importado"),
    true,
  );
  const names = [...dom.document.querySelectorAll('[role="treeitem"]')].map(
    (row) => row.querySelector(".options__name").textContent,
  );
  assert.deepStrictEqual(names, ["Importado"]);
});

test("Importar copia con vídeos nuevos y actividad los escribe", async () => {
  const text = await backupText((backup) => {
    backup.newVideos = {
      since: 1690000000000,
      videos: {
        abcdefghijk: {
          channel: CHANNEL,
          seenAt: 1700000000000,
          publishedBefore: null,
        },
      },
      visits: { imp: 1700000000000 },
    };
    backup.channelActivity = {
      lastFeedAt: 1700000000000,
      channels: {
        [CHANNEL]: { trackedSince: 1690000000000, lastPublished: null },
      },
    };
  });
  const dom = await importText(text);

  assert.strictEqual(status(dom), "Copia importada.");
  assert.deepStrictEqual(Object.keys(dom.store.youtubeNewVideos.videos), [
    "abcdefghijk",
  ]);
  assert.deepStrictEqual(
    Object.keys(dom.store.youtubeChannelActivity.channels),
    [CHANNEL],
  );
});

test("El resumen de la sección dice qué incluye y qué no", async () => {
  const dom = loadOptionsDom({ store: groupsStore([]) });
  await dom.flush();
  const summary = dom.document.querySelector(
    "#copia .options__channels-summary",
  ).textContent;

  assert.match(summary, /suscripciones/);
  assert.match(summary, /vídeos nuevos/);
  assert.match(summary, /actividad/);
  assert.match(summary, /No incluye el estado de la sincronización/);
  assert.match(summary, /preferencias de vista/);
});

test("Importar copia pide confirmación con el texto nuevo", async () => {
  const messages = [];
  const dom = await importText(await backupText(), {
    confirm: (message) => {
      messages.push(message);
      return true;
    },
  });

  assert.strictEqual(status(dom), "Copia importada.");
  assert.deepStrictEqual(messages, [
    "Se reemplazarán los datos de este navegador por los de la copia. Lo que una copia antigua no incluya se conserva. La sincronización y las preferencias de vista no cambian. ¿Continuar?",
  ]);
});

test("Importar copia no escribe si se cancela la confirmación", async () => {
  const dom = await importText(await backupText(), { confirm: () => false });

  assert.strictEqual(status(dom), "");
  assert.deepStrictEqual(
    dom.store.youtubeGroups.groups.map((g) => g.name),
    ["Viejo"],
  );
});

test("Importar copia con JSON no válido muestra el error y no escribe", async () => {
  const dom = await importText("esto no es json");

  assert.notStrictEqual(status(dom), "");
  assert.notStrictEqual(status(dom), "Copia importada.");
  assert.deepStrictEqual(
    dom.store.youtubeGroups.groups.map((g) => g.name),
    ["Viejo"],
  );
});

test("Importar copia con una entrada no válida cuenta los descartes", async () => {
  const text = await backupText((backup) => {
    backup.groups[0].channels.push({ name: "Mala", url: "no-es-url" });
  });
  const dom = await importText(text);

  assert.strictEqual(status(dom), "Copia importada (1 entradas descartadas).");
});

test("exportar e importar van juntos en una fila con separación", async () => {
  const dom = loadOptionsDom();
  await dom.flush();
  const row = dom.document.querySelector("#copia .options__button-row");
  assert.ok(row, "existe la fila de botones");
  assert.deepStrictEqual(
    [...row.children].map((b) => b.textContent),
    ["Exportar copia", "Importar copia"],
  );
});
