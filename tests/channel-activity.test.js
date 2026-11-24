// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { loadModules, plain } = require("./helpers/load-modules");

const { YouTubeGroupsChannelActivity: A } = loadModules();

const NOW = Date.UTC(2026, 10, 21, 12);
const HOUR = 3600 * 1000;
const DAY = A.DAY_MS;
const UNO = "https://www.youtube.com/@Uno";
const UNO_KEY = "https://www.youtube.com/@uno";
const DOS = "https://www.youtube.com/@Dos";
const DOS_KEY = "https://www.youtube.com/@dos";
const TRES = "https://www.youtube.com/@Tres";
const TRES_KEY = "https://www.youtube.com/@tres";

const groups = [
  { id: "g1", name: "A", channels: [{ name: "Uno", url: UNO }], subgroups: [] },
];
const subs = {
  [DOS_KEY]: { name: "Dos", url: DOS, firstSeen: 1 },
};

function entry(trackedSince = 1, lastPublished = null) {
  return { trackedSince, lastPublished };
}

test("normalizeActivity descarta clave, trackedSince y lastPublished inválidos", () => {
  const result = A.normalizeActivity({
    lastFeedAt: 5,
    channels: {
      [UNO_KEY]: entry(1, 2),
      [DOS_KEY]: entry(1, null),
      "https://www.youtube.com/@Tres": entry(1, null),
      "https://www.youtube.com/@cuatro": {
        trackedSince: "x",
        lastPublished: null,
      },
      "https://www.youtube.com/@cinco": { trackedSince: 1, lastPublished: "x" },
      roto: entry(),
    },
  });
  assert.deepStrictEqual(plain(result), {
    lastFeedAt: 5,
    channels: { [UNO_KEY]: entry(1, 2), [DOS_KEY]: entry(1, null) },
  });
  assert.deepStrictEqual(plain(A.normalizeActivity(null)), {
    lastFeedAt: null,
    channels: {},
  });
});

test("applyObservations añade agrupados y suscritos y poda el resto", () => {
  const stored = { lastFeedAt: null, channels: { [TRES_KEY]: entry(1) } };
  const { state, changed } = A.applyObservations(stored, new Map(), {
    now: NOW,
    groups,
    subscriptions: subs,
  });
  assert.strictEqual(changed, true);
  assert.deepStrictEqual(plain(state.channels), {
    [UNO_KEY]: entry(NOW),
    [DOS_KEY]: entry(NOW),
  });
});

test("una observación fija lastPublished con la clave canónica", () => {
  const { state } = A.applyObservations(null, new Map([[UNO, NOW - 3 * DAY]]), {
    now: NOW,
    groups,
  });
  assert.strictEqual(state.channels[UNO_KEY].lastPublished, NOW - 3 * DAY);
});

test("avanza solo si supera un día y no retrocede", () => {
  const stored = {
    lastFeedAt: null,
    channels: { [UNO_KEY]: entry(1, NOW - 10 * DAY) },
  };
  const opts = { now: NOW, groups };
  const small = A.applyObservations(
    stored,
    new Map([[UNO, NOW - 10 * DAY + 12 * HOUR]]),
    opts,
  );
  assert.strictEqual(small.changed, false);
  const big = A.applyObservations(
    stored,
    new Map([[UNO, NOW - 10 * DAY + 2 * DAY]]),
    opts,
  );
  assert.strictEqual(big.changed, true);
  assert.strictEqual(big.state.channels[UNO_KEY].lastPublished, NOW - 8 * DAY);
  const older = A.applyObservations(
    stored,
    new Map([[UNO, NOW - 20 * DAY]]),
    opts,
  );
  assert.strictEqual(
    older.state.channels[UNO_KEY].lastPublished,
    NOW - 10 * DAY,
  );
});

test("ignora canales no conservados", () => {
  const stored = { lastFeedAt: null, channels: { [UNO_KEY]: entry(1) } };
  const { state } = A.applyObservations(stored, new Map([[TRES, NOW - DAY]]), {
    now: NOW,
    groups,
  });
  assert.deepStrictEqual(Object.keys(state.channels), [UNO_KEY]);
});

test("feedVisited gestiona lastFeedAt y reinicia trackedSince", () => {
  const base = (lastFeedAt) => ({
    lastFeedAt,
    channels: { [UNO_KEY]: entry(5, 7) },
  });
  const opts = { now: NOW, groups, feedVisited: true };

  const first = A.applyObservations(base(null), new Map(), opts);
  assert.strictEqual(first.state.lastFeedAt, NOW);
  assert.strictEqual(first.state.channels[UNO_KEY].trackedSince, NOW);

  const recent = A.applyObservations(base(NOW - 6 * HOUR), new Map(), opts);
  assert.strictEqual(recent.state.lastFeedAt, NOW - 6 * HOUR);
  assert.strictEqual(recent.changed, false);

  const renew = A.applyObservations(base(NOW - 13 * HOUR), new Map(), opts);
  assert.strictEqual(renew.state.lastFeedAt, NOW);
  assert.strictEqual(renew.state.channels[UNO_KEY].trackedSince, 5);

  const gap = A.applyObservations(base(NOW - 31 * DAY), new Map(), opts);
  assert.strictEqual(gap.state.lastFeedAt, NOW);
  assert.strictEqual(gap.state.channels[UNO_KEY].trackedSince, NOW);
  assert.strictEqual(gap.state.channels[UNO_KEY].lastPublished, 7);
});

const MONTH = A.MONTH_MS;

function sub(name, url, firstSeen = 1) {
  return { name, url, firstSeen };
}

// Por defecto se añade un canal "ancla" (Tres) agrupado, suscrito y con un
// vídeo visto ayer, para que el estado no sea "no-data" (ningún vídeo visto).
function listWith({
  channels,
  lastFeedAt = NOW - DAY,
  subscriptions,
  grp,
  anchor = true,
  ...o
}) {
  let allGroups = grp ?? groups;
  let allSubs = subscriptions ?? { [UNO_KEY]: sub("Uno", UNO) };
  let allChannels = channels;
  if (anchor) {
    allGroups = structuredClone(allGroups);
    allGroups[0].channels.push({ name: "Tres", url: TRES });
    allSubs = { ...allSubs, [TRES_KEY]: sub("Tres", TRES) };
    allChannels = {
      ...channels,
      [TRES_KEY]: entry(NOW - 7 * MONTH, NOW - DAY),
    };
  }
  return plain(
    A.listInactiveChannels(
      { lastFeedAt, channels: allChannels },
      allGroups,
      allSubs,
      { now: NOW, ...o },
    ),
  );
}

test("listInactiveChannels da no-data si ningún canal evaluado tiene vídeo visto", () => {
  const channels = { [UNO_KEY]: entry(NOW - 7 * MONTH) };
  const result = listWith({ channels, anchor: false });
  assert.strictEqual(result.status, "no-data");
  assert.deepStrictEqual(result.channels, []);
  assert.strictEqual(result.observingSince, NOW - 7 * MONTH);
  const withVideo = listWith({
    channels: { [UNO_KEY]: entry(NOW - 7 * MONTH, NOW - 2 * MONTH) },
    anchor: false,
  });
  assert.strictEqual(withVideo.status, "ready");
  const empty = listWith({ channels: {}, anchor: false });
  assert.strictEqual(empty.status, "ready");
});

test("listInactiveChannels sin feed o con feed antiguo no lista nada", () => {
  const channels = { [UNO_KEY]: entry(NOW - 7 * MONTH) };
  const none = listWith({ channels, lastFeedAt: null });
  assert.strictEqual(none.status, "no-feed");
  assert.deepStrictEqual(none.channels, []);
  const stale = listWith({ channels, lastFeedAt: NOW - 31 * DAY });
  assert.strictEqual(stale.status, "stale");
  assert.deepStrictEqual(stale.channels, []);
});

test("listInactiveChannels aplica el plazo de observación y de publicación", () => {
  const old = { [UNO_KEY]: entry(NOW - 7 * MONTH) };
  const result = listWith({ channels: old });
  assert.strictEqual(result.status, "ready");
  assert.deepStrictEqual(
    result.channels.map((c) => c.key),
    [UNO_KEY],
  );
  assert.strictEqual(result.channels[0].name, "Uno");
  assert.strictEqual(result.channels[0].url, UNO);

  const recent = { [UNO_KEY]: entry(NOW - 7 * MONTH, NOW - 2 * MONTH) };
  assert.deepStrictEqual(listWith({ channels: recent }).channels, []);

  const short = { [UNO_KEY]: entry(NOW - 5 * MONTH) };
  assert.deepStrictEqual(listWith({ channels: short }).channels, []);

  const byFirstSeen = listWith({
    channels: { [UNO_KEY]: entry(1) },
    subscriptions: { [UNO_KEY]: sub("Uno", UNO, NOW - 5 * MONTH) },
  });
  assert.deepStrictEqual(byFirstSeen.channels, []);
});

test("listInactiveChannels exige agrupado, suscrito y observado", () => {
  const channels = {
    [UNO_KEY]: entry(NOW - 7 * MONTH),
    [DOS_KEY]: entry(NOW - 7 * MONTH),
  };
  const notSubscribed = listWith({ channels, subscriptions: {} });
  assert.deepStrictEqual(notSubscribed.channels, []);
  const ungrouped = listWith({
    channels,
    subscriptions: { [DOS_KEY]: sub("Dos", DOS) },
  });
  assert.deepStrictEqual(ungrouped.channels, []);
  const untracked = listWith({ channels: {} });
  assert.deepStrictEqual(untracked.channels, []);
});

test("listInactiveChannels usa el umbral elegido y 6 si no es válido", () => {
  const four = { [UNO_KEY]: entry(NOW - 4 * MONTH) };
  assert.strictEqual(
    listWith({ channels: four, thresholdMonths: 3 }).channels.length,
    1,
  );
  assert.strictEqual(
    listWith({ channels: four, thresholdMonths: 6 }).channels.length,
    0,
  );
  const seven = { [UNO_KEY]: entry(NOW - 7 * MONTH) };
  assert.strictEqual(
    listWith({ channels: seven, thresholdMonths: 12 }).channels.length,
    0,
  );
  assert.strictEqual(
    listWith({ channels: seven, thresholdMonths: 5 }).channels.length,
    1,
  );
  assert.strictEqual(
    listWith({ channels: four, thresholdMonths: 5 }).channels.length,
    0,
  );
});

test("listInactiveChannels lista los grupos en preorden, ordena y da observingSince", () => {
  const grp = [
    {
      id: "g1",
      name: "A",
      channels: [{ name: "Uno", url: UNO }],
      subgroups: [
        {
          id: "s1",
          name: "Sub",
          channels: [{ name: "Uno", url: UNO }],
          subgroups: [],
        },
      ],
    },
    {
      id: "g2",
      name: "B",
      channels: [{ name: "Dos", url: DOS }],
      subgroups: [],
    },
  ];
  const result = listWith({
    grp,
    subscriptions: {
      [UNO_KEY]: sub("Uno", UNO),
      [DOS_KEY]: sub("Dos", DOS),
    },
    channels: {
      [UNO_KEY]: entry(NOW - 8 * MONTH, NOW - 7 * MONTH),
      [DOS_KEY]: entry(NOW - 10 * MONTH, null),
    },
  });
  assert.deepStrictEqual(
    result.channels.map((c) => c.key),
    [DOS_KEY, UNO_KEY],
  );
  assert.deepStrictEqual(plain(result.channels[1].groups), [
    { id: "g1", name: "A" },
    { id: "s1", name: "Sub" },
  ]);
  assert.strictEqual(result.observingSince, NOW - 10 * MONTH);
  assert.strictEqual(result.channels[1].observedSince, NOW - 8 * MONTH);
  assert.strictEqual(result.channels[1].lastPublished, NOW - 7 * MONTH);
});

test("describeInactivity describe el plazo en meses", () => {
  assert.strictEqual(
    A.describeInactivity({ lastPublished: NOW - 7 * MONTH }, NOW),
    "Último vídeo visto hace 7 meses",
  );
  assert.strictEqual(
    A.describeInactivity(
      { lastPublished: null, observedSince: NOW - MONTH },
      NOW,
    ),
    "Nunca se ha visto un vídeo suyo (observado 1 mes; revisa antes de quitar)",
  );
  assert.strictEqual(
    A.describeInactivity(
      { lastPublished: null, observedSince: NOW - 2 * MONTH },
      NOW,
    ),
    "Nunca se ha visto un vídeo suyo (observado 2 meses; revisa antes de quitar)",
  );
});

test("applyObservations no muta la entrada", () => {
  const stored = { lastFeedAt: 1, channels: { [UNO_KEY]: entry(1, null) } };
  const copy = structuredClone(stored);
  A.applyObservations(stored, new Map([[UNO, NOW - DAY]]), {
    now: NOW,
    groups: [],
    feedVisited: true,
  });
  assert.deepStrictEqual(stored, copy);
});

function loadWithGroups(extra = {}) {
  return loadModules({
    youtubeGroups: {
      version: 1,
      groups: [
        {
          id: "g1",
          name: "A",
          channels: [
            { name: "Uno", url: UNO },
            { name: "Dos", url: DOS },
          ],
          subgroups: [],
        },
      ],
    },
    ...extra,
  });
}

test("saveObservations escribe una vez y no repite lo mismo", async () => {
  const { YouTubeGroupsChannelActivity: M, store, calls } = loadWithGroups();
  const obs = new Map([[UNO, Date.now() - 2 * HOUR]]);

  const first = await M.saveObservations(obs, { feedVisited: true });
  assert.strictEqual(first.changed, true);
  assert.strictEqual(calls.set, 1);
  assert.strictEqual(store.youtubeChannelActivity.version, 1);
  assert.strictEqual(typeof store.youtubeChannelActivity.lastFeedAt, "number");
  assert.ok(store.youtubeChannelActivity.channels[UNO_KEY].lastPublished);
  assert.strictEqual(
    store.youtubeChannelActivity.channels[DOS_KEY].lastPublished,
    null,
  );

  const second = await M.saveObservations(obs, { feedVisited: true });
  assert.strictEqual(second.changed, false);
  assert.strictEqual(calls.set, 1);
});

test("saveObservations concurrentes conservan ambas observaciones", async () => {
  const { YouTubeGroupsChannelActivity: M, store } = loadWithGroups({});
  const t1 = Date.now() - 3 * HOUR;
  const t2 = Date.now() - 5 * HOUR;
  await Promise.all([
    M.saveObservations(new Map([[UNO, t1]])),
    M.saveObservations(new Map([[DOS, t2]])),
  ]);
  const channels = store.youtubeChannelActivity.channels;
  assert.strictEqual(channels[UNO_KEY].lastPublished, t1);
  assert.strictEqual(channels[DOS_KEY].lastPublished, t2);
});

test("saveObservations descarta entradas no válidas ya guardadas", async () => {
  const { YouTubeGroupsChannelActivity: M, store } = loadWithGroups({
    youtubeChannelActivity: {
      version: 1,
      lastFeedAt: null,
      channels: {
        [TRES_KEY]: entry(1, null),
        "https://www.youtube.com/@Raro": entry(1, null),
      },
    },
  });
  await M.saveObservations(new Map());
  assert.deepStrictEqual(Object.keys(store.youtubeChannelActivity.channels), [
    UNO_KEY,
    DOS_KEY,
  ]);
});

test("forgetChannels quita solo las claves pedidas, no muta y normaliza", () => {
  const state = {
    lastFeedAt: 5,
    channels: {
      [UNO_KEY]: entry(1, 2),
      [DOS_KEY]: entry(3),
      "no-es-clave": entry(1),
    },
  };
  const before = structuredClone(state);

  const result = A.forgetChannels(state, [UNO_KEY, TRES_KEY]);

  assert.strictEqual(result.changed, true);
  assert.deepStrictEqual(plain(result.state), {
    lastFeedAt: 5,
    channels: { [DOS_KEY]: entry(3) },
  });
  assert.deepStrictEqual(plain(state), plain(before));

  assert.strictEqual(A.forgetChannels(state, [TRES_KEY]).changed, false);
  assert.deepStrictEqual(plain(A.forgetChannels(null, [UNO_KEY]).state), {
    lastFeedAt: null,
    channels: {},
  });
});
