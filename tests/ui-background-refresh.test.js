// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { loadDom, manifestScripts } = require("./helpers/load-dom");

const KEY = "youtubeBackgroundRefresh";
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sleep = async () => {};

/** Respuesta 403: la ejecución termina pronto con `error/http`. */
function makeFetch() {
  const calls = [];
  const fetch = async (url) => {
    calls.push(url);
    return { ok: false, status: 403, text: async () => "" };
  };

  return { fetch, calls };
}

/**
 * Carga la página sin `content.js` y crea el planificador con las piezas reales.
 * @param {Object} [options] - store, settings, y opciones de `create`.
 * @returns {Object} dom, ctx, refresh y setVisibility.
 */
function setup({ store = {}, settings = {}, ...createOptions } = {}) {
  const scripts = manifestScripts().filter((file) => file !== "content.js");
  const dom = loadDom({ scripts, store });
  const defaults = dom.global("YouTubeGroupsSettings").DEFAULT_SETTINGS;
  const ctx = {
    state: {
      settings: { ...defaults, ...settings },
      settingsLoaded: true,
    },
  };
  let visibility = "visible";

  Object.defineProperty(dom.document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });

  const refresh = dom
    .global("YouTubeGroupsBackgroundRefreshUi")
    .create(ctx, { sleep, ...createOptions });

  return {
    dom,
    ctx,
    refresh,
    setVisibility(value) {
      visibility = value;
      dom.document.dispatchEvent(new dom.window.Event("visibilitychange"));
    },
  };
}

test("la carga no hace ninguna petición antes del retraso", async () => {
  const { fetch, calls } = makeFetch();
  const { refresh } = setup({
    fetch,
    startDelayMs: 500,
    checkIntervalMs: 500,
    random: () => 0,
  });

  try {
    refresh.start();
    await wait(60);
    assert.strictEqual(calls.length, 0);
  } finally {
    refresh.stop();
  }
});

test("visible y activo: ejecuta una vez tras el retraso y no repite antes de INTERVAL_MS", async () => {
  const { fetch, calls } = makeFetch();
  const { dom, refresh } = setup({
    fetch,
    startDelayMs: 10,
    checkIntervalMs: 15,
    random: () => 0,
  });

  try {
    refresh.start();
    await wait(200);
    assert.strictEqual(calls.length, 1);
    assert.match(calls[0], /^https:\/\/www\.youtube\.com\//);
    const saved = dom.store[KEY];
    assert.strictEqual(saved.lastResult, "error");
    assert.strictEqual(saved.lastError, "http");
    assert.strictEqual(saved.lease, null);
  } finally {
    refresh.stop();
  }
});

test("oculta no ejecuta; al pasar a visible, sí", async () => {
  const { fetch, calls } = makeFetch();
  const { setVisibility, refresh } = setup({
    fetch,
    startDelayMs: 10,
    checkIntervalMs: 100000,
    random: () => 0,
  });

  try {
    setVisibility("hidden");
    refresh.start();
    await wait(80);
    assert.strictEqual(calls.length, 0);

    setVisibility("visible");
    await wait(80);
    assert.strictEqual(calls.length, 1);
  } finally {
    refresh.stop();
  }
});

test("con el ajuste a false no pide nada ni escribe", async () => {
  const { fetch, calls } = makeFetch();
  const { dom, refresh } = setup({
    fetch,
    settings: { backgroundRefresh: false },
  });

  await refresh.check();
  assert.strictEqual(calls.length, 0);
  assert.ok(!(KEY in dom.store));
});

test("sin ajustes leídos no hace nada", async () => {
  const { fetch, calls } = makeFetch();
  const { ctx, refresh } = setup({ fetch });

  ctx.state.settingsLoaded = false;
  await refresh.check();
  assert.strictEqual(calls.length, 0);
});

test("sin fetch disponible anota error/unsupported sin pedir nada", async () => {
  const { dom, refresh } = setup({ fetch: null });

  await refresh.check();
  const saved = dom.store[KEY];
  assert.strictEqual(saved.lastResult, "error");
  assert.strictEqual(saved.lastError, "unsupported");
  assert.strictEqual(saved.lease, null);

  const attempt = saved.lastAttemptAt;
  await refresh.check();
  assert.strictEqual(dom.store[KEY].lastAttemptAt, attempt);
});

test("con un lease vigente de otra pestaña no ejecuta", async () => {
  const { fetch, calls } = makeFetch();
  const lease = { owner: "otra", until: Date.now() + 60 * 1000 };
  const { dom, refresh } = setup({
    fetch,
    store: { [KEY]: { version: 1, lease } },
  });

  await refresh.check();
  assert.strictEqual(calls.length, 0);
  assert.deepStrictEqual(dom.store[KEY].lease, lease);
});

test("check({ force: true }) ejecuta aunque el último intento sea reciente", async () => {
  const { fetch, calls } = makeFetch();
  const { dom, refresh } = setup({
    fetch,
    store: {
      [KEY]: {
        version: 1,
        lastResult: "ok",
        lastAttemptAt: Date.now() - 1000,
        lastSuccessAt: Date.now() - 1000,
      },
    },
  });

  await refresh.check();
  assert.strictEqual(calls.length, 0);

  await refresh.check({ force: true });
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(dom.store[KEY].lastResult, "error");
  assert.strictEqual(dom.store[KEY].lease, null);
});

test("check({ force: true }) respeta el lease vigente y el ajuste desactivado", async () => {
  const { fetch, calls } = makeFetch();
  const lease = { owner: "otra", until: Date.now() + 60 * 1000 };
  const leased = setup({ fetch, store: { [KEY]: { version: 1, lease } } });

  await leased.refresh.check({ force: true });
  assert.strictEqual(calls.length, 0);

  const off = setup({ fetch, settings: { backgroundRefresh: false } });

  await off.refresh.check({ force: true });
  assert.strictEqual(calls.length, 0);
});

test("si la ejecución falla, finishRun libera el cerrojo", async () => {
  const { fetch, calls } = makeFetch();
  const { dom, refresh } = setup({
    fetch,
    getCookie() {
      throw new Error("sin cookies");
    },
  });

  await refresh.check();

  assert.strictEqual(calls.length, 0);
  const saved = dom.store[KEY];
  assert.strictEqual(saved.lease, null);
  assert.strictEqual(saved.lastResult, "error");
});

test("por defecto usa content.fetch del script de contenido", async () => {
  const { fetch, calls } = makeFetch();
  const { dom, refresh } = setup();

  dom.window.content = { fetch };
  const created = dom.global("YouTubeGroupsBackgroundRefreshUi").create(
    {
      state: { settings: { backgroundRefresh: true }, settingsLoaded: true },
    },
    { sleep },
  );

  assert.ok(refresh);
  await created.check();
  assert.strictEqual(calls.length, 1);
});

test("sin content.fetch usa window.wrappedJSObject.fetch con init clonado", async () => {
  const seen = [];
  const { dom } = setup();
  const page = {
    async fetch(url, init) {
      seen.push({ self: this, url, init });
      return { ok: true, status: 200, text: () => Promise.resolve("<html>") };
    },
  };

  dom.window.wrappedJSObject = page;
  dom.window.cloneInto = (value) => ({ cloned: value });

  const created = dom.global("YouTubeGroupsBackgroundRefreshUi").create(
    {
      state: { settings: { backgroundRefresh: true }, settingsLoaded: true },
    },
    { sleep },
  );

  await created.check();

  assert.strictEqual(seen.length, 1);
  assert.strictEqual(seen[0].self, page);
  assert.strictEqual(seen[0].url, "https://www.youtube.com/feed/channels");
  assert.ok(seen[0].init.cloned);
  assert.strictEqual(dom.store[KEY].lastError, "unrecognized");
});

test("sin content.fetch ni wrappedJSObject anota error/unsupported", async () => {
  const { dom } = setup();
  const created = dom.global("YouTubeGroupsBackgroundRefreshUi").create(
    {
      state: { settings: { backgroundRefresh: true }, settingsLoaded: true },
    },
    { sleep },
  );

  await created.check();
  assert.strictEqual(dom.store[KEY].lastError, "unsupported");
});
