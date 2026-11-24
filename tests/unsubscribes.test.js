// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { loadModules, plain } = require("./helpers/load-modules");

const { YouTubeGroupsUnsubscribes: U } = loadModules();

const NOW = Date.UTC(2026, 10, 23, 12);
const keys = (count, prefix = "k") =>
  Array.from({ length: count }, (_, i) => `${prefix}${i}`);
const stored = (list) =>
  Object.fromEntries(
    list.map((key) => [key, { name: `Canal ${key}`, url: key, firstSeen: 1 }]),
  );

test("constantes de la salvaguarda", () => {
  assert.strictEqual(U.MASS_MIN, 10);
  assert.strictEqual(U.MASS_RATIO, 0.25);
  assert.strictEqual(U.PENDING_MAX_AGE_MS, 30 * 24 * 3600 * 1000);
});

test("findGoneKeys devuelve las guardadas no vistas y nada si no falta ninguna", () => {
  const known = stored(["a", "b", "c"]);

  assert.deepStrictEqual(plain(U.findGoneKeys(known, new Map([["a", "A"]]))), [
    "b",
    "c",
  ]);
  assert.deepStrictEqual(
    plain(U.findGoneKeys(known, new Set(["a", "b", "c", "d"]))),
    [],
  );
  assert.deepStrictEqual(plain(U.findGoneKeys(known, ["a", "b"])), ["c"]);
  assert.deepStrictEqual(plain(U.findGoneKeys(null, ["a"])), []);
});

test("planUnsubscribes sin bajas no hace nada", () => {
  assert.deepStrictEqual(
    plain(
      U.planUnsubscribes({ knownCount: 20, gone: [], pending: null, now: NOW }),
    ),
    { apply: [], defer: [] },
  );
});

test("planUnsubscribes: límites de la regla de baja masiva", () => {
  const plan = (gone, knownCount, pending = null) =>
    plain(
      U.planUnsubscribes({ knownCount, gone: keys(gone), pending, now: NOW }),
    );

  assert.deepStrictEqual(plan(10, 20).defer, []);
  assert.strictEqual(plan(10, 20).apply.length, 10);
  assert.deepStrictEqual(plan(11, 44).defer, []);
  assert.strictEqual(plan(11, 44).apply.length, 11);
  assert.deepStrictEqual(plan(11, 40), { apply: [], defer: keys(11) });
});

test("planUnsubscribes: segunda lectura con las mismas bajas las aplica", () => {
  const pending = { keys: keys(11), since: NOW - 1000 };

  assert.deepStrictEqual(
    plain(
      U.planUnsubscribes({ knownCount: 40, gone: keys(11), pending, now: NOW }),
    ),
    { apply: keys(11), defer: [] },
  );
});

test("planUnsubscribes: segunda lectura con solo parte aplica las confirmadas y el resto sigue la regla", () => {
  const pending = { keys: keys(11), since: NOW - 1000 };
  const some = keys(3);
  const result = plain(
    U.planUnsubscribes({ knownCount: 40, gone: some, pending, now: NOW }),
  );
  assert.deepStrictEqual(result, { apply: some, defer: [] });

  const mixed = [...keys(3), ...keys(11, "n")];
  const second = plain(
    U.planUnsubscribes({ knownCount: 40, gone: mixed, pending, now: NOW }),
  );
  assert.deepStrictEqual(second.apply, keys(3));
  assert.deepStrictEqual(second.defer, keys(11, "n"));

  const few = plain(
    U.planUnsubscribes({
      knownCount: 40,
      gone: [...keys(3), "x"],
      pending,
      now: NOW,
    }),
  );
  assert.deepStrictEqual(few, { apply: [...keys(3), "x"], defer: [] });
});

test("planUnsubscribes ignora un pendiente de más de 30 días o mal formado", () => {
  const old = { keys: keys(11), since: NOW - U.PENDING_MAX_AGE_MS - 1 };

  for (const pending of [
    old,
    "x",
    { keys: "x", since: NOW },
    { keys: keys(11) },
  ]) {
    assert.deepStrictEqual(
      plain(
        U.planUnsubscribes({
          knownCount: 40,
          gone: keys(11),
          pending,
          now: NOW,
        }),
      ),
      { apply: [], defer: keys(11) },
    );
  }
});

test("normalizePending devuelve el pendiente vigente o vacío", () => {
  assert.deepStrictEqual(
    plain(U.normalizePending({ keys: ["a", "a", 3, "b"], since: NOW }, NOW)),
    { keys: ["a", "b"], since: NOW },
  );
  assert.deepStrictEqual(plain(U.normalizePending(undefined, NOW)), {
    keys: [],
    since: null,
  });
  assert.deepStrictEqual(
    plain(
      U.normalizePending(
        { keys: ["a"], since: NOW - U.PENDING_MAX_AGE_MS },
        NOW,
      ),
    ),
    { keys: ["a"], since: NOW - U.PENDING_MAX_AGE_MS },
  );
});

const YT = "https://www.youtube.com";
const X = `${YT}/@x`;
const Y = `${YT}/@y`;
const Z = `${YT}/@z`;

function seed(extra = {}) {
  return {
    youtubeGroups: {
      version: 1,
      groups: [
        {
          id: "g1",
          name: "A",
          channels: [
            { name: "X", url: `${YT}/@X` },
            { name: "Y", url: Y },
            { name: "Z", url: Z },
          ],
          subgroups: [
            { id: "s1", name: "S", channels: [{ name: "X", url: X }] },
          ],
        },
      ],
    },
    youtubeSubscriptions: {
      version: 1,
      channels: {
        [X]: { name: "X", url: X, firstSeen: 1 },
        [Y]: { name: "Y", url: Y, firstSeen: 1 },
      },
    },
    youtubeChannelActivity: {
      version: 1,
      lastFeedAt: 5,
      channels: {
        [X]: { trackedSince: 1, lastPublished: null },
        [Y]: { trackedSince: 1, lastPublished: null },
      },
    },
    youtubeNewVideos: {
      version: 1,
      since: 1,
      videos: {
        aaaaaaaaaaa: { channel: X, seenAt: 2, publishedBefore: null },
        bbbbbbbbbbb: { channel: Y, seenAt: 2, publishedBefore: null },
      },
      visits: {},
    },
    youtubeAvatars: { version: 1, avatars: { [X]: "a.png", [Y]: "b.png" } },
    youtubeHiddenChannels: {
      version: 1,
      channels: { [X]: { name: "X", url: X, hiddenAt: 1 } },
    },
    ...extra,
  };
}

test("applyUnsubscribes quita la baja de todas las claves y respeta ocultos y no suscritos", async () => {
  const env = loadModules(seed());
  const result = await env.YouTubeGroupsUnsubscribes.applyUnsubscribes(
    new Map([[Y, "Y"]]),
    { now: NOW },
  );
  const store = plain(env.store);

  assert.deepStrictEqual(plain(result), {
    removed: [X],
    deferred: [],
    renamed: [],
  });
  const group = store.youtubeGroups.groups[0];
  assert.deepStrictEqual(
    group.channels.map((c) => c.name),
    ["Y", "Z"],
  );
  assert.strictEqual(group.subgroups[0].channels.length, 0);
  assert.deepStrictEqual(Object.keys(store.youtubeSubscriptions.channels), [Y]);
  assert.deepStrictEqual(Object.keys(store.youtubeChannelActivity.channels), [
    Y,
  ]);
  assert.deepStrictEqual(Object.keys(store.youtubeNewVideos.videos), [
    "bbbbbbbbbbb",
  ]);
  assert.deepStrictEqual(Object.keys(store.youtubeAvatars.avatars), [Y]);
  assert.ok(X in store.youtubeHiddenChannels.channels);
  assert.ok(!("youtubePendingUnsubscribes" in store));
});

test("applyUnsubscribes escribe cada clave como mucho una vez", async () => {
  const env = loadModules(seed());
  await env.YouTubeGroupsUnsubscribes.applyUnsubscribes(new Map([[Y, "Y"]]), {
    now: NOW,
  });

  // bajas recientes, grupos, actividad, vídeos nuevos, avatares y suscripciones.
  assert.strictEqual(env.calls.set, 6);
});

test("applyUnsubscribes anota las bajas recientes que salen de grupos y las quita si vuelven", async () => {
  const env = loadModules(seed());
  await env.YouTubeGroupsUnsubscribes.applyUnsubscribes(new Map([[Y, "Y"]]), {
    now: NOW,
  });

  assert.deepStrictEqual(plain(env.store.youtubeRecentUnsubscribes), {
    version: 1,
    keys: { [X]: NOW },
  });

  // X vuelve a verse en /feed/channels: sale de la anotación.
  await env.YouTubeGroupsUnsubscribes.applyUnsubscribes(
    new Map([
      [X, "X"],
      [Y, "Y"],
    ]),
    { now: NOW + 1000 },
  );
  assert.ok(!("youtubeRecentUnsubscribes" in env.store));
});

test("un canal suscrito pero sin grupo no se anota como baja reciente", async () => {
  const env = loadModules(
    seed({
      youtubeSubscriptions: {
        version: 1,
        channels: stored([X, Y, `${YT}/@sin-grupo`]),
      },
    }),
  );
  await env.YouTubeGroupsUnsubscribes.applyUnsubscribes(new Map([[Y, "Y"]]), {
    now: NOW,
  });

  assert.deepStrictEqual(
    Object.keys(plain(env.store).youtubeRecentUnsubscribes.keys),
    [X],
  );
});

test("since del pendiente se reinicia cuando cambia el lote aplazado", async () => {
  // Lote distinto del pendiente: since se reinicia.
  const env2 = loadModules({
    youtubeSubscriptions: {
      version: 1,
      channels: stored(keys(30, `${YT}/@d`)),
    },
    youtubeGroups: { version: 1, groups: [] },
    youtubePendingUnsubscribes: {
      version: 1,
      keys: [`${YT}/@d0`],
      since: NOW,
    },
  });
  const second = await env2.YouTubeGroupsUnsubscribes.applyUnsubscribes(
    new Map([[`${YT}/@d0`, "D0"]]),
    { now: NOW + 7000 },
  );
  assert.strictEqual(second.deferred.length, 29);
  assert.strictEqual(env2.store.youtubePendingUnsubscribes.since, NOW + 7000);

  // Misma lectura otra vez: el lote aplazado ya está confirmado y se aplica.
  const third = await env2.YouTubeGroupsUnsubscribes.applyUnsubscribes(
    new Map([[`${YT}/@d0`, "D0"]]),
    { now: NOW + 9000 },
  );
  assert.strictEqual(third.removed.length, 29);
  assert.ok(!("youtubePendingUnsubscribes" in env2.store));
});

test("applyUnsubscribes con una baja masiva solo guarda el pendiente", async () => {
  const many = keys(12, `${YT}/@c`);
  const env = loadModules({
    youtubeSubscriptions: { version: 1, channels: stored(many) },
    youtubeGroups: { version: 1, groups: [] },
  });
  const result = await env.YouTubeGroupsUnsubscribes.applyUnsubscribes(
    new Map([[`${YT}/@otro`, "Otro"]]),
    { now: NOW },
  );
  const store = plain(env.store);

  assert.strictEqual(result.deferred.length, 12);
  assert.deepStrictEqual(plain(result.removed), []);
  assert.strictEqual(
    Object.keys(store.youtubeSubscriptions.channels).length,
    12,
  );
  assert.deepStrictEqual(store.youtubePendingUnsubscribes, {
    version: 1,
    keys: many,
    since: NOW,
  });
  assert.strictEqual(env.calls.set, 1);

  // Segunda lectura con las mismas bajas: se aplican y el pendiente se borra.
  const second = await env.YouTubeGroupsUnsubscribes.applyUnsubscribes(
    new Map([[`${YT}/@otro`, "Otro"]]),
    { now: NOW + 1000 },
  );
  assert.strictEqual(second.removed.length, 12);
  assert.ok(!("youtubePendingUnsubscribes" in env.store));
  assert.deepStrictEqual(
    Object.keys(plain(env.store).youtubeSubscriptions.channels),
    [],
  );
});

test("applyUnsubscribes rechaza si falla saveGroups y no toca las suscripciones", async () => {
  const env = loadModules(seed());
  const original = env.YouTubeGroupsStorage.saveGroups;
  env.YouTubeGroupsStorage.saveGroups = async () => {
    throw new Error("fallo");
  };
  try {
    await assert.rejects(
      env.YouTubeGroupsUnsubscribes.applyUnsubscribes(new Map([[Y, "Y"]]), {
        now: NOW,
      }),
      /fallo/,
    );
  } finally {
    env.YouTubeGroupsStorage.saveGroups = original;
  }
  assert.deepStrictEqual(
    Object.keys(plain(env.store).youtubeSubscriptions.channels),
    [X, Y],
  );
});

test("applyUnsubscribes trata el renombrado como baja solo de suscripciones", async () => {
  const env = loadModules(seed());
  const NEW = `${YT}/@x-nuevo`;
  const result = await env.YouTubeGroupsUnsubscribes.applyUnsubscribes(
    new Map([
      [NEW, "X"],
      [Y, "Y"],
    ]),
    { now: NOW },
  );
  const store = plain(env.store);

  assert.deepStrictEqual(plain(result.renamed), [X]);
  assert.deepStrictEqual(plain(result.removed), []);
  assert.ok(!(X in store.youtubeSubscriptions.channels));
  assert.strictEqual(store.youtubeGroups.groups[0].channels.length, 3);
  assert.ok(X in store.youtubeChannelActivity.channels);
});

test("splitRenamed separa el renombrado por nombre igual con otra clave", () => {
  const known = {
    old: { name: "  Mi   Canal ", url: "old", firstSeen: 1 },
    gone: { name: "Otro", url: "gone", firstSeen: 1 },
    same: { name: "Mi canal", url: "same", firstSeen: 1 },
  };

  assert.deepStrictEqual(
    plain(U.splitRenamed(["old", "gone"], known, ["mi canal", "Nuevo"])),
    { gone: ["gone"], renamed: ["old"] },
  );
  assert.deepStrictEqual(
    plain(U.splitRenamed(["old"], known, new Set(["Distinto"]))),
    { gone: ["old"], renamed: [] },
  );
  assert.deepStrictEqual(plain(U.splitRenamed(["old"], known, [])), {
    gone: ["old"],
    renamed: [],
  });
});
