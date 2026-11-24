// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { loadModules, plain } = require("./helpers/load-modules");

const FOO = "https://www.youtube.com/@Foo";
const FOO_KEY = "https://www.youtube.com/@foo";
const BAR = "https://www.youtube.com/@Bar";
const BAR_KEY = "https://www.youtube.com/@bar";

test("normalizeHiddenChannels conserva lo válido y descarta lo demás", () => {
  const { YouTubeGroupsHiddenChannels: H } = loadModules();
  const counter = { dropped: 0 };
  const long = "x".repeat(150);
  const result = H.normalizeHiddenChannels(
    {
      [FOO_KEY]: { name: "  Foo  ", url: FOO, hiddenAt: 5 },
      [BAR_KEY]: { name: long, url: BAR, hiddenAt: "no" },
      "https://www.youtube.com/@otro": { name: "X", url: FOO, hiddenAt: 1 },
      "https://www.youtube.com/@Foo/videos": {
        name: "X",
        url: "https://www.youtube.com/@Foo/videos",
        hiddenAt: 1,
      },
      "https://example.com/@a": {
        name: "X",
        url: "https://example.com/@a",
        hiddenAt: 1,
      },
      roto: "texto",
    },
    counter,
  );

  assert.deepStrictEqual(plain(result), {
    [FOO_KEY]: { name: "Foo", url: FOO, hiddenAt: 5 },
    [BAR_KEY]: { name: "x".repeat(100), url: BAR, hiddenAt: 0 },
  });
  assert.strictEqual(counter.dropped, 4);
  assert.deepStrictEqual(plain(H.normalizeHiddenChannels(null)), {});
  assert.deepStrictEqual(plain(H.normalizeHiddenChannels([])), {});
});

test("hideChannel guarda la clave en minúsculas y no duplica", () => {
  const { YouTubeGroupsHiddenChannels: H } = loadModules();
  const empty = Object.freeze({});
  const first = H.hideChannel(empty, { name: "Foo", url: FOO }, 100);

  assert.strictEqual(first.changed, true);
  assert.strictEqual(first.key, FOO_KEY);
  assert.deepStrictEqual(plain(first.entry), {
    name: "Foo",
    url: FOO,
    hiddenAt: 100,
  });
  assert.deepStrictEqual(Object.keys(first.channels), [FOO_KEY]);
  assert.deepStrictEqual(Object.keys(empty), []);

  const again = H.hideChannel(
    first.channels,
    { name: "Foo", url: "https://www.youtube.com/@foo" },
    200,
  );
  assert.strictEqual(again.changed, false);
  assert.strictEqual(again.entry.hiddenAt, 100);

  assert.throws(
    () => H.hideChannel({}, { url: "https://example.com/x" }, 1),
    /URL de canal no válida/,
  );
});

test("isChannelHidden y getHiddenKeys", () => {
  const { YouTubeGroupsHiddenChannels: H } = loadModules();
  const keys = H.getHiddenKeys({ [FOO_KEY]: {} });

  assert.strictEqual(
    H.isChannelHidden(keys, "https://www.youtube.com/@FOO"),
    true,
  );
  assert.strictEqual(H.isChannelHidden(keys, BAR), false);
  assert.strictEqual(H.isChannelHidden(keys, ""), false);
  assert.strictEqual(H.isChannelHidden(keys, undefined), false);
});

test("unhideChannels y restoreHiddenChannels", () => {
  const { YouTubeGroupsHiddenChannels: H } = loadModules();
  const original = Object.freeze({
    [FOO_KEY]: { name: "Foo", url: FOO, hiddenAt: 1 },
    [BAR_KEY]: { name: "Bar", url: BAR, hiddenAt: 2 },
  });
  const { channels, removed } = H.unhideChannels(original, [
    BAR_KEY,
    "https://www.youtube.com/@nada",
  ]);

  assert.deepStrictEqual(Object.keys(channels), [FOO_KEY]);
  assert.deepStrictEqual(plain(removed), [
    { key: BAR_KEY, name: "Bar", url: BAR, hiddenAt: 2 },
  ]);
  assert.deepStrictEqual(Object.keys(original).length, 2);

  const restored = H.restoreHiddenChannels(channels, removed);
  assert.strictEqual(restored.changed, true);
  assert.deepStrictEqual(plain(restored.channels), plain(original));

  const twice = H.restoreHiddenChannels(restored.channels, removed);
  assert.strictEqual(twice.changed, false);
  assert.deepStrictEqual(Object.keys(twice.channels).length, 2);
});

test("listHiddenChannels ordena del más reciente al más antiguo", () => {
  const { YouTubeGroupsHiddenChannels: H } = loadModules();
  const channels = Object.freeze({
    [FOO_KEY]: { name: "Foo", url: FOO, hiddenAt: 1 },
    [BAR_KEY]: { name: "Bar", url: BAR, hiddenAt: 2 },
  });

  assert.deepStrictEqual(
    plain(H.listHiddenChannels(channels)).map((item) => item.key),
    [BAR_KEY, FOO_KEY],
  );
});

const KEY = "youtubeHiddenChannels";

test("hideChannelAndSave escribe una vez y ocultar otra vez no escribe", async () => {
  const { YouTubeGroupsHiddenChannels: H, store, calls } = loadModules();

  const first = await H.hideChannelAndSave({ name: "Foo", url: FOO });
  assert.strictEqual(first.changed, true);
  assert.strictEqual(first.key, FOO_KEY);
  assert.strictEqual(calls.set, 1);
  assert.deepStrictEqual(plain(Object.keys(store[KEY].channels)), [FOO_KEY]);
  assert.strictEqual(store[KEY].version, 1);
  assert.strictEqual(store[KEY].channels[FOO_KEY].name, "Foo");
  assert.strictEqual(
    store[KEY].channels[FOO_KEY].hiddenAt,
    first.entry.hiddenAt,
  );

  const again = await H.hideChannelAndSave({ name: "Foo", url: FOO_KEY });
  assert.strictEqual(again.changed, false);
  assert.strictEqual(calls.set, 1);
});

test("unhideChannelsAndSave y restoreHiddenChannelsAndSave son reversibles", async () => {
  const initial = {
    [KEY]: {
      version: 1,
      channels: {
        [FOO_KEY]: { name: "Foo", url: FOO, hiddenAt: 1 },
        [BAR_KEY]: { name: "Bar", url: BAR, hiddenAt: 2 },
      },
    },
  };
  const { YouTubeGroupsHiddenChannels: H, store, calls } = loadModules(initial);

  const { removed } = await H.unhideChannelsAndSave([BAR_KEY]);
  assert.strictEqual(calls.set, 1);
  assert.deepStrictEqual(plain(removed), [
    { key: BAR_KEY, name: "Bar", url: BAR, hiddenAt: 2 },
  ]);
  assert.deepStrictEqual(Object.keys(store[KEY].channels), [FOO_KEY]);

  const missing = await H.unhideChannelsAndSave(["https://www.youtube.com/@x"]);
  assert.deepStrictEqual(plain(missing.removed), []);
  assert.strictEqual(calls.set, 1);

  const restored = await H.restoreHiddenChannelsAndSave(removed);
  assert.strictEqual(restored.changed, true);
  assert.strictEqual(calls.set, 2);
  assert.deepStrictEqual(plain(store[KEY]), plain(initial[KEY]));

  const twice = await H.restoreHiddenChannelsAndSave(removed);
  assert.strictEqual(twice.changed, false);
  assert.strictEqual(calls.set, 2);
});

test("ocultar dos canales a la vez no pisa ninguno", async () => {
  const { YouTubeGroupsHiddenChannels: H, store } = loadModules(
    {},
    { latencyMs: 5 },
  );

  await Promise.all([
    H.hideChannelAndSave({ name: "Foo", url: FOO }),
    H.hideChannelAndSave({ name: "Bar", url: BAR }),
  ]);

  assert.deepStrictEqual(Object.keys(store[KEY].channels).sort(), [
    BAR_KEY,
    FOO_KEY,
  ]);
});

test("una entrada no válida ya guardada se descarta al escribir", async () => {
  const { YouTubeGroupsHiddenChannels: H, store } = loadModules({
    [KEY]: {
      version: 1,
      channels: { roto: "texto" },
    },
  });

  await H.hideChannelAndSave({ name: "Foo", url: FOO });

  assert.deepStrictEqual(Object.keys(store[KEY].channels), [FOO_KEY]);
});
