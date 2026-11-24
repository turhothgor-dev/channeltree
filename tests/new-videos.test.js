// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { loadModules, plain } = require("./helpers/load-modules");
const { makeGroup, groupsStore } = require("./helpers/youtube-fixtures");

const FOO = "https://www.youtube.com/@Foo";
const FOO_KEY = "https://www.youtube.com/@foo";
const BAR = "https://www.youtube.com/@Bar";
const V1 = "aaaaaaaaaaa";
const V2 = "bbbbbbbbbbb";
const V3 = "ccccccccccc";
const NOW = 1_000_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

const groups = [
  makeGroup("A", { channels: [{ name: "Foo", url: FOO }] }),
  makeGroup("B"),
];

function item(channelUrl, seenAt, ageSeconds = null) {
  return { channelUrl, seenAt, ageSeconds };
}

test("normalizeNewVideos descarta lo no válido", () => {
  const { YouTubeGroupsNewVideos: N } = loadModules();

  assert.deepStrictEqual(plain(N.normalizeNewVideos(null)), {
    since: null,
    videos: {},
    visits: {},
  });
  const result = N.normalizeNewVideos({
    since: 5,
    videos: {
      [V1]: { channel: FOO_KEY, seenAt: 10, publishedBefore: null },
      corto: { channel: FOO_KEY, seenAt: 10, publishedBefore: null },
      [V2]: { channel: FOO, seenAt: 10, publishedBefore: null },
      [V3]: { channel: FOO_KEY, seenAt: Infinity, publishedBefore: null },
    },
    visits: { A: 3, B: "ayer", C: NaN },
  });
  assert.deepStrictEqual(Object.keys(result.videos), [V1]);
  assert.deepStrictEqual(plain(result.visits), { A: 3 });
  assert.strictEqual(result.since, 5);
});

test("el primer lote fija since y solo añade canales agrupados", () => {
  const { YouTubeGroupsNewVideos: N, YouTubeGroups: G } = loadModules();
  const batch = new Map([
    [V1, item("https://www.youtube.com/@foo", NOW, 7200)],
    [V2, item(BAR, NOW, 60)],
    [V3, item(FOO, NOW)],
  ]);

  const { state, changed } = N.applyFeedBatch(null, batch, {
    now: NOW,
    groups,
  });

  assert.ok(changed);
  assert.strictEqual(state.since, NOW);
  assert.deepStrictEqual(Object.keys(state.videos).sort(), [V3]);
  assert.strictEqual(G.getChannelKey(FOO), FOO_KEY);
  assert.strictEqual(state.videos[V3].publishedBefore, null);
});

test("no guarda vídeos publicados antes de since y conserva los ya guardados", () => {
  const { YouTubeGroupsNewVideos: N } = loadModules();
  const stored = {
    since: NOW - DAY,
    videos: {
      [V3]: {
        channel: FOO_KEY,
        seenAt: NOW - 1000,
        publishedBefore: NOW - 2 * DAY,
      },
    },
    visits: {},
  };
  const batch = new Map([
    [V1, item(FOO, NOW, 2 * 24 * 3600)],
    [V2, item(FOO, NOW, 7200)],
  ]);

  const { state } = N.applyFeedBatch(stored, batch, { now: NOW, groups });

  assert.deepStrictEqual(Object.keys(state.videos).sort(), [V2, V3]);
  assert.strictEqual(state.videos[V2].publishedBefore, NOW - 7_200_000);
});

test("un vídeo repetido no cambia seenAt y completa publishedBefore", () => {
  const { YouTubeGroupsNewVideos: N } = loadModules();
  const first = N.applyFeedBatch(null, new Map([[V1, item(FOO, NOW)]]), {
    now: NOW,
    groups,
  });

  const second = N.applyFeedBatch(
    first.state,
    new Map([[V1, item(FOO, NOW + 1000, 3600)]]),
    { now: NOW + 1000, groups },
  );

  assert.strictEqual(second.state.videos[V1].seenAt, NOW);
  assert.strictEqual(
    second.state.videos[V1].publishedBefore,
    NOW + 1000 - 3_600_000,
  );
  assert.ok(second.changed);

  const third = N.applyFeedBatch(
    second.state,
    new Map([[V1, item(FOO, NOW + 2000, 10)]]),
    { now: NOW + 2000, groups },
  );
  assert.strictEqual(
    third.state.videos[V1].publishedBefore,
    second.state.videos[V1].publishedBefore,
  );
  assert.strictEqual(third.changed, false);
});

test("ackGroupIds pone visitas solo de grupos existentes", () => {
  const { YouTubeGroupsNewVideos: N } = loadModules();

  const { state } = N.applyFeedBatch(null, new Map(), {
    now: NOW,
    ackGroupIds: ["A", "fantasma"],
    groups,
  });

  assert.deepStrictEqual(plain(state.visits), { A: NOW });
});

test("poda por antigüedad, canal no agrupado, tope y visitas huérfanas", () => {
  const { YouTubeGroupsNewVideos: N } = loadModules();
  const stored = {
    since: 1,
    videos: {
      [V1]: { channel: FOO_KEY, seenAt: NOW - 31 * DAY, publishedBefore: null },
      [V2]: {
        channel: "https://www.youtube.com/@bar",
        seenAt: NOW,
        publishedBefore: null,
      },
      [V3]: { channel: FOO_KEY, seenAt: NOW - DAY, publishedBefore: null },
    },
    visits: { A: 5, borrado: 6 },
  };

  const { state } = N.applyFeedBatch(stored, new Map(), { now: NOW, groups });

  assert.deepStrictEqual(Object.keys(state.videos), [V3]);
  assert.deepStrictEqual(plain(state.visits), { A: 5 });

  const many = {};
  for (let i = 0; i < 1005; i += 1) {
    many[`v${String(i).padStart(10, "0")}`] = {
      channel: FOO_KEY,
      seenAt: NOW - i,
      publishedBefore: null,
    };
  }
  const capped = N.applyFeedBatch(
    { since: 1, videos: many, visits: {} },
    null,
    {
      now: NOW,
      groups,
    },
  ).state;
  const ids = Object.keys(capped.videos);
  assert.strictEqual(ids.length, 1000);
  assert.ok(ids.includes("v0000000000"));
  assert.ok(!ids.includes("v0000001004"));
});

test("changed es false sin cambios y no muta la entrada", () => {
  const { YouTubeGroupsNewVideos: N } = loadModules();
  const stored = {
    since: 1,
    videos: {
      [V1]: { channel: FOO_KEY, seenAt: NOW, publishedBefore: null },
    },
    visits: { A: 2 },
  };
  const snapshot = structuredClone(stored);
  const batch = new Map([[V2, item(FOO, NOW, 5)]]);

  const same = N.applyFeedBatch(stored, new Map([[V1, item(FOO, NOW)]]), {
    now: NOW,
    groups,
  });
  assert.strictEqual(same.changed, false);

  N.applyFeedBatch(stored, batch, { now: NOW, ackGroupIds: ["A"], groups });
  assert.deepStrictEqual(plain(stored), snapshot);
});

test("acknowledgeGroups devuelve un estado nuevo con las visitas", () => {
  const { YouTubeGroupsNewVideos: N } = loadModules();
  const stored = { since: 1, videos: {}, visits: { A: 2 } };

  const result = N.acknowledgeGroups(stored, ["A", "B"], NOW);

  assert.deepStrictEqual(plain(result.visits), { A: NOW, B: NOW });
  assert.deepStrictEqual(plain(stored.visits), { A: 2 });
});

test("saveFeedBatch escribe una vez y nada si no cambia", async () => {
  const {
    YouTubeGroupsNewVideos: N,
    store,
    calls,
  } = loadModules(groupsStore(groups));
  const seenAt = Date.now();
  const batch = new Map([[V1, item(FOO, seenAt)]]);

  const first = await N.saveFeedBatch(batch);
  assert.ok(first.changed);
  assert.strictEqual(calls.set, 1);
  assert.strictEqual(store.youtubeNewVideos.version, 1);
  assert.ok(store.youtubeNewVideos.videos[V1]);

  const second = await N.saveFeedBatch(batch);
  assert.strictEqual(second.changed, false);
  assert.strictEqual(calls.set, 1);
});

const X = { name: "X", url: "https://www.youtube.com/@X" };
const X_KEY = "https://www.youtube.com/@x";
const countGroups = [
  makeGroup("A", { subgroups: [makeGroup("A1", { channels: [X] })] }),
  makeGroup("B", { channels: [X] }),
];

function video(seenAt, publishedBefore = seenAt, channel = X_KEY) {
  return { channel, seenAt, publishedBefore };
}

test("countNewVideos usa el reconocimiento propio de cada grupo", () => {
  const { YouTubeGroupsNewVideos: N } = loadModules();
  const state = { since: 100, videos: { [V1]: video(200) }, visits: {} };

  const sorted = [...N.countNewVideos(state, countGroups, {})].sort();
  assert.deepStrictEqual(plain(sorted), [
    ["A", 1],
    ["A1", 1],
    ["B", 1],
  ]);

  const visitedA1 = N.acknowledgeGroups(state, ["A1"], 300);
  const countsA1 = N.countNewVideos(visitedA1, countGroups, {});
  assert.strictEqual(countsA1.get("A1"), undefined);
  assert.strictEqual(countsA1.get("A"), 1);
  assert.strictEqual(countsA1.get("B"), 1);

  const visitedA = N.acknowledgeGroups(state, ["A"], 300);
  const countsA = N.countNewVideos(visitedA, countGroups, {});
  assert.strictEqual(countsA.get("A"), undefined);
  assert.strictEqual(countsA.get("A1"), 1);
  assert.strictEqual(countsA.get("B"), 1);

  const mixed = {
    since: 100,
    videos: { [V1]: video(250), [V2]: video(400) },
    visits: { A: 300 },
  };
  const countsMixed = N.countNewVideos(mixed, countGroups, {});
  assert.strictEqual(countsMixed.get("A"), 1);
  assert.strictEqual(countsMixed.get("A1"), 2);
});

test("applyFeedBatch vacío y forgetChannels conservan since y visits", () => {
  const { YouTubeGroupsNewVideos: N } = loadModules();
  const stored = {
    since: 100,
    videos: { [V1]: video(200) },
    visits: { A: 300 },
  };
  const applied = N.applyFeedBatch(stored, new Map(), {
    now: NOW,
    groups: countGroups,
  });
  assert.strictEqual(applied.state.since, 100);
  assert.deepStrictEqual(plain(applied.state.visits), { A: 300 });

  const forgotten = N.forgetChannels(stored, [X_KEY]);
  assert.strictEqual(forgotten.state.since, 100);
  assert.deepStrictEqual(plain(forgotten.state.visits), { A: 300 });
});

test("countNewVideos no cuenta vistos ni anteriores a la visita o a since", () => {
  const { YouTubeGroupsNewVideos: N } = loadModules();
  const base = { since: 100, visits: {} };

  const watched = { ...base, videos: { [V1]: video(200) } };
  assert.strictEqual(
    N.countNewVideos(watched, countGroups, { [V1]: { t: 1 } }).size,
    0,
  );
  const old = { ...base, videos: { [V1]: video(200, 150) } };
  assert.strictEqual(N.countNewVideos(old, countGroups, {}).get("B"), 1);
  const published = {
    since: 100,
    visits: { A: 180, A1: 180, B: 180 },
    videos: old.videos,
  };
  assert.strictEqual(N.countNewVideos(published, countGroups, {}).size, 0);
  const beforeSince = { ...base, videos: { [V1]: video(200, 90) } };
  assert.strictEqual(N.countNewVideos(beforeSince, countGroups, {}).size, 0);
  const seenBefore = { ...base, videos: { [V1]: video(90) } };
  assert.strictEqual(N.countNewVideos(seenBefore, countGroups, {}).size, 0);
});

test("countNewVideos no cuenta un vídeo sin edad legible", () => {
  const { YouTubeGroupsNewVideos: N } = loadModules();
  const state = {
    since: 100,
    videos: { [V1]: video(200, null) },
    visits: {},
  };
  assert.strictEqual(N.countNewVideos(state, countGroups, {}).size, 0);
});

test("countNewVideos cuenta una vez un vídeo y omite grupos sin nuevos", () => {
  const { YouTubeGroupsNewVideos: N } = loadModules();
  const y = { name: "Y", url: "https://www.youtube.com/@Y" };
  const groupsTwo = [
    makeGroup("A", { channels: [X, y] }),
    makeGroup("B", { channels: [y] }),
  ];
  const state = {
    since: 100,
    videos: {
      [V1]: video(200),
      [V2]: video(200, 200, "https://www.youtube.com/@y"),
    },
    visits: {},
  };
  const counts = N.countNewVideos(state, groupsTwo, {});
  assert.strictEqual(counts.get("A"), 2);
  assert.strictEqual(counts.get("B"), 1);
  const empty = N.countNewVideos({ since: 100 }, groupsTwo, {});
  assert.strictEqual(empty.size, 0);
});

test("getNewVideoIds solo cuenta los grupos que contienen directamente el canal", () => {
  const { YouTubeGroupsNewVideos: N } = loadModules();
  const state = { since: 100, videos: { [V1]: video(200) }, visits: {} };

  assert.deepStrictEqual([...N.getNewVideoIds(state, countGroups, {})], [V1]);

  // Reconocer A1 no basta: B contiene directamente el canal
  const visitedA1 = N.acknowledgeGroups(state, ["A1"], 300);
  assert.deepStrictEqual(
    [...N.getNewVideoIds(visitedA1, countGroups, {})],
    [V1],
  );
  // countNewVideos sigue contándolo en A, pero A no contiene el canal
  assert.strictEqual(N.countNewVideos(visitedA1, countGroups, {}).get("A"), 1);

  // Sin B, al reconocer A1 deja de estar en el conjunto
  const onlyA = [countGroups[0]];
  assert.strictEqual(N.getNewVideoIds(visitedA1, onlyA, {}).size, 0);
  assert.strictEqual(N.countNewVideos(visitedA1, onlyA, {}).get("A"), 1);

  const both = N.acknowledgeGroups(state, ["A1", "B"], 300);
  assert.strictEqual(N.getNewVideoIds(both, countGroups, {}).size, 0);
});

test("getNewVideoIds excluye vistos, sin antigüedad y anteriores al reconocimiento", () => {
  const { YouTubeGroupsNewVideos: N } = loadModules();
  const base = { since: 100, visits: {} };

  const watched = { ...base, videos: { [V1]: video(200) } };
  assert.strictEqual(
    N.getNewVideoIds(watched, countGroups, { [V1]: { t: 1 } }).size,
    0,
  );
  const noAge = { ...base, videos: { [V1]: video(200, null) } };
  assert.strictEqual(N.getNewVideoIds(noAge, countGroups, {}).size, 0);
  const before = { ...base, videos: { [V1]: video(90) } };
  assert.strictEqual(N.getNewVideoIds(before, countGroups, {}).size, 0);
  assert.strictEqual(N.getNewVideoIds({ since: 100 }, countGroups, {}).size, 0);
});

test("YouTubeGroupsNewVideos no exporta selectGroupQueue", () => {
  const { YouTubeGroupsNewVideos: N } = loadModules();

  assert.deepStrictEqual(Object.keys(N).sort(), [
    "EXIT_ACK_KEY",
    "acknowledgeGroups",
    "applyFeedBatch",
    "countNewVideos",
    "forgetChannels",
    "getGroupAck",
    "getNewVideoIds",
    "getNewVideoStatus",
    "getSubtreeGroupIds",
    "normalizeNewVideos",
    "parseExitAcks",
    "saveFeedBatch",
    "serializeExitAcks",
  ]);
  assert.strictEqual(N.selectGroupQueue, undefined);
});

test("getNewVideoStatus distingue los cinco estados en orden", () => {
  const { YouTubeGroupsNewVideos: N } = loadModules();
  const ack = 100;

  assert.strictEqual(N.getNewVideoStatus(V1, video(200, 150), ack, {}), "new");
  assert.strictEqual(
    N.getNewVideoStatus(V1, video(200, 150), ack, { [V1]: 1 }),
    "watched",
  );
  assert.strictEqual(
    N.getNewVideoStatus(V1, video(200, null), ack, {}),
    "no-age",
  );
  assert.strictEqual(
    N.getNewVideoStatus(V1, video(90, 150), ack, {}),
    "seen-before-filter",
  );
  assert.strictEqual(
    N.getNewVideoStatus(V1, video(200, 90), ack, {}),
    "published-before-filter",
  );
});

test("getGroupAck usa la visita del grupo o since", () => {
  const { YouTubeGroupsNewVideos: N } = loadModules();

  assert.strictEqual(N.getGroupAck({ since: 5, visits: { A: 9 } }, "A"), 9);
  assert.strictEqual(N.getGroupAck({ since: 5, visits: {} }, "A"), 5);
  assert.strictEqual(N.getGroupAck({}, "A"), 0);
});

test("saveFeedBatch no guarda un vídeo publicado antes de since", async () => {
  const seenAt = Date.now();
  const { YouTubeGroupsNewVideos: N, store } = loadModules({
    ...groupsStore(groups),
    youtubeNewVideos: { version: 1, since: seenAt, videos: {}, visits: {} },
  });

  await N.saveFeedBatch(new Map([[V1, item(FOO, seenAt, 3600)]]));

  assert.strictEqual(store.youtubeNewVideos.videos[V1], undefined);
});

test("forgetChannels quita los vídeos de las claves pedidas y no muta", () => {
  const { YouTubeGroupsNewVideos: N } = loadModules();
  const BAR_KEY = "https://www.youtube.com/@bar";
  const state = {
    since: 5,
    videos: {
      [V1]: { channel: FOO_KEY, seenAt: 10, publishedBefore: 20 },
      [V2]: { channel: BAR_KEY, seenAt: 10, publishedBefore: 20 },
      [V3]: { channel: FOO_KEY, seenAt: 11, publishedBefore: null },
    },
    visits: { g1: 7 },
  };
  const before = structuredClone(state);

  const result = N.forgetChannels(state, [FOO_KEY]);

  assert.strictEqual(result.changed, true);
  assert.deepStrictEqual(Object.keys(result.state.videos), [V2]);
  assert.deepStrictEqual(plain(result.state.visits), { g1: 7 });
  assert.strictEqual(result.state.since, 5);
  assert.deepStrictEqual(plain(state), plain(before));

  assert.strictEqual(N.forgetChannels(state, [BAR]).changed, false);
  assert.strictEqual(N.forgetChannels(null, [FOO_KEY]).changed, false);
});

test("getSubtreeGroupIds devuelve el grupo y sus descendientes en preorden", () => {
  const { YouTubeGroupsNewVideos: N } = loadModules();
  const tree = [
    makeGroup("A", {
      subgroups: [
        makeGroup("A1", { subgroups: [makeGroup("A1a")] }),
        makeGroup("A2"),
      ],
    }),
    makeGroup("B"),
  ];

  assert.deepStrictEqual(plain(N.getSubtreeGroupIds(tree, "A")), [
    "A",
    "A1",
    "A1a",
    "A2",
  ]);
  assert.deepStrictEqual(plain(N.getSubtreeGroupIds(tree, "A1")), [
    "A1",
    "A1a",
  ]);
  assert.deepStrictEqual(plain(N.getSubtreeGroupIds(tree, "nope")), []);
});

test("acknowledgeGroups no retrasa una visita mayor", () => {
  const { YouTubeGroupsNewVideos: N } = loadModules();
  const state = { since: 1, videos: {}, visits: { A: 500 } };

  assert.strictEqual(N.acknowledgeGroups(state, ["A"], 300).visits.A, 500);
  assert.strictEqual(N.acknowledgeGroups(state, ["A"], 700).visits.A, 700);
  assert.strictEqual(N.acknowledgeGroups(state, ["B"], 300).visits.B, 300);
});

test("applyFeedBatch con acks usa su instante, no retrasa y limita a now", () => {
  const { YouTubeGroupsNewVideos: N } = loadModules();
  const stored = { since: 1, videos: {}, visits: { A: 500, A1: 100 } };
  const acks = new Map([
    ["A", 300],
    ["A1", 400],
    ["B", NOW + DAY],
    ["ghost", 200],
  ]);

  const { state } = N.applyFeedBatch(stored, new Map(), {
    now: NOW,
    acks,
    groups: countGroups,
  });
  assert.strictEqual(state.visits.A, 500);
  assert.strictEqual(state.visits.A1, 400);
  assert.strictEqual(state.visits.B, NOW);
  assert.strictEqual(state.visits.ghost, undefined);

  const bad = N.applyFeedBatch(stored, new Map(), {
    now: NOW,
    acks: [
      ["B", NaN],
      ["A1", "x"],
    ],
    groups: countGroups,
  });
  assert.strictEqual(bad.state.visits.B, undefined);
  assert.strictEqual(bad.state.visits.A1, 100);
});

test("saveFeedBatch con acks escribe la visita con ese instante", async () => {
  const at = Date.now() - 5000;
  const { YouTubeGroupsNewVideos: N, store } = loadModules({
    ...groupsStore(countGroups),
    youtubeNewVideos: { version: 1, since: 1, videos: {}, visits: {} },
  });

  await N.saveFeedBatch(new Map(), {
    acks: [
      ["A", at],
      ["A1", at],
    ],
  });

  assert.strictEqual(store.youtubeNewVideos.visits.A, at);
  assert.strictEqual(store.youtubeNewVideos.visits.A1, at);
});

test("serializeExitAcks y parseExitAcks hacen ida y vuelta y rechazan lo no válido", () => {
  const { YouTubeGroupsNewVideos: N } = loadModules();
  const text = N.serializeExitAcks(
    new Map([
      ["A", NOW - 10],
      ["A1", NOW - 20],
    ]),
    NOW,
  );

  assert.deepStrictEqual(plain([...N.parseExitAcks(text, NOW)]), [
    ["A", NOW - 10],
    ["A1", NOW - 20],
  ]);
  assert.strictEqual(N.EXIT_ACK_KEY, "youtubeGroupsExitAcks");

  const wrap = (acks, version = 1) => JSON.stringify({ version, acks });
  assert.strictEqual(N.parseExitAcks(wrap({ A: 5 }, 2), NOW).size, 0);
  assert.strictEqual(N.parseExitAcks("{roto", NOW).size, 0);
  assert.strictEqual(N.parseExitAcks(null, NOW).size, 0);
  assert.strictEqual(N.parseExitAcks(wrap([1]), NOW).size, 0);
  assert.strictEqual(N.parseExitAcks(wrap({ A: NOW + 1 }), NOW).size, 0);
  assert.strictEqual(N.parseExitAcks(wrap({ A: NOW - 31 * DAY }), NOW).size, 0);
  assert.strictEqual(N.parseExitAcks(wrap({ A: "x", B: null }), NOW).size, 0);
  assert.strictEqual(
    N.parseExitAcks(wrap({ A: NOW - 1, B: "x" }), NOW).size,
    1,
  );

  const many = {};
  for (let i = 0; i < 600; i += 1) {
    many[`g${i}`] = NOW - 1;
  }
  assert.strictEqual(N.parseExitAcks(wrap(many), NOW).size, 500);
});
