// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { createSyncArea } = require("./helpers/sync-area");

const ROOT = path.resolve(__dirname, "..");
const SCRIPTS = JSON.parse(
  fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"),
).background.scripts.map((file) => ({
  file,
  code: fs.readFileSync(path.join(ROOT, file), "utf8"),
}));

/**
 * Carga los scripts de fondo del manifiesto, en orden, en un contexto aislado
 * con un `browser` simulado.
 * @param {{ activeTabs?: object[], sendMessage?: Function,
 *   localGet?: Function, commands?: object[] | Error,
 *   openShortcutSettings?: Function | false, query?: Function }} [options]
 *   `query` sustituye a `tabs.query`; `commands` es lo que
 *   resuelve `getAll()` (un `Error` lo rechaza); `openShortcutSettings` es la
 *   implementación o `false` para no definir la función.
 * @returns {object} Escuchadores registrados, llamadas, errores de consola,
 *   almacenes simulados.
 */
function loadBackground(options = {}) {
  const calls = {
    openOptionsPage: 0,
    openShortcutSettings: 0,
    sendMessage: [],
    query: [],
  };
  const errors = [];
  const listeners = { message: [], command: [], storage: [] };
  const activeTabs = options.activeTabs ?? [{ id: 7 }];
  const store = structuredClone(options.store ?? {});
  const sync = createSyncArea();
  const browser = {
    storage: {
      local: {
        get:
          options.localGet ??
          (async (key) =>
            key in store ? { [key]: structuredClone(store[key]) } : {}),
        set: async (items) => {
          Object.assign(store, structuredClone(items));
        },
        remove: async (key) => {
          if (options.removeFails) {
            throw new Error("fallo al borrar");
          }
          for (const name of [].concat(key)) {
            delete store[name];
          }
        },
      },
      sync: sync.area,
      onChanged: { addListener: (fn) => listeners.storage.push(fn) },
    },
    runtime: {
      onMessage: { addListener: (fn) => listeners.message.push(fn) },
      openOptionsPage: () => {
        calls.openOptionsPage += 1;
        return Promise.resolve();
      },
    },
    commands: {
      onCommand: { addListener: (fn) => listeners.command.push(fn) },
      getAll: () => {
        if (options.commands instanceof Error) {
          return Promise.reject(options.commands);
        }
        return Promise.resolve(options.commands ?? []);
      },
    },
    tabs: {
      query: (info) => {
        calls.query.push(info);
        if (options.query) {
          return options.query(info);
        }
        return Promise.resolve(activeTabs);
      },
      sendMessage:
        options.sendMessage ??
        ((id, message) => {
          calls.sendMessage.push([id, message]);
          return Promise.resolve();
        }),
    },
  };
  if (options.openShortcutSettings !== false) {
    browser.commands.openShortcutSettings = () => {
      calls.openShortcutSettings += 1;
      return (options.openShortcutSettings ?? (() => Promise.resolve()))();
    };
  }
  const context = vm.createContext({
    browser,
    URL,
    crypto: globalThis.crypto,
    structuredClone,
    setTimeout,
    clearTimeout,
    window: { location: { origin: "https://www.youtube.com" } },
    console: { error: (...args) => errors.push(args) },
  });
  for (const { file, code } of SCRIPTS) {
    vm.runInContext(code, context, { filename: file });
  }
  return { listeners, calls, errors, store, sync };
}

/** Cede el turno a las promesas pendientes. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("el comando open-editor abre la página de opciones una vez", async () => {
  const { listeners, calls } = loadBackground();
  listeners.command[0]("open-editor");
  await flush();
  assert.strictEqual(calls.openOptionsPage, 1);
});

test("el mensaje youtube-groups:open-editor sigue abriendo las opciones", async () => {
  const { listeners, calls } = loadBackground();
  await listeners.message[0]({ type: "youtube-groups:open-editor" });
  assert.strictEqual(calls.openOptionsPage, 1);
});

test("clear-selection envía el mensaje a la pestaña activa", async () => {
  const { listeners, calls } = loadBackground();
  listeners.command[0]("clear-selection");
  await flush();
  // Los objetos nacen en el contexto de vm: se comparan serializados.
  assert.strictEqual(
    JSON.stringify(calls.query),
    JSON.stringify([{ active: true, currentWindow: true }]),
  );
  assert.strictEqual(
    JSON.stringify(calls.sendMessage),
    JSON.stringify([[7, { type: "youtube-groups:clear-selection" }]]),
  );
});

test("clear-selection ignora el rechazo si no hay receptor", async () => {
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  try {
    const { listeners, errors } = loadBackground({
      sendMessage: () =>
        Promise.reject(new Error("Could not establish connection")),
    });
    listeners.command[0]("clear-selection");
    await flush();
    await flush();
    assert.deepStrictEqual(unhandled, []);
    assert.deepStrictEqual(errors, []);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

test("clear-selection ignora el fallo al consultar la pestaña activa", async () => {
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  try {
    const { listeners, calls, errors } = loadBackground({
      query: () => Promise.reject(new Error("fallo al consultar")),
    });
    listeners.command[0]("clear-selection");
    await flush();
    await flush();
    assert.deepStrictEqual(unhandled, []);
    assert.deepStrictEqual(errors, []);
    assert.deepStrictEqual(calls.sendMessage, []);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

test("clear-selection sin pestaña activa no envía nada", async () => {
  const { listeners, calls } = loadBackground({ activeTabs: [] });
  listeners.command[0]("clear-selection");
  await flush();
  assert.deepStrictEqual(calls.sendMessage, []);
});

test("clear-selection con pestaña sin id numérico no envía nada", async () => {
  const { listeners, calls } = loadBackground({ activeTabs: [{}] });
  listeners.command[0]("clear-selection");
  await flush();
  assert.deepStrictEqual(calls.sendMessage, []);
});

test("se registra un escuchador de storage.onChanged", () => {
  const { listeners } = loadBackground();
  assert.strictEqual(listeners.storage.length, 1);
});

test("el mensaje de sincronización enable activa y deja la réplica", async () => {
  const { listeners, sync, store } = loadBackground();
  // Con el árbol vacío no se envía nada al activar (ADR 0028): se parte de un grupo.
  store.youtubeGroups = {
    version: 1,
    groups: [
      {
        id: "g1",
        name: "Grupo",
        type: "group",
        channels: [],
        subgroups: [],
        icon: "",
        color: "",
      },
    ],
  };
  const response = await listeners.message[0]({
    type: "youtube-groups:sync",
    action: "enable",
  });
  assert.strictEqual(response.result, "enabled");
  assert.ok("ygSync:meta" in sync.data);
});

test("el mensaje de sincronización status indica que está disponible", async () => {
  const { listeners } = loadBackground();
  const response = await listeners.message[0]({
    type: "youtube-groups:sync",
    action: "status",
  });
  assert.strictEqual(response.available, true);
});

test("un error en reconcile no lanza ni deja rechazos sin capturar", async () => {
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  try {
    const { errors } = loadBackground({
      localGet: () => Promise.reject(new Error("fallo de lectura")),
    });
    await flush();
    await flush();
    assert.deepStrictEqual(unhandled, []);
    assert.strictEqual(errors.length, 1);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

test("get-shortcuts devuelve los comandos y si se puede abrir la configuración", async () => {
  const { listeners } = loadBackground({
    commands: [
      { name: "open-editor", description: "Abrir", shortcut: "Alt+Shift+G" },
      { name: "clear-selection", description: "Limpiar" },
    ],
  });
  const response = await listeners.message[0]({
    type: "youtube-groups:get-shortcuts",
  });
  assert.strictEqual(
    JSON.stringify(response),
    JSON.stringify({
      commands: [
        { name: "open-editor", description: "Abrir", shortcut: "Alt+Shift+G" },
        { name: "clear-selection", description: "Limpiar", shortcut: "" },
      ],
      canOpenSettings: true,
    }),
  );
});

test("get-shortcuts sin openShortcutSettings indica canOpenSettings false", async () => {
  const { listeners } = loadBackground({
    commands: [],
    openShortcutSettings: false,
  });
  const response = await listeners.message[0]({
    type: "youtube-groups:get-shortcuts",
  });
  assert.strictEqual(response.canOpenSettings, false);
});

test("get-shortcuts rechaza si getAll rechaza", async () => {
  const { listeners } = loadBackground({ commands: new Error("fallo") });
  await assert.rejects(
    listeners.message[0]({ type: "youtube-groups:get-shortcuts" }),
    /fallo/,
  );
});

test("open-shortcut-settings llama una vez y devuelve opened true", async () => {
  const { listeners, calls } = loadBackground();
  const response = await listeners.message[0]({
    type: "youtube-groups:open-shortcut-settings",
  });
  assert.strictEqual(response.opened, true);
  assert.strictEqual(calls.openShortcutSettings, 1);
});

test("open-shortcut-settings sin la función devuelve opened false", async () => {
  const { listeners, calls } = loadBackground({
    openShortcutSettings: false,
  });
  const response = await listeners.message[0]({
    type: "youtube-groups:open-shortcut-settings",
  });
  assert.strictEqual(response.opened, false);
  assert.strictEqual(calls.openShortcutSettings, 0);
});

test("open-shortcut-settings que rechaza devuelve opened false y registra el error", async () => {
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  try {
    const { listeners, errors } = loadBackground({
      openShortcutSettings: () => Promise.reject(new Error("sin gesto")),
    });
    const response = await listeners.message[0]({
      type: "youtube-groups:open-shortcut-settings",
    });
    await flush();
    assert.strictEqual(response.opened, false);
    assert.strictEqual(errors.length, 1);
    assert.deepStrictEqual(unhandled, []);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

test("al arrancar se borra una youtubeDebug que quede guardada", async () => {
  const { store } = loadBackground({
    store: { youtubeDebug: { version: 1, countAllNew: true } },
  });
  await flush();
  assert.ok(!("youtubeDebug" in store));
});

test("si falla el borrado de youtubeDebug no hay error ni rechazo", async () => {
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  try {
    const { errors, store } = loadBackground({
      store: { youtubeDebug: { version: 1, countAllNew: true } },
      removeFails: true,
    });
    await flush();
    await flush();
    assert.ok("youtubeDebug" in store);
    assert.deepStrictEqual(errors, []);
    assert.deepStrictEqual(unhandled, []);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

test("un comando desconocido no hace nada", async () => {
  const { listeners, calls } = loadBackground();
  listeners.command[0]("otro");
  await flush();
  assert.strictEqual(calls.openOptionsPage, 0);
  assert.deepStrictEqual(calls.query, []);
  assert.deepStrictEqual(calls.sendMessage, []);
});
