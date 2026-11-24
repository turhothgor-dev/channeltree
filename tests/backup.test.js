// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { loadModules, plain } = require("./helpers/load-modules");

const V1 = "dQw4w9WgXcQ";
const V2 = "abcdefghijk";
const CHANNEL = "https://www.youtube.com/@canal";
const CHANNEL_B = "https://www.youtube.com/channel/UC123";
const AVATAR = "https://yt3.ggpht.com/ytc/AbC=s88-c-k-c0x00ffffff-no-rj";

function sample() {
  return {
    groups: [
      {
        id: "g1",
        name: "Música",
        type: "group",
        channels: [{ name: "Canal", url: CHANNEL }],
        subgroups: [
          {
            id: "g2",
            name: "Rock",
            type: "subgroup",
            parentId: "g1",
            channels: [{ name: "Otro", url: CHANNEL_B }],
            subgroups: [],
            icon: "",
            color: "#aabbcc",
          },
        ],
        icon: "",
        color: "",
      },
    ],
    watched: { [V1]: { watchedAt: 1700000000000 } },
    settings: {
      watchedMode: "hide",
      outsideMode: "dim",
      autoMarkPercent: 95,
      accentColor: "#00ff00",
      backgroundRefresh: false,
      showNewBadge: false,
    },
    playlists: [
      {
        id: "p1",
        name: "Ver luego",
        videos: [{ id: V2, title: "Título", channelName: "Canal", addedAt: 5 }],
      },
    ],
    avatars: { [CHANNEL]: AVATAR },
    hiddenChannels: {
      [CHANNEL_B]: { name: "Oculto", url: CHANNEL_B, hiddenAt: 1700000000000 },
    },
    subscriptions: {
      [CHANNEL]: { name: "Canal", url: CHANNEL, firstSeen: 1690000000000 },
    },
    newVideos: {
      since: 1690000000000,
      videos: {
        [V2]: {
          channel: CHANNEL,
          seenAt: 1700000000000,
          publishedBefore: null,
        },
      },
      visits: { g1: 1700000000000 },
    },
    channelActivity: {
      lastFeedAt: 1700000000000,
      channels: {
        [CHANNEL]: { trackedSince: 1690000000000, lastPublished: null },
      },
    },
  };
}

function envelope(overrides = {}) {
  const data = sample();
  return JSON.stringify({
    format: "youtube-groups-backup",
    version: 1,
    exportedAt: "2026-11-14T10:00:00.000Z",
    ...data,
    ...overrides,
  });
}

test("buildBackup usa el formato del ADR 0006", () => {
  const { YouTubeGroupsBackup: B } = loadModules();
  const backup = plain(B.buildBackup(sample(), Date.UTC(2026, 10, 14, 10)));

  assert.strictEqual(backup.format, "youtube-groups-backup");
  assert.strictEqual(backup.version, 1);
  assert.strictEqual(backup.exportedAt, "2026-11-14T10:00:00.000Z");
  assert.deepStrictEqual(backup.groups, sample().groups);
  assert.deepStrictEqual(backup.avatars, sample().avatars);
});

test("una copia exportada con el nombre antiguo se importa", () => {
  const { YouTubeGroupsBackup: B } = loadModules();

  const result = B.parseBackup(envelope({ format: "youtube-groups-backup" }));

  assert.strictEqual(result.dropped, 0);
  assert.deepStrictEqual(plain(result.data), sample());
});

test("parseBackup: ida y vuelta devuelve los mismos datos", () => {
  const { YouTubeGroupsBackup: B } = loadModules();
  const text = JSON.stringify(B.buildBackup(sample(), 0));

  const result = B.parseBackup(text);

  assert.deepStrictEqual(plain(result.data), sample());
  assert.strictEqual(result.dropped, 0);
});

test("la copia conserva la descripción de las suscripciones", () => {
  const { YouTubeGroupsBackup: B } = loadModules();
  const data = sample();
  data.subscriptions[CHANNEL].description = "Un canal de música";

  const result = B.parseBackup(JSON.stringify(B.buildBackup(data, 0)));

  assert.strictEqual(result.dropped, 0);
  assert.strictEqual(
    result.data.subscriptions[CHANNEL].description,
    "Un canal de música",
  );
});

test("una copia sin descripciones se importa igual y una no válida se quita sin contar", () => {
  const { YouTubeGroupsBackup: B } = loadModules();

  const sin = B.parseBackup(envelope());
  assert.strictEqual(sin.dropped, 0);
  assert.deepStrictEqual(plain(sin.data.subscriptions), sample().subscriptions);

  const data = sample();
  data.subscriptions[CHANNEL].description = 12;
  const mala = B.parseBackup(envelope({ subscriptions: data.subscriptions }));
  assert.strictEqual(mala.dropped, 0);
  assert.deepStrictEqual(
    plain(mala.data.subscriptions),
    sample().subscriptions,
  );
});

test("parseBackup rechaza JSON roto, formato ajeno, versión 2 y exceso de tamaño", () => {
  const { YouTubeGroupsBackup: B } = loadModules();
  const notBackup = /no es una copia de ChannelTree/;

  assert.throws(() => B.parseBackup("{roto"), notBackup);
  assert.throws(() => B.parseBackup(envelope({ format: "otro" })), notBackup);
  assert.throws(
    () => B.parseBackup("x".repeat(20000001)),
    /supera el tamaño máximo/,
  );
  assert.throws(() => B.parseBackup(12345), notBackup);
  assert.throws(
    () => B.parseBackup(envelope({ version: 2 })),
    /Versión de copia no admitida/,
  );
});

function manyWatched(count) {
  const watched = {};
  for (let i = 0; i < count; i += 1) {
    watched[`v${String(i).padStart(10, "0")}`] = { watchedAt: 1700000000000 };
  }
  return watched;
}

test("parseBackup acepta una copia válida de más de 5 MB", () => {
  const { YouTubeGroupsBackup: B } = loadModules();
  const watched = manyWatched(90000);
  const text = JSON.stringify({ ...JSON.parse(envelope()), watched }, null, 2);

  assert.ok(text.length > 5000000 && text.length < 20000000);
  const result = B.parseBackup(text);

  assert.strictEqual(Object.keys(result.data.watched).length, 90000);
});

test("exportBackup lanza el error de tamaño si la copia supera el límite", async () => {
  const store = fullStore();
  store.youtubeWatched = { version: 1, videos: manyWatched(400000) };
  const source = loadModules(store);

  await assert.rejects(
    () => source.YouTubeGroupsBackup.exportBackup(),
    /supera el tamaño máximo/,
  );
});

test("parseBackup rechaza estructura incorrecta", () => {
  const { YouTubeGroupsBackup: B } = loadModules();
  const damaged = /La copia está dañada/;

  assert.throws(() => B.parseBackup(envelope({ groups: {} })), damaged);
  assert.throws(() => B.parseBackup(envelope({ watched: [] })), damaged);
  assert.throws(() => B.parseBackup(envelope({ playlists: "x" })), damaged);
  assert.throws(
    () => B.parseBackup(envelope({ groups: [{ id: "a", name: "  " }] })),
    damaged,
  );
});

test("parseBackup rechaza ids de grupo repetidos en todo el árbol", () => {
  const { YouTubeGroupsBackup: B } = loadModules();
  const data = sample();
  data.groups[0].subgroups[0].id = "g1";

  assert.throws(
    () => B.parseBackup(envelope({ groups: data.groups })),
    /La copia está dañada/,
  );
});

test("parseBackup descarta y cuenta canales no válidos", () => {
  const { YouTubeGroupsBackup: B } = loadModules();
  const data = sample();
  data.groups[0].channels.push(
    { name: "x", url: "javascript:alert(1)" },
    { name: "y", url: "https://www.youtube.com/watch?v=x" },
    { name: "dup", url: CHANNEL },
  );

  const result = B.parseBackup(envelope({ groups: data.groups }));

  assert.deepStrictEqual(plain(result.data.groups[0].channels), [
    { name: "Canal", url: CHANNEL },
  ]);
  assert.strictEqual(result.dropped, 3);
});

test("parseBackup conserva las palabras clave válidas de grupos y subgrupos", () => {
  const { YouTubeGroupsBackup: B } = loadModules();
  const data = sample();
  data.groups[0].keywords = ["Música", "jazz"];
  data.groups[0].subgroups[0].keywords = ["lo fi"];

  const result = B.parseBackup(envelope({ groups: data.groups }));

  assert.deepStrictEqual(plain(result.data.groups[0].keywords), [
    "Música",
    "jazz",
  ]);
  assert.deepStrictEqual(plain(result.data.groups[0].subgroups[0].keywords), [
    "lo fi",
  ]);
  assert.strictEqual(result.dropped, 0);
});

test("parseBackup descarta y cuenta las palabras clave no válidas", () => {
  const { YouTubeGroupsBackup: B } = loadModules();
  const data = sample();
  data.groups[0].keywords = ["jazz", "!!!", "JAZZ", 5];

  const result = B.parseBackup(envelope({ groups: data.groups }));

  assert.deepStrictEqual(plain(result.data.groups[0].keywords), ["jazz"]);
  assert.strictEqual(result.dropped, 3);
});

test("parseBackup no crea keywords si están vacías o ausentes", () => {
  const { YouTubeGroupsBackup: B } = loadModules();
  const data = sample();
  data.groups[0].keywords = [];

  const result = B.parseBackup(envelope({ groups: data.groups }));

  assert.ok(!("keywords" in result.data.groups[0]));
  assert.ok(!("keywords" in result.data.groups[0].subgroups[0]));
  assert.strictEqual(result.dropped, 0);
});

test("parseBackup con keywords que no es un array cuenta 1 y no rechaza la copia", () => {
  const { YouTubeGroupsBackup: B } = loadModules();
  const data = sample();
  data.groups[0].keywords = "x";

  const result = B.parseBackup(envelope({ groups: data.groups }));

  assert.ok(!("keywords" in result.data.groups[0]));
  assert.strictEqual(result.dropped, 1);
});

test("exportBackup incluye las keywords guardadas y vuelven al importar", async () => {
  const store = fullStore();
  store.youtubeGroups.groups[0].keywords = ["Música"];
  const source = loadModules(store);

  const text = await source.YouTubeGroupsBackup.exportBackup();
  const result = source.YouTubeGroupsBackup.parseBackup(text);

  assert.deepStrictEqual(JSON.parse(text).groups[0].keywords, ["Música"]);
  assert.deepStrictEqual(plain(result.data.groups[0].keywords), ["Música"]);
});

test("parseBackup recalcula type y parentId, e iconos desconocidos pasan a vacío", () => {
  const { YouTubeGroupsBackup: B } = loadModules();
  const data = sample();
  data.groups[0].type = "subgroup";
  data.groups[0].parentId = "zzz";
  data.groups[0].icon = "no-existe";
  data.groups[0].subgroups[0].type = "group";
  data.groups[0].subgroups[0].parentId = "otro";
  data.groups[0].subgroups[0].color = "rojo";

  const [top] = plain(
    B.parseBackup(envelope({ groups: data.groups })).data.groups,
  );

  assert.strictEqual(top.type, "group");
  assert.ok(!("parentId" in top));
  assert.strictEqual(top.icon, "");
  assert.strictEqual(top.subgroups[0].type, "subgroup");
  assert.strictEqual(top.subgroups[0].parentId, "g1");
  assert.strictEqual(top.subgroups[0].color, "");
});

test("parseBackup descarta vistos inválidos y normaliza ajustes", () => {
  const { YouTubeGroupsBackup: B } = loadModules();

  const result = B.parseBackup(
    envelope({
      watched: {
        [V1]: { watchedAt: 1 },
        abcdefghijk1: { watchedAt: 2 },
        [V2]: { watchedAt: "x" },
      },
      settings: { watchedMode: "nope", autoMarkPercent: 50 },
    }),
  );

  assert.deepStrictEqual(plain(result.data.watched), {
    [V1]: { watchedAt: 1 },
  });
  assert.strictEqual(result.dropped, 2);
  assert.deepStrictEqual(plain(result.data.settings), {
    watchedMode: "dim",
    outsideMode: "hide",
    autoMarkPercent: 50,
    accentColor: "#1a73e8",
    backgroundRefresh: true,
    showNewBadge: true,
  });
});

test("parseBackup limpia los vídeos de las listas", () => {
  const { YouTubeGroupsBackup: B } = loadModules();
  const playlists = [
    {
      id: "p1",
      name: "L",
      videos: [
        { id: V1, title: "t".repeat(201), channelName: "c", addedAt: "x" },
        { id: V1, title: "repetido", channelName: "c", addedAt: 1 },
        { id: "corto", title: "malo", channelName: "c", addedAt: 1 },
      ],
    },
  ];

  const result = B.parseBackup(envelope({ playlists }));
  const [entry] = plain(result.data.playlists[0].videos);

  assert.strictEqual(result.data.playlists[0].videos.length, 1);
  assert.strictEqual(entry.title.length, 200);
  assert.strictEqual(entry.addedAt, 0);
  assert.strictEqual(result.dropped, 2);
});

function fullStore() {
  const data = sample();
  return {
    youtubeGroups: { version: 1, groups: data.groups },
    youtubeWatched: { version: 1, videos: data.watched },
    youtubeSettings: { version: 1, settings: data.settings },
    youtubePlaylists: { version: 1, playlists: data.playlists },
    youtubeAvatars: { version: 1, avatars: data.avatars },
    youtubeHiddenChannels: { version: 1, channels: data.hiddenChannels },
    youtubeSubscriptions: { version: 1, channels: data.subscriptions },
    youtubeNewVideos: { version: 1, ...data.newVideos },
    youtubeChannelActivity: { version: 1, ...data.channelActivity },
  };
}

test("parseBackup de una copia antigua sin las tres claves da null", () => {
  const { YouTubeGroupsBackup: B } = loadModules();
  const text = envelope({
    subscriptions: undefined,
    newVideos: undefined,
    channelActivity: undefined,
  });

  const result = B.parseBackup(text);

  assert.strictEqual(result.data.subscriptions, null);
  assert.strictEqual(result.data.newVideos, null);
  assert.strictEqual(result.data.channelActivity, null);
  assert.strictEqual(result.dropped, 0);
});

test("importBackup de una copia antigua no toca las tres claves guardadas", async () => {
  const stored = fullStore();
  const target = loadModules(stored);
  const text = envelope({
    subscriptions: undefined,
    newVideos: undefined,
    channelActivity: undefined,
  });

  await target.YouTubeGroupsBackup.importBackup(text);

  for (const key of [
    "youtubeSubscriptions",
    "youtubeNewVideos",
    "youtubeChannelActivity",
  ]) {
    assert.deepStrictEqual(plain(target.store[key]), stored[key]);
  }
});

test("parseBackup descarta y cuenta entradas no válidas de las tres claves", () => {
  const { YouTubeGroupsBackup: B } = loadModules();
  const data = sample();
  data.subscriptions.malo = { name: "", url: "x", firstSeen: 1 };
  data.newVideos.videos.malo = { channel: "x" };
  data.newVideos.visits.g2 = "no";
  data.newVideos.since = "ayer";
  data.channelActivity.channels.malo = { trackedSince: "x" };
  data.channelActivity.lastFeedAt = "ayer";

  const result = B.parseBackup(
    envelope({
      subscriptions: data.subscriptions,
      newVideos: data.newVideos,
      channelActivity: data.channelActivity,
    }),
  );

  assert.strictEqual(result.dropped, 4);
  assert.deepStrictEqual(
    plain(result.data.subscriptions),
    sample().subscriptions,
  );
  assert.deepStrictEqual(plain(result.data.newVideos), {
    ...sample().newVideos,
    since: null,
  });
  assert.deepStrictEqual(plain(result.data.channelActivity), {
    ...sample().channelActivity,
    lastFeedAt: null,
  });
});

test("parseBackup rechaza las tres claves, o sus mapas internos, que no son objeto", async () => {
  const { YouTubeGroupsBackup: B } = loadModules();
  const target = loadModules();
  const bad = [
    { subscriptions: [] },
    { subscriptions: "x" },
    { newVideos: [] },
    { newVideos: { videos: [] } },
    { newVideos: { visits: "x" } },
    { channelActivity: null },
    { channelActivity: { channels: [] } },
  ];

  for (const override of bad) {
    assert.throws(
      () => B.parseBackup(envelope(override)),
      /La copia está dañada/,
    );
    await assert.rejects(
      target.YouTubeGroupsBackup.importBackup(envelope(override)),
      /La copia está dañada/,
    );
  }
  assert.deepStrictEqual(plain(target.store), {});
});

test("importBackup con sync y viewPrefs los ignora y no escribe youtubeSync", async () => {
  const target = loadModules();
  const text = envelope({
    sync: { enabled: true },
    viewPrefs: { a: 1 },
  });

  await target.YouTubeGroupsBackup.importBackup(text);

  assert.strictEqual(target.store.youtubeSync, undefined);
  assert.ok(target.store.youtubeSubscriptions);
});

test("la copia exportada no contiene el estado de la actualización en segundo plano", async () => {
  const source = loadModules({
    youtubeBackgroundRefresh: {
      version: 1,
      lastResult: "ok",
      accountHash: "hash-secreto",
    },
  });

  const text = await source.YouTubeGroupsBackup.exportBackup();

  assert.ok(!text.includes("hash-secreto"));
  assert.ok(!text.includes("youtubeBackgroundRefresh"));
  assert.ok(!text.includes("lastAttemptAt"));
});

test("buildBackup incluye hiddenChannels", () => {
  const { YouTubeGroupsBackup: B } = loadModules();
  const backup = plain(B.buildBackup(sample(), 0));

  assert.deepStrictEqual(backup.hiddenChannels, sample().hiddenChannels);
});

test("exportBackup incluye hiddenChannels con lo guardado", async () => {
  const source = loadModules(fullStore());

  const text = await source.YouTubeGroupsBackup.exportBackup();

  assert.deepStrictEqual(
    JSON.parse(text).hiddenChannels,
    sample().hiddenChannels,
  );
});

test("importBackup con hiddenChannels los reemplaza y cuenta los no válidos", async () => {
  const target = loadModules({
    youtubeHiddenChannels: {
      version: 1,
      channels: {
        [CHANNEL]: { name: "Viejo", url: CHANNEL, hiddenAt: 1 },
      },
    },
  });
  const hiddenChannels = {
    ...sample().hiddenChannels,
    "https://www.youtube.com/@otro": {
      name: "Mal",
      url: "https://evil.com/@otro",
      hiddenAt: 2,
    },
    basura: 5,
  };

  const result = await target.YouTubeGroupsBackup.importBackup(
    envelope({ hiddenChannels }),
  );

  assert.strictEqual(result.dropped, 2);
  assert.deepStrictEqual(plain(target.store.youtubeHiddenChannels), {
    version: 1,
    channels: sample().hiddenChannels,
  });
});

test("importBackup sin hiddenChannels no toca la clave guardada", async () => {
  const stored = {
    version: 1,
    channels: { [CHANNEL]: { name: "Viejo", url: CHANNEL, hiddenAt: 1 } },
  };
  const target = loadModules({ youtubeHiddenChannels: stored });

  await target.YouTubeGroupsBackup.importBackup(
    envelope({ hiddenChannels: undefined }),
  );

  assert.deepStrictEqual(plain(target.store.youtubeHiddenChannels), stored);
  assert.ok(target.store.youtubeGroups);
});

test("hiddenChannels que no es un objeto rechaza la copia sin escribir", async () => {
  const { YouTubeGroupsBackup: B, calls } = loadModules();

  await assert.rejects(
    () => B.importBackup(envelope({ hiddenChannels: [] })),
    /La copia está dañada: canales ocultos no válidos/,
  );

  assert.strictEqual(calls.set, 0);
});

test("parseBackup: avatares válidos se conservan y el resto se descarta y cuenta", () => {
  const { YouTubeGroupsBackup: B } = loadModules();
  const avatars = {
    [CHANNEL]: AVATAR,
    [CHANNEL_B]: "https://i.ytimg.com/vi/x/a.jpg",
    "https://www.youtube.com/@Mayus": AVATAR,
    "https://evil.com/@a": AVATAR,
    "https://www.youtube.com/@otro": "https://yt3.ggpht.com/a=s48",
  };

  const result = B.parseBackup(envelope({ avatars }));

  assert.deepStrictEqual(plain(result.data.avatars), { [CHANNEL]: AVATAR });
  assert.strictEqual(result.dropped, 4);
});

test("parseBackup: una copia antigua sin avatares da avatars null", () => {
  const { YouTubeGroupsBackup: B } = loadModules();

  const result = B.parseBackup(envelope({ avatars: undefined }));

  assert.strictEqual(result.data.avatars, null);
  assert.strictEqual(result.dropped, 0);
});

test("parseBackup rechaza avatares que no son un objeto", () => {
  const { YouTubeGroupsBackup: B } = loadModules();

  assert.throws(
    () => B.parseBackup(envelope({ avatars: [] })),
    /La copia está dañada: avatares no válidos/,
  );
});

test("importBackup con avatares no válidos no escribe nada", async () => {
  const { YouTubeGroupsBackup: B, calls } = loadModules();

  await assert.rejects(
    () => B.importBackup(envelope({ avatars: [] })),
    /avatares no válidos/,
  );

  assert.strictEqual(calls.set, 0);
});

test("importBackup sin avatares no toca la clave guardada", async () => {
  const stored = { version: 1, avatars: { [CHANNEL_B]: AVATAR } };
  const target = loadModules({ youtubeAvatars: stored });

  await target.YouTubeGroupsBackup.importBackup(
    envelope({ avatars: undefined }),
  );

  assert.deepStrictEqual(plain(target.store.youtubeAvatars), stored);
  assert.ok(target.store.youtubeGroups);
});

test("importBackup con avatares los reemplaza", async () => {
  const target = loadModules({
    youtubeAvatars: { version: 1, avatars: { [CHANNEL_B]: AVATAR } },
  });

  await target.YouTubeGroupsBackup.importBackup(envelope());

  assert.deepStrictEqual(plain(target.store.youtubeAvatars), {
    version: 1,
    avatars: { [CHANNEL]: AVATAR },
  });
});

test("exportBackup e importBackup copian las cinco claves a otro contexto", async () => {
  const source = loadModules(fullStore());
  const text = await source.YouTubeGroupsBackup.exportBackup();
  assert.strictEqual(JSON.parse(text).version, 1);

  const target = loadModules();
  const result = await target.YouTubeGroupsBackup.importBackup(text);

  assert.strictEqual(result.dropped, 0);
  assert.deepStrictEqual(plain(target.store), fullStore());
});

test("importBackup con una copia que trae sidebarCollapsed la acepta y no lo guarda", async () => {
  const data = sample();
  const text = envelope({
    settings: { ...data.settings, sidebarCollapsed: true },
  });
  const target = loadModules();

  const result = await target.YouTubeGroupsBackup.importBackup(text);

  assert.strictEqual(result.dropped, 0);
  assert.deepStrictEqual(
    plain(target.store.youtubeSettings.settings),
    data.settings,
  );
});

test("importBackup con una copia que trae panelCollapsed la acepta y no lo guarda", async () => {
  const data = sample();
  const text = envelope({
    settings: { ...data.settings, panelCollapsed: true },
  });
  const target = loadModules();

  const result = await target.YouTubeGroupsBackup.importBackup(text);

  assert.strictEqual(result.dropped, 0);
  assert.deepStrictEqual(
    plain(target.store.youtubeSettings.settings),
    data.settings,
  );
});

test("importBackup con una copia no válida no escribe nada", async () => {
  const { YouTubeGroupsBackup: B, calls } = loadModules();

  await assert.rejects(() => B.importBackup("no es json"));
  await assert.rejects(() => B.importBackup(envelope({ version: 2 })));

  assert.strictEqual(calls.set, 0);
});

test("importBackup con latencia no bloquea la cola de otra escritura", async () => {
  const {
    YouTubeGroupsBackup: B,
    YouTubeGroupsStorage: S,
    store,
  } = loadModules({}, { latencyMs: 5 });

  const results = await Promise.all([
    B.importBackup(envelope()),
    S.withLock(S.KEYS.watched, () =>
      S.saveWatchedVideos({ [V2]: { watchedAt: 9 } }),
    ),
  ]);

  assert.strictEqual(results[0].dropped, 0);
  assert.ok(store.youtubeWatched);
});

function syncRaw(overrides = {}) {
  const { groups, settings, hiddenChannels } = sample();
  return { groups, settings, hiddenChannels, ...overrides };
}

test("parseSyncData devuelve lo mismo que parseBackup para grupos, ajustes y ocultos", () => {
  const { YouTubeGroupsBackup: B } = loadModules();
  const data = sample();
  data.groups[0].keywords = ["rock", "jazz"];
  data.groups[0].subgroups[0].keywords = ["metal"];
  data.groups[0].icon = "🎵";
  const full = B.parseBackup(envelope({ groups: data.groups }));

  const result = B.parseSyncData(syncRaw({ groups: data.groups }));

  assert.deepStrictEqual(Object.keys(result.data).sort(), [
    "groups",
    "hiddenChannels",
    "settings",
  ]);
  assert.deepStrictEqual(plain(result.data.groups), plain(full.data.groups));
  assert.deepStrictEqual(
    plain(result.data.settings),
    plain(full.data.settings),
  );
  assert.deepStrictEqual(
    plain(result.data.hiddenChannels),
    plain(full.data.hiddenChannels),
  );
  assert.strictEqual(result.dropped, 0);
});

test("parseSyncData conserva un accentColor válido y sustituye uno no válido", () => {
  const { YouTubeGroupsBackup: B } = loadModules();
  const base = sample().settings;

  const valid = B.parseSyncData(
    syncRaw({ settings: { ...base, accentColor: "#ABCDEF" } }),
  );
  const invalid = B.parseSyncData(
    syncRaw({ settings: { ...base, accentColor: "azul" } }),
  );

  assert.strictEqual(valid.data.settings.accentColor, "#abcdef");
  assert.strictEqual(invalid.data.settings.accentColor, "#1a73e8");
});

test("parseSyncData sin backgroundRefresh en la réplica da true", () => {
  const { YouTubeGroupsBackup: B } = loadModules();
  const { backgroundRefresh, ...base } = sample().settings;

  const result = B.parseSyncData(syncRaw({ settings: base }));

  assert.strictEqual(backgroundRefresh, false);
  assert.strictEqual(result.data.settings.backgroundRefresh, true);
});

test("parseSyncData conserva showNewBadge false y sin el campo da true", () => {
  const { YouTubeGroupsBackup: B } = loadModules();
  const { showNewBadge, ...base } = sample().settings;

  const kept = B.parseSyncData(syncRaw({ settings: sample().settings }));
  const missing = B.parseSyncData(syncRaw({ settings: base }));

  assert.strictEqual(showNewBadge, false);
  assert.strictEqual(kept.data.settings.showNewBadge, false);
  assert.strictEqual(missing.data.settings.showNewBadge, true);
});

test("parseBackup sin showNewBadge en la copia da true", () => {
  const { YouTubeGroupsBackup: B } = loadModules();
  const { showNewBadge, ...base } = sample().settings;

  const result = B.parseBackup(envelope({ settings: base }));

  assert.strictEqual(showNewBadge, false);
  assert.strictEqual(result.data.settings.showNewBadge, true);
});

test("parseSyncData sin hiddenChannels devuelve un objeto vacío", () => {
  const { YouTubeGroupsBackup: B } = loadModules();
  const raw = syncRaw();
  delete raw.hiddenChannels;

  const result = B.parseSyncData(raw);

  assert.deepStrictEqual(plain(result.data.hiddenChannels), {});
});

test("parseSyncData con ajustes no válidos usa los de defecto", () => {
  const { YouTubeGroupsBackup: B } = loadModules();
  const defaults = B.parseSyncData(syncRaw({ settings: undefined })).data
    .settings;

  const result = B.parseSyncData(syncRaw({ settings: "roto" }));

  assert.deepStrictEqual(plain(result.data.settings), plain(defaults));
});

test("parseSyncData descarta y cuenta canales ocultos con URL no válida", () => {
  const { YouTubeGroupsBackup: B } = loadModules();
  const hiddenChannels = {
    ...sample().hiddenChannels,
    "https://example.com/x": {
      name: "Malo",
      url: "https://example.com/x",
      hiddenAt: 1,
    },
  };

  const result = B.parseSyncData(syncRaw({ hiddenChannels }));

  assert.deepStrictEqual(Object.keys(result.data.hiddenChannels), [CHANNEL_B]);
  assert.strictEqual(result.dropped, 1);
});

test("parseSyncData rechaza estructura no válida", () => {
  const { YouTubeGroupsBackup: B } = loadModules();
  const damaged = /La copia está dañada/;
  const dup = sample();
  dup.groups[0].subgroups[0].id = "g1";

  assert.throws(() => B.parseSyncData(syncRaw({ groups: {} })), damaged);
  assert.throws(() => B.parseSyncData(syncRaw({ groups: undefined })), damaged);
  assert.throws(
    () => B.parseSyncData(syncRaw({ groups: dup.groups })),
    damaged,
  );
  assert.throws(
    () => B.parseSyncData(syncRaw({ hiddenChannels: [] })),
    damaged,
  );
  assert.throws(() => B.parseSyncData(null), damaged);
  assert.throws(() => B.parseSyncData([]), damaged);
});

test("parseSyncData no muta la entrada", () => {
  const { YouTubeGroupsBackup: B } = loadModules();
  const raw = syncRaw();
  raw.groups[0].channels.push({ name: "x", url: "javascript:alert(1)" });
  const before = JSON.stringify(raw);

  B.parseSyncData(raw);

  assert.strictEqual(JSON.stringify(raw), before);
});
