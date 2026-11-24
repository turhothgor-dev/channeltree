// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { loadModules, plain } = require("./helpers/load-modules");

test("getGroups sin datos devuelve [] y escribe el formato versión 1", async () => {
  const { YouTubeGroupsStorage, store, calls } = loadModules();

  const groups = await YouTubeGroupsStorage.getGroups();

  assert.deepStrictEqual(plain(groups), []);
  assert.strictEqual(calls.set, 1);
  assert.deepStrictEqual(plain(store.youtubeGroups), {
    version: 1,
    groups: [],
  });
});

test("getWatchedVideos sin datos devuelve {} y no escribe", async () => {
  const { YouTubeGroupsStorage, calls } = loadModules();

  const videos = await YouTubeGroupsStorage.getWatchedVideos();

  assert.deepStrictEqual(plain(videos), {});
  assert.strictEqual(calls.set, 0);
});

test("getWatchedVideos con datos corruptos devuelve {}", async () => {
  for (const corrupt of [[], null]) {
    const { YouTubeGroupsStorage, store, calls } = loadModules();
    store.youtubeWatched = { version: 1, videos: corrupt };

    const videos = await YouTubeGroupsStorage.getWatchedVideos();

    assert.deepStrictEqual(plain(videos), {});
    assert.strictEqual(calls.set, 0);
  }
});

test("saveWatchedVideos y getWatchedVideos conservan el mapa con version 1", async () => {
  const { YouTubeGroupsStorage, store } = loadModules();
  const map = { dQw4w9WgXcQ: { watchedAt: 1794672642000 } };

  await YouTubeGroupsStorage.saveWatchedVideos(map);
  const videos = await YouTubeGroupsStorage.getWatchedVideos();

  assert.deepStrictEqual(plain(videos), map);
  assert.strictEqual(store.youtubeWatched.version, 1);
});

test("saveWatchedVideos con algo que no es un objeto plano lanza TypeError", async () => {
  const { YouTubeGroupsStorage } = loadModules();

  for (const invalid of [[], null, 5]) {
    await assert.rejects(
      () => YouTubeGroupsStorage.saveWatchedVideos(invalid),
      (error) => error.name === "TypeError",
    );
  }
});

test("guardar vistos no cambia youtubeGroups", async () => {
  const { YouTubeGroupsStorage, store } = loadModules();
  await YouTubeGroupsStorage.saveGroups([{ id: "a" }]);
  const before = JSON.stringify(store.youtubeGroups);

  await YouTubeGroupsStorage.saveWatchedVideos({
    dQw4w9WgXcQ: { watchedAt: 1 },
  });

  assert.strictEqual(JSON.stringify(store.youtubeGroups), before);
});

test("getSettings sin datos devuelve {} y no escribe", async () => {
  const { YouTubeGroupsStorage, calls } = loadModules();

  const settings = await YouTubeGroupsStorage.getSettings();

  assert.deepStrictEqual(plain(settings), {});
  assert.strictEqual(calls.set, 0);
});

test("getSettings con datos corruptos devuelve {}", async () => {
  for (const corrupt of [[], null, 3]) {
    const { YouTubeGroupsStorage, store, calls } = loadModules();
    store.youtubeSettings = { version: 1, settings: corrupt };

    const settings = await YouTubeGroupsStorage.getSettings();

    assert.deepStrictEqual(plain(settings), {});
    assert.strictEqual(calls.set, 0);
  }
});

test("saveSettings y getSettings conservan los ajustes con version 1", async () => {
  const { YouTubeGroupsStorage, store } = loadModules();
  const settings = { watchedMode: "hide", outsideMode: "dim" };

  await YouTubeGroupsStorage.saveSettings(settings);
  const loaded = await YouTubeGroupsStorage.getSettings();

  assert.deepStrictEqual(plain(loaded), settings);
  assert.strictEqual(store.youtubeSettings.version, 1);
});

test("saveSettings con algo que no es un objeto plano lanza TypeError", async () => {
  const { YouTubeGroupsStorage } = loadModules();

  for (const invalid of [[], null]) {
    await assert.rejects(
      () => YouTubeGroupsStorage.saveSettings(invalid),
      (error) => error.name === "TypeError",
    );
  }
});

test("guardar ajustes no cambia youtubeGroups ni youtubeWatched", async () => {
  const { YouTubeGroupsStorage, store } = loadModules();
  await YouTubeGroupsStorage.saveGroups([{ id: "a" }]);
  await YouTubeGroupsStorage.saveWatchedVideos({
    dQw4w9WgXcQ: { watchedAt: 1 },
  });
  const before = JSON.stringify([store.youtubeGroups, store.youtubeWatched]);

  await YouTubeGroupsStorage.saveSettings({ watchedMode: "hide" });

  assert.strictEqual(
    JSON.stringify([store.youtubeGroups, store.youtubeWatched]),
    before,
  );
});

test("getPlaylists sin datos devuelve [] y no escribe", async () => {
  const { YouTubeGroupsStorage, calls } = loadModules();

  const playlists = await YouTubeGroupsStorage.getPlaylists();

  assert.deepStrictEqual(plain(playlists), []);
  assert.strictEqual(calls.set, 0);
});

test("getPlaylists con datos corruptos devuelve []", async () => {
  for (const corrupt of [{}, null]) {
    const { YouTubeGroupsStorage, store, calls } = loadModules();
    store.youtubePlaylists = { version: 1, playlists: corrupt };

    const playlists = await YouTubeGroupsStorage.getPlaylists();

    assert.deepStrictEqual(plain(playlists), []);
    assert.strictEqual(calls.set, 0);
  }
});

test("savePlaylists y getPlaylists conservan las listas con version 1", async () => {
  const { YouTubeGroupsStorage, store } = loadModules();
  const playlists = [
    {
      id: "p1",
      name: "Para luego",
      videos: [
        {
          id: "dQw4w9WgXcQ",
          title: "T",
          channelName: "C",
          addedAt: 1794672642000,
        },
      ],
    },
  ];

  await YouTubeGroupsStorage.savePlaylists(playlists);
  const loaded = await YouTubeGroupsStorage.getPlaylists();

  assert.deepStrictEqual(plain(loaded), playlists);
  assert.strictEqual(store.youtubePlaylists.version, 1);
});

test("savePlaylists con algo que no es un array lanza TypeError", async () => {
  const { YouTubeGroupsStorage } = loadModules();

  for (const invalid of [{}, null]) {
    await assert.rejects(
      () => YouTubeGroupsStorage.savePlaylists(invalid),
      (error) => error.name === "TypeError",
    );
  }
});

test("guardar listas no cambia grupos, vistos ni ajustes", async () => {
  const { YouTubeGroupsStorage, store } = loadModules();
  await YouTubeGroupsStorage.saveGroups([{ id: "a" }]);
  await YouTubeGroupsStorage.saveWatchedVideos({
    dQw4w9WgXcQ: { watchedAt: 1 },
  });
  await YouTubeGroupsStorage.saveSettings({ watchedMode: "hide" });
  const before = JSON.stringify([
    store.youtubeGroups,
    store.youtubeWatched,
    store.youtubeSettings,
  ]);

  await YouTubeGroupsStorage.savePlaylists([
    { id: "p", name: "x", videos: [] },
  ]);

  assert.strictEqual(
    JSON.stringify([
      store.youtubeGroups,
      store.youtubeWatched,
      store.youtubeSettings,
    ]),
    before,
  );
});

test("KEYS tiene las catorce claves con sus nombres reales", () => {
  const { YouTubeGroupsStorage } = loadModules();

  assert.deepStrictEqual(plain(YouTubeGroupsStorage.KEYS), {
    groups: "youtubeGroups",
    watched: "youtubeWatched",
    settings: "youtubeSettings",
    playlists: "youtubePlaylists",
    avatars: "youtubeAvatars",
    subscriptions: "youtubeSubscriptions",
    newVideos: "youtubeNewVideos",
    hiddenChannels: "youtubeHiddenChannels",
    channelActivity: "youtubeChannelActivity",
    pendingUnsubscribes: "youtubePendingUnsubscribes",
    recentUnsubscribes: "youtubeRecentUnsubscribes",
    sync: "youtubeSync",
    backgroundRefresh: "youtubeBackgroundRefresh",
  });
  assert.ok(Object.isFrozen(YouTubeGroupsStorage.KEYS));
});

test("las bajas recientes se guardan, caducan a los 30 días y vacías borran la clave", async () => {
  const day = 24 * 60 * 60 * 1000;
  const env = loadModules({
    youtubeRecentUnsubscribes: {
      version: 1,
      keys: { a: 1000, viejo: 1000 - 31 * day, malo: "x" },
    },
  });
  const S = env.YouTubeGroupsStorage;

  assert.deepStrictEqual(
    plain(await S.getRecentUnsubscribes({ now: 1000 + day })),
    { a: 1000 },
  );
  assert.deepStrictEqual(
    plain(await S.getRecentUnsubscribes({ now: 1000 + 31 * day })),
    {},
  );
  assert.deepStrictEqual(plain(S.readRecentUnsubscribesValue("x")), {});

  await S.saveRecentUnsubscribes({ b: 5 });
  assert.deepStrictEqual(plain(env.store.youtubeRecentUnsubscribes), {
    version: 1,
    keys: { b: 5 },
  });
  await S.saveRecentUnsubscribes({});
  assert.ok(!("youtubeRecentUnsubscribes" in env.store));
});

test("readPendingUnsubscribesValue devuelve las bajas o el valor vacío", () => {
  const { YouTubeGroupsStorage: S } = loadModules();
  const empty = { keys: [], since: null };

  for (const invalid of [undefined, null, "x", [], 3]) {
    assert.deepStrictEqual(
      plain(S.readPendingUnsubscribesValue(invalid)),
      empty,
    );
  }
  assert.deepStrictEqual(
    plain(S.readPendingUnsubscribesValue({ keys: "x", since: "y" })),
    empty,
  );
  assert.deepStrictEqual(
    plain(S.readPendingUnsubscribesValue({ keys: ["a", 1, "b"], since: 5 })),
    { keys: ["a", "b"], since: 5 },
  );
});

test("savePendingUnsubscribes escribe version 1, borra con keys vacío y lanza sin array", async () => {
  const { YouTubeGroupsStorage: S, store, calls } = loadModules();

  assert.deepStrictEqual(plain(await S.getPendingUnsubscribes()), {
    keys: [],
    since: null,
  });
  assert.strictEqual(calls.set, 0);

  await S.savePendingUnsubscribes(["a", "b"], 7);
  assert.deepStrictEqual(plain(store.youtubePendingUnsubscribes), {
    version: 1,
    keys: ["a", "b"],
    since: 7,
  });
  assert.deepStrictEqual(plain(await S.getPendingUnsubscribes()), {
    keys: ["a", "b"],
    since: 7,
  });

  await S.savePendingUnsubscribes([], 7);
  assert.ok(!("youtubePendingUnsubscribes" in store));
  await assert.rejects(
    () => S.savePendingUnsubscribes("a", 1),
    (error) => error.name === "TypeError",
  );
});

test("withLock con la misma clave ejecuta en orden", async () => {
  const { YouTubeGroupsStorage } = loadModules();
  const events = [];
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });

  const first = YouTubeGroupsStorage.withLock("k", async () => {
    events.push("first:start");
    await gate;
    events.push("first:end");
  });
  const second = YouTubeGroupsStorage.withLock("k", async () => {
    events.push("second:start");
  });

  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepStrictEqual(events, ["first:start"]);

  release();
  await Promise.all([first, second]);

  assert.deepStrictEqual(events, ["first:start", "first:end", "second:start"]);
});

test("withLock con claves distintas no se esperan", async () => {
  const { YouTubeGroupsStorage } = loadModules();
  const gate = new Promise(() => {});

  YouTubeGroupsStorage.withLock("a", () => gate);
  const result = await YouTubeGroupsStorage.withLock("b", () => "listo");

  assert.strictEqual(result, "listo");
});

test("withLock devuelve el valor de fn, síncrono o asíncrono", async () => {
  const { YouTubeGroupsStorage } = loadModules();

  assert.strictEqual(await YouTubeGroupsStorage.withLock("k", () => 1), 1);
  assert.strictEqual(
    await YouTubeGroupsStorage.withLock("k", async () => 2),
    2,
  );
});

test("withLock rechaza con el error de fn y la cola sigue", async () => {
  const { YouTubeGroupsStorage } = loadModules();
  const rejected = new Error("async");
  const thrown = new Error("sync");

  const first = YouTubeGroupsStorage.withLock("k", async () => {
    throw rejected;
  });
  const second = YouTubeGroupsStorage.withLock("k", () => {
    throw thrown;
  });
  const third = YouTubeGroupsStorage.withLock("k", () => "ok");

  await assert.rejects(first, (error) => error === rejected);
  await assert.rejects(second, (error) => error === thrown);
  assert.strictEqual(await third, "ok");
  assert.strictEqual(
    await YouTubeGroupsStorage.withLock("k", () => "otra"),
    "otra",
  );
});

test("saveGroups con algo que no es un array lanza TypeError", async () => {
  const { YouTubeGroupsStorage } = loadModules();

  await assert.rejects(
    () => YouTubeGroupsStorage.saveGroups({}),
    (error) => error.name === "TypeError",
  );
});

test("readGroupsValue y readPlaylistsValue devuelven el array o []", () => {
  const { YouTubeGroupsStorage: S } = loadModules();
  const cases = [
    ["readGroupsValue", "groups"],
    ["readPlaylistsValue", "playlists"],
  ];

  for (const [reader, field] of cases) {
    assert.deepStrictEqual(plain(S[reader](undefined)), []);
    assert.deepStrictEqual(plain(S[reader](null)), []);
    assert.deepStrictEqual(
      plain(S[reader]({ version: 1, [field]: [{ id: "a" }] })),
      [{ id: "a" }],
    );
    assert.deepStrictEqual(plain(S[reader]({ version: 1, [field]: {} })), []);
    assert.deepStrictEqual(plain(S[reader]({ version: 1, [field]: "x" })), []);
  }
});

test("readWatchedValue y readSettingsValue devuelven el objeto o {}", () => {
  const { YouTubeGroupsStorage: S } = loadModules();
  const cases = [
    ["readWatchedValue", "videos"],
    ["readSettingsValue", "settings"],
  ];

  for (const [reader, field] of cases) {
    assert.deepStrictEqual(plain(S[reader](undefined)), {});
    assert.deepStrictEqual(plain(S[reader](null)), {});
    assert.deepStrictEqual(
      plain(S[reader]({ version: 1, [field]: { a: 1 } })),
      { a: 1 },
    );
    assert.deepStrictEqual(plain(S[reader]({ version: 1, [field]: [] })), {});
    assert.deepStrictEqual(plain(S[reader]({ version: 1, [field]: null })), {});
  }
});

test("getChangedKeys ignora áreas distintas de local", () => {
  const { YouTubeGroupsStorage: S } = loadModules();

  assert.deepStrictEqual(
    plain(S.getChangedKeys({ youtubeGroups: {} }, "sync")),
    [],
  );
});

test("getChangedKeys devuelve los nombres lógicos en el orden de KEYS", () => {
  const { YouTubeGroupsStorage: S } = loadModules();
  const changes = { youtubePlaylists: {}, youtubeGroups: {}, otraClave: {} };

  assert.deepStrictEqual(plain(S.getChangedKeys(changes, "local")), [
    "groups",
    "playlists",
  ]);
  assert.deepStrictEqual(
    plain(S.getChangedKeys({ otraClave: {} }, "local")),
    [],
  );
});

test("getChangedKeys con youtubeAvatars devuelve avatars y respeta el orden de KEYS", () => {
  const { YouTubeGroupsStorage: S } = loadModules();

  assert.deepStrictEqual(
    plain(S.getChangedKeys({ youtubeAvatars: {} }, "local")),
    ["avatars"],
  );
  assert.deepStrictEqual(
    plain(
      S.getChangedKeys(
        { youtubeAvatars: {}, youtubePlaylists: {}, youtubeGroups: {} },
        "local",
      ),
    ),
    ["groups", "playlists", "avatars"],
  );
});

test("readAvatarsValue devuelve el objeto o {}", () => {
  const { YouTubeGroupsStorage: S } = loadModules();

  assert.deepStrictEqual(plain(S.readAvatarsValue(undefined)), {});
  assert.deepStrictEqual(plain(S.readAvatarsValue([])), {});
  assert.deepStrictEqual(plain(S.readAvatarsValue({ avatars: [] })), {});
  assert.deepStrictEqual(
    plain(S.readAvatarsValue({ version: 1, avatars: { a: "b" } })),
    { a: "b" },
  );
});

test("getAvatars sin datos devuelve {} y no escribe", async () => {
  const { YouTubeGroupsStorage, calls } = loadModules();

  const avatars = await YouTubeGroupsStorage.getAvatars();

  assert.deepStrictEqual(plain(avatars), {});
  assert.strictEqual(calls.set, 0);
});

test("saveAvatars y getAvatars conservan el mapa con version 1", async () => {
  const { YouTubeGroupsStorage, store } = loadModules();
  const map = { "https://www.youtube.com/@foo": "https://yt3.ggpht.com/a" };

  await YouTubeGroupsStorage.saveAvatars(map);
  const loaded = await YouTubeGroupsStorage.getAvatars();

  assert.deepStrictEqual(plain(loaded), map);
  assert.deepStrictEqual(plain(store.youtubeAvatars), {
    version: 1,
    avatars: map,
  });
});

test("getChangedKeys con youtubeSubscriptions devuelve subscriptions", () => {
  const { YouTubeGroupsStorage: S } = loadModules();

  assert.deepStrictEqual(
    plain(S.getChangedKeys({ youtubeSubscriptions: {} }, "local")),
    ["subscriptions"],
  );
});

test("readSubscriptionsValue devuelve el mapa o {}", () => {
  const { YouTubeGroupsStorage: S } = loadModules();

  assert.deepStrictEqual(plain(S.readSubscriptionsValue(undefined)), {});
  assert.deepStrictEqual(plain(S.readSubscriptionsValue(null)), {});
  assert.deepStrictEqual(plain(S.readSubscriptionsValue([])), {});
  assert.deepStrictEqual(plain(S.readSubscriptionsValue({ channels: [] })), {});
  assert.deepStrictEqual(
    plain(S.readSubscriptionsValue({ channels: "x" })),
    {},
  );
  assert.deepStrictEqual(
    plain(
      S.readSubscriptionsValue({ version: 1, channels: { a: { name: "A" } } }),
    ),
    { a: { name: "A" } },
  );
});

test("getSubscriptions sin datos devuelve {} y no escribe", async () => {
  const { YouTubeGroupsStorage, calls } = loadModules();

  const subscriptions = await YouTubeGroupsStorage.getSubscriptions();

  assert.deepStrictEqual(plain(subscriptions), {});
  assert.strictEqual(calls.set, 0);
});

test("saveSubscriptions y getSubscriptions conservan el mapa con version 1", async () => {
  const { YouTubeGroupsStorage, store } = loadModules();
  const map = {
    "https://www.youtube.com/@foo": {
      name: "Foo",
      url: "https://www.youtube.com/@foo",
      firstSeen: 1,
    },
  };

  await YouTubeGroupsStorage.saveSubscriptions(map);
  const loaded = await YouTubeGroupsStorage.getSubscriptions();

  assert.deepStrictEqual(plain(loaded), map);
  assert.deepStrictEqual(plain(store.youtubeSubscriptions), {
    version: 1,
    channels: map,
  });
});

test("saveSubscriptions con algo que no es un objeto plano lanza TypeError", async () => {
  const { YouTubeGroupsStorage } = loadModules();

  for (const invalid of [[], null, 5]) {
    await assert.rejects(
      () => YouTubeGroupsStorage.saveSubscriptions(invalid),
      (error) => error.name === "TypeError",
    );
  }
});

test("getChangedKeys con youtubeNewVideos devuelve newVideos", () => {
  const { YouTubeGroupsStorage: S } = loadModules();

  assert.deepStrictEqual(
    plain(S.getChangedKeys({ youtubeNewVideos: {} }, "local")),
    ["newVideos"],
  );
});

test("readNewVideosValue devuelve el estado o uno vacío", () => {
  const { YouTubeGroupsStorage: S } = loadModules();
  const empty = { since: null, videos: {}, visits: {} };

  for (const invalid of [undefined, null, [], "x", 5]) {
    assert.deepStrictEqual(plain(S.readNewVideosValue(invalid)), empty);
  }
  assert.deepStrictEqual(
    plain(S.readNewVideosValue({ since: "x", videos: [], visits: "y" })),
    empty,
  );
  assert.deepStrictEqual(
    plain(
      S.readNewVideosValue({
        version: 1,
        since: 5,
        videos: { a: { seenAt: 1 } },
        visits: { g: 2 },
      }),
    ),
    { since: 5, videos: { a: { seenAt: 1 } }, visits: { g: 2 } },
  );
});

test("getNewVideos sin datos devuelve el estado vacío y no escribe", async () => {
  const { YouTubeGroupsStorage, calls } = loadModules();

  const state = await YouTubeGroupsStorage.getNewVideos();

  assert.deepStrictEqual(plain(state), {
    since: null,
    videos: {},
    visits: {},
  });
  assert.strictEqual(calls.set, 0);
});

test("saveNewVideos guarda con version 1 y getNewVideos lo recupera", async () => {
  const { YouTubeGroupsStorage, store } = loadModules();
  const state = { since: 7, videos: { a: { seenAt: 1 } }, visits: { g: 3 } };

  await YouTubeGroupsStorage.saveNewVideos(state);
  const loaded = await YouTubeGroupsStorage.getNewVideos();

  assert.deepStrictEqual(plain(loaded), state);
  assert.deepStrictEqual(plain(store.youtubeNewVideos), {
    version: 1,
    ...state,
  });
});

test("saveNewVideos con algo que no es un objeto plano lanza TypeError", async () => {
  const { YouTubeGroupsStorage } = loadModules();

  for (const invalid of [[], null, 5]) {
    await assert.rejects(
      () => YouTubeGroupsStorage.saveNewVideos(invalid),
      (error) => error.name === "TypeError",
    );
  }
});

test("getChangedKeys con youtubeHiddenChannels devuelve hiddenChannels", () => {
  const { YouTubeGroupsStorage: S } = loadModules();

  assert.deepStrictEqual(
    plain(S.getChangedKeys({ youtubeHiddenChannels: {} }, "local")),
    ["hiddenChannels"],
  );
});

test("readHiddenChannelsValue devuelve el mapa o {}", () => {
  const { YouTubeGroupsStorage: S } = loadModules();

  assert.deepStrictEqual(plain(S.readHiddenChannelsValue(undefined)), {});
  assert.deepStrictEqual(plain(S.readHiddenChannelsValue(null)), {});
  assert.deepStrictEqual(plain(S.readHiddenChannelsValue([])), {});
  assert.deepStrictEqual(
    plain(S.readHiddenChannelsValue({ channels: [] })),
    {},
  );
  assert.deepStrictEqual(
    plain(S.readHiddenChannelsValue({ channels: "x" })),
    {},
  );
  assert.deepStrictEqual(
    plain(S.readHiddenChannelsValue({ version: 1, channels: { a: { b: 1 } } })),
    { a: { b: 1 } },
  );
});

test("getHiddenChannels sin datos devuelve {} y no escribe", async () => {
  const { YouTubeGroupsStorage, calls } = loadModules();

  const channels = await YouTubeGroupsStorage.getHiddenChannels();

  assert.deepStrictEqual(plain(channels), {});
  assert.strictEqual(calls.set, 0);
});

test("saveHiddenChannels escribe version 1 y lanza con un array", async () => {
  const { YouTubeGroupsStorage, store } = loadModules();
  const map = {
    "https://www.youtube.com/@foo": {
      name: "Foo",
      url: "https://www.youtube.com/@foo",
      hiddenAt: 5,
    },
  };

  await YouTubeGroupsStorage.saveHiddenChannels(map);

  assert.deepStrictEqual(plain(store.youtubeHiddenChannels), {
    version: 1,
    channels: map,
  });
  assert.deepStrictEqual(
    plain(await YouTubeGroupsStorage.getHiddenChannels()),
    map,
  );
  await assert.rejects(
    () => YouTubeGroupsStorage.saveHiddenChannels([]),
    (error) => error.name === "TypeError",
  );
});

test("getChangedKeys con youtubeChannelActivity devuelve channelActivity", () => {
  const { YouTubeGroupsStorage: S } = loadModules();

  assert.deepStrictEqual(
    plain(S.getChangedKeys({ youtubeChannelActivity: {} }, "local")),
    ["channelActivity"],
  );
});

test("readChannelActivityValue devuelve la actividad o el valor vacío", () => {
  const { YouTubeGroupsStorage: S } = loadModules();
  const empty = { lastFeedAt: null, channels: {} };

  for (const invalid of [undefined, null, [], "x", 5]) {
    assert.deepStrictEqual(plain(S.readChannelActivityValue(invalid)), empty);
  }
  assert.deepStrictEqual(
    plain(S.readChannelActivityValue({ lastFeedAt: "x", channels: [] })),
    empty,
  );
  assert.deepStrictEqual(
    plain(S.readChannelActivityValue({ lastFeedAt: Infinity, channels: "x" })),
    empty,
  );
  assert.deepStrictEqual(
    plain(
      S.readChannelActivityValue({
        version: 1,
        lastFeedAt: 9,
        channels: { a: { trackedSince: 1, lastPublished: null } },
      }),
    ),
    {
      lastFeedAt: 9,
      channels: { a: { trackedSince: 1, lastPublished: null } },
    },
  );
});

test("getChannelActivity sin datos devuelve el valor vacío y no escribe", async () => {
  const { YouTubeGroupsStorage, calls } = loadModules();

  const state = await YouTubeGroupsStorage.getChannelActivity();

  assert.deepStrictEqual(plain(state), { lastFeedAt: null, channels: {} });
  assert.strictEqual(calls.set, 0);
});

test("saveChannelActivity escribe version 1 y lanza con un array", async () => {
  const { YouTubeGroupsStorage, store } = loadModules();
  const channels = { a: { trackedSince: 1, lastPublished: 2 } };

  await YouTubeGroupsStorage.saveChannelActivity({ lastFeedAt: 7, channels });

  assert.deepStrictEqual(plain(store.youtubeChannelActivity), {
    version: 1,
    lastFeedAt: 7,
    channels,
  });
  assert.deepStrictEqual(
    plain(await YouTubeGroupsStorage.getChannelActivity()),
    { lastFeedAt: 7, channels },
  );
  await assert.rejects(
    () => YouTubeGroupsStorage.saveChannelActivity([]),
    (error) => error.name === "TypeError",
  );
});

const SYNC_DEFAULTS = {
  enabled: false,
  deviceId: null,
  lastHash: null,
  lastSentAt: null,
  lastReceivedAt: null,
  dirtySince: null,
  status: "off",
  bytes: null,
  error: "",
};

test("getChangedKeys con youtubeSync devuelve sync solo en el área local", () => {
  const { YouTubeGroupsStorage: S } = loadModules();

  assert.deepStrictEqual(
    plain(S.getChangedKeys({ youtubeSync: {} }, "local")),
    ["sync"],
  );
  assert.deepStrictEqual(
    plain(S.getChangedKeys({ youtubeSync: {} }, "sync")),
    [],
  );
});

test("readSyncValue devuelve los valores por defecto con datos no válidos", () => {
  const { YouTubeGroupsStorage: S } = loadModules();

  for (const invalid of [undefined, null, [], 5, "x", {}]) {
    assert.deepStrictEqual(plain(S.readSyncValue(invalid)), SYNC_DEFAULTS);
  }
});

test("readSyncValue corrige campo a campo y conserva los válidos", () => {
  const { YouTubeGroupsStorage: S } = loadModules();

  assert.deepStrictEqual(
    plain(
      S.readSyncValue({
        version: 1,
        enabled: "true",
        deviceId: "",
        lastHash: 7,
        lastSentAt: "1",
        lastReceivedAt: NaN,
        dirtySince: Infinity,
        status: "raro",
        bytes: "9",
        error: 3,
      }),
    ),
    SYNC_DEFAULTS,
  );
  assert.deepStrictEqual(
    plain(
      S.readSyncValue({
        enabled: true,
        deviceId: "abc",
        lastHash: "fnv1a32:00000000:0",
        lastSentAt: 10,
        lastReceivedAt: 20,
        dirtySince: 30,
        status: "too-big",
        bytes: 99999,
        error: "fallo",
      }),
    ),
    {
      enabled: true,
      deviceId: "abc",
      lastHash: "fnv1a32:00000000:0",
      lastSentAt: 10,
      lastReceivedAt: 20,
      dirtySince: 30,
      status: "too-big",
      bytes: 99999,
      error: "fallo",
    },
  );
});

test("saveSyncState escribe version 1 con lo normalizado y getSyncState lo lee", async () => {
  const { YouTubeGroupsStorage: S, store, calls } = loadModules();

  assert.deepStrictEqual(plain(await S.getSyncState()), SYNC_DEFAULTS);
  assert.strictEqual(calls.set, 0);

  await S.saveSyncState({
    enabled: true,
    deviceId: "d",
    status: "ok",
    bytes: "x",
  });

  assert.deepStrictEqual(plain(store.youtubeSync), {
    version: 1,
    ...SYNC_DEFAULTS,
    enabled: true,
    deviceId: "d",
    status: "ok",
  });
  assert.deepStrictEqual(plain(await S.getSyncState()), {
    ...SYNC_DEFAULTS,
    enabled: true,
    deviceId: "d",
    status: "ok",
  });
});

test("saveAvatars con algo que no es un objeto plano lanza TypeError", async () => {
  const { YouTubeGroupsStorage } = loadModules();

  for (const invalid of [[], null, 5]) {
    await assert.rejects(
      () => YouTubeGroupsStorage.saveAvatars(invalid),
      (error) => error.name === "TypeError",
    );
  }
});

test("getChangedKeys con youtubeBackgroundRefresh devuelve backgroundRefresh", () => {
  const { YouTubeGroupsStorage: S } = loadModules();

  assert.deepStrictEqual(
    plain(S.getChangedKeys({ youtubeBackgroundRefresh: {} }, "local")),
    ["backgroundRefresh"],
  );
});

test("readBackgroundRefreshValue descarta lo no válido y conserva lo válido", () => {
  const { YouTubeGroupsStorage: S } = loadModules();
  const defaults = {
    version: 1,
    lease: null,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastResult: null,
    lastError: null,
    accountHash: null,
  };

  for (const invalid of [undefined, null, [], 5, "x", {}]) {
    assert.deepStrictEqual(
      plain(S.readBackgroundRefreshValue(invalid)),
      defaults,
    );
  }
  assert.deepStrictEqual(
    plain(
      S.readBackgroundRefreshValue({
        lease: { owner: "", until: 5 },
        lastAttemptAt: "ayer",
        lastSuccessAt: 7,
        lastResult: "raro",
        lastError: "raro",
        accountHash: "",
      }),
    ),
    { ...defaults, lastSuccessAt: 7 },
  );
  assert.deepStrictEqual(
    plain(
      S.readBackgroundRefreshValue({
        lease: { owner: "a", until: 9 },
        lastAttemptAt: 1,
        lastSuccessAt: 2,
        lastResult: "error",
        lastError: "http",
        accountHash: "abc",
      }),
    ),
    {
      version: 1,
      lease: { owner: "a", until: 9 },
      lastAttemptAt: 1,
      lastSuccessAt: 2,
      lastResult: "error",
      lastError: "http",
      accountHash: "abc",
    },
  );
});

test("readBackgroundRefreshValue ignora un lastStats guardado por versiones anteriores", () => {
  const { YouTubeGroupsStorage: S } = loadModules();
  const valid = {
    channels: 3,
    videos: null,
    videosWithAge: null,
    groupedVideos: null,
    sampleKeys: ["a", "b"],
    ageSamples: [],
  };

  for (const lastStats of [valid, "x", [], { channels: -1 }, undefined]) {
    const read = S.readBackgroundRefreshValue({ lastSuccessAt: 7, lastStats });

    assert.ok(!("lastStats" in read));
    assert.strictEqual(read.lastSuccessAt, 7);
  }
});

test("saveBackgroundRefresh de un estado con lastStats guarda sin él", async () => {
  const { YouTubeGroupsStorage: S, store } = loadModules();

  await S.saveBackgroundRefresh({
    lastResult: "ok",
    lastStats: { channels: 1 },
  });

  assert.strictEqual(store.youtubeBackgroundRefresh.lastResult, "ok");
  assert.ok(!("lastStats" in store.youtubeBackgroundRefresh));
});

test("getBackgroundRefresh no escribe sin datos y saveBackgroundRefresh normaliza", async () => {
  const { YouTubeGroupsStorage: S, calls, store } = loadModules();

  assert.strictEqual((await S.getBackgroundRefresh()).lastResult, null);
  assert.strictEqual(calls.set, 0);

  await S.saveBackgroundRefresh({ lastResult: "ok", basura: 1 });

  assert.strictEqual(store.youtubeBackgroundRefresh.lastResult, "ok");
  assert.strictEqual(store.youtubeBackgroundRefresh.version, 1);
  assert.ok(!("basura" in store.youtubeBackgroundRefresh));
});
