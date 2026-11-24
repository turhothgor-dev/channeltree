// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { loadModules, plain } = require("./helpers/load-modules");
const { createSyncArea } = require("./helpers/sync-area");

const { YouTubeGroupsSync: Sync } = loadModules();

function bigText() {
  const piece = 'a"b\\ñ😀\nç€ ';
  // ~35 000 caracteres: unos 65 KB en JSON por las comillas, barras y emojis.
  return piece.repeat(Math.ceil(35000 / piece.length));
}

function hasBrokenPair(text) {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        return true;
      }
      i += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

test("stableStringify ignora el orden de claves y conserva el de los arrays", () => {
  const a = Sync.stableStringify({ b: 1, a: { d: [3, 1, 2], c: "x" } });
  const b = Sync.stableStringify({ a: { c: "x", d: [3, 1, 2] }, b: 1 });
  assert.strictEqual(a, b);
  assert.strictEqual(a, '{"a":{"c":"x","d":[3,1,2]},"b":1}');
  assert.notStrictEqual(
    Sync.stableStringify([1, 2]),
    Sync.stableStringify([2, 1]),
  );
});

test("hashText es estable, cambia con un carácter y lleva la longitud", () => {
  const hash = Sync.hashText("hola");
  assert.strictEqual(hash, Sync.hashText("hola"));
  assert.notStrictEqual(hash, Sync.hashText("holb"));
  assert.match(hash, /^fnv1a32:[0-9a-f]{8}:4$/);
});

test("chunkText trocea sin superar el presupuesto ni partir pares sustitutos", () => {
  const text = bigText();
  const chunks = Sync.chunkText(text);
  assert.ok(chunks.length > 5);
  assert.strictEqual(chunks.join(""), text);
  chunks.forEach((chunk, i) => {
    assert.ok(Sync.measureItem(`ygSync:${i}`, chunk) <= 8000);
    assert.ok(!hasBrokenPair(chunk));
  });
  assert.deepStrictEqual(plain(Sync.chunkText("")), []);
});

test("buildReplica y readReplica dan la vuelta y caben en el mock", async () => {
  const text = bigText();
  const { items, bytes } = Sync.buildReplica(text, {
    deviceId: "dev-a",
    now: 1000,
  });
  const expected = Object.entries(items).reduce(
    (sum, [key, value]) => sum + Sync.measureItem(key, value),
    0,
  );
  assert.strictEqual(bytes, expected);
  assert.strictEqual(
    items["ygSync:meta"].chunks,
    Object.keys(items).length - 1,
  );

  const mock = createSyncArea();
  await assert.doesNotReject(mock.area.set(items));
  const replica = Sync.readReplica(await mock.area.get(null));
  assert.strictEqual(replica.status, "ok");
  assert.strictEqual(replica.text, text);
  assert.strictEqual(replica.meta.deviceId, "dev-a");
});

test("readReplica detecta réplicas incompletas, vacías e inválidas", () => {
  const { items } = Sync.buildReplica(bigText(), { deviceId: "d", now: 1 });

  const missing = structuredClone(items);
  delete missing["ygSync:1"];
  assert.strictEqual(Sync.readReplica(missing).status, "incomplete");

  const changed = structuredClone(items);
  changed["ygSync:0"] = `x${changed["ygSync:0"]}`;
  assert.strictEqual(Sync.readReplica(changed).status, "incomplete");

  assert.strictEqual(Sync.readReplica({}).status, "empty");

  const otherFormat = structuredClone(items);
  otherFormat["ygSync:meta"].format = "otro";
  assert.strictEqual(Sync.readReplica(otherFormat).status, "invalid");

  const otherVersion = structuredClone(items);
  otherVersion["ygSync:meta"].version = 2;
  assert.strictEqual(Sync.readReplica(otherVersion).status, "invalid");
});

test("decideIncoming aplica las reglas de recepción", () => {
  const meta = { deviceId: "otro", hash: "h2", updatedAt: 100 };
  const ok = { status: "ok", meta };
  const state = { deviceId: "yo", lastHash: "h1", dirtySince: null };

  assert.strictEqual(
    Sync.decideIncoming({ replica: { status: "incomplete", meta }, state }),
    "ignore",
  );
  assert.strictEqual(
    Sync.decideIncoming({
      replica: { status: "ok", meta: { ...meta, deviceId: "yo" } },
      state,
    }),
    "ignore",
  );
  assert.strictEqual(
    Sync.decideIncoming({
      replica: ok,
      state: { ...state, lastHash: "h2" },
    }),
    "ignore",
  );
  assert.strictEqual(
    Sync.decideIncoming({ replica: ok, state: { ...state, dirtySince: 101 } }),
    "push",
  );
  assert.strictEqual(
    Sync.decideIncoming({ replica: ok, state: { ...state, dirtySince: 100 } }),
    "pull",
  );
  assert.strictEqual(Sync.decideIncoming({ replica: ok, state }), "pull");
});

test("el mock de storage.sync lanza el error de cuota sin escribir", async () => {
  const perItem = createSyncArea();
  const big = "x".repeat(8193 - 1 - 2);
  await assert.rejects(perItem.area.set({ k: big }), /QuotaExceededError/);
  assert.deepStrictEqual(plain(perItem.data), {});
  await perItem.area.set({ k: "x".repeat(8189 - 1) });
  assert.strictEqual(perItem.calls.set, 2);

  const total = createSyncArea();
  const items = {};
  for (let i = 0; i < 13; i += 1) {
    items[`k${i}`] = "x".repeat(8000);
  }
  await assert.rejects(total.area.set(items), /QuotaExceededError/);
  assert.deepStrictEqual(plain(total.data), {});
});

function makeGroups(channelCount) {
  const channels = [];
  for (let i = 0; i < channelCount; i += 1) {
    channels.push({
      name: `Canal número ${i}`,
      url: `https://www.youtube.com/@canal${i}`,
    });
  }
  return [
    {
      id: "g1",
      name: "Grande",
      type: "group",
      channels,
      subgroups: [],
      icon: "",
      color: "",
    },
  ];
}

function setup(channelCount, syncOptions = {}) {
  const mock = createSyncArea(syncOptions);
  const env = loadModules(
    {
      youtubeGroups: { version: 1, groups: makeGroups(channelCount) },
      youtubeSync: { version: 1, enabled: true, deviceId: "dev-a" },
    },
    { sync: mock.area },
  );
  return { mock, ...env };
}

test("la réplica de sincronización no contiene el estado de la actualización en segundo plano", async () => {
  const { mock, store, YouTubeGroupsSync: S } = setup(3);
  store.youtubeBackgroundRefresh = {
    version: 1,
    lastResult: "ok",
    accountHash: "hash-secreto",
  };

  await S.push({ now: () => 5000 });
  const { text } = await S.buildLocalPayload();

  assert.ok(!text.includes("hash-secreto"));
  assert.ok(!JSON.stringify(mock.data).includes("hash-secreto"));
  assert.ok(!JSON.stringify(mock.data).includes("youtubeBackgroundRefresh"));
  assert.ok(!JSON.stringify(mock.data).includes("lastAttemptAt"));
});

test("push escribe cabecera y trozos y guarda el estado; sin cambios no vuelve a escribir", async () => {
  const { mock, store, YouTubeGroupsSync: S } = setup(450);

  const first = await S.push({ now: () => 5000 });

  assert.strictEqual(first.result, "sent");
  const meta = mock.data["ygSync:meta"];
  assert.ok(meta.chunks > 1);
  assert.strictEqual(Object.keys(mock.data).length, meta.chunks + 1);
  const { hash } = await S.buildLocalPayload();
  assert.strictEqual(store.youtubeSync.lastHash, hash);
  assert.strictEqual(store.youtubeSync.lastSentAt, 5000);
  assert.strictEqual(store.youtubeSync.status, "ok");
  assert.strictEqual(store.youtubeSync.dirtySince, null);

  const sets = mock.calls.set;
  const second = await S.push();
  assert.strictEqual(second.result, "unchanged");
  assert.strictEqual(mock.calls.set, sets);
});

test("push borra los trozos sobrantes al reducir el árbol", async () => {
  const { mock, store, YouTubeGroupsSync: S } = setup(450);
  await S.push();
  assert.ok(mock.data["ygSync:meta"].chunks > 1);

  store.youtubeGroups = { version: 1, groups: makeGroups(2) };
  const result = await S.push();

  assert.strictEqual(result.result, "sent");
  assert.strictEqual(mock.data["ygSync:meta"].chunks, 1);
  assert.deepStrictEqual(Object.keys(mock.data).sort(), [
    "ygSync:0",
    "ygSync:meta",
  ]);
});

test("push con más de 95 KiB no escribe en sync y se desactiva", async () => {
  const { mock, store, YouTubeGroupsSync: S } = setup(1800);
  const groupsBefore = structuredClone(store.youtubeGroups);

  const result = await S.push();

  assert.strictEqual(result.result, "too-big");
  assert.ok(result.bytes > S.TOTAL_BUDGET_BYTES);
  assert.strictEqual(mock.calls.set, 0);
  assert.strictEqual(store.youtubeSync.enabled, false);
  assert.strictEqual(store.youtubeSync.status, "too-big");
  assert.strictEqual(store.youtubeSync.bytes, result.bytes);
  assert.deepStrictEqual(store.youtubeGroups, groupsBefore);
});

test("push con error de cuota se trata como too-big", async () => {
  const { mock, store, YouTubeGroupsSync: S } = setup(50);
  mock.failNextSet(
    "QuotaExceededError: storage.sync API call exceeded its quota limitations.",
  );

  const result = await S.push();

  assert.strictEqual(result.result, "too-big");
  assert.strictEqual(store.youtubeSync.enabled, false);
  assert.strictEqual(store.youtubeSync.status, "too-big");
});

test("push con otro error deja la sincronización activa en estado error", async () => {
  const { mock, store, YouTubeGroupsSync: S } = setup(50);
  mock.failNextSet("red caída");

  const result = await S.push({ now: () => 700 });

  assert.strictEqual(result.result, "error");
  assert.strictEqual(store.youtubeSync.enabled, true);
  assert.strictEqual(store.youtubeSync.status, "error");
  assert.strictEqual(store.youtubeSync.error, "red caída");
  assert.strictEqual(store.youtubeSync.dirtySince, 700);
});

test("pull de una réplica ajena reemplaza los datos y deja lastHash coherente", async () => {
  const { mock, store, YouTubeGroupsSync: S } = setup(3);
  const remote = {
    groups: makeGroups(5),
    settings: { watchedMode: "hide", outsideMode: "dim", autoMarkPercent: 80 },
    hiddenChannels: {
      "https://www.youtube.com/@oculto": {
        name: "Oculto",
        url: "https://www.youtube.com/@oculto",
        hiddenAt: 1,
      },
    },
  };
  const text = S.stableStringify(remote);
  mock.inject(S.buildReplica(text, { deviceId: "dev-b", now: 9000 }).items);

  const result = await S.pull({ now: () => 9500 });

  assert.strictEqual(result.result, "imported");
  assert.strictEqual(store.youtubeGroups.groups[0].channels.length, 5);
  assert.strictEqual(store.youtubeSettings.settings.autoMarkPercent, 80);
  assert.deepStrictEqual(Object.keys(store.youtubeHiddenChannels.channels), [
    "https://www.youtube.com/@oculto",
  ]);
  const { hash } = await S.buildLocalPayload();
  assert.strictEqual(store.youtubeSync.lastHash, hash);
  assert.strictEqual(store.youtubeSync.lastReceivedAt, 9500);
});

test("pull no reintroduce bajas recientes y la diferencia queda como cambio local por enviar", async () => {
  const { mock, store, YouTubeGroupsSync: S } = setup(3);
  const gone = "https://www.youtube.com/@canal1";
  store.youtubeRecentUnsubscribes = { version: 1, keys: { [gone]: 9000 } };
  const remote = {
    groups: makeGroups(3),
    settings: { watchedMode: "hide", outsideMode: "dim", autoMarkPercent: 80 },
    hiddenChannels: {},
  };
  mock.inject(
    S.buildReplica(S.stableStringify(remote), { deviceId: "dev-b", now: 9000 })
      .items,
  );

  const result = await S.pull({ now: () => 9500 });

  assert.strictEqual(result.result, "imported");
  assert.deepStrictEqual(
    store.youtubeGroups.groups[0].channels.map((c) => c.url),
    ["https://www.youtube.com/@canal0", "https://www.youtube.com/@canal2"],
  );
  // lastHash es el de la réplica recibida: lo local difiere y se enviará corregido.
  const { hash } = await S.buildLocalPayload();
  assert.notStrictEqual(store.youtubeSync.lastHash, hash);

  // Una baja reciente caducada (más de 30 días) ya no se quita.
  store.youtubeRecentUnsubscribes = {
    version: 1,
    keys: { [gone]: 9500 - 31 * 24 * 60 * 60 * 1000 },
  };
  mock.inject(
    S.buildReplica(S.stableStringify(remote), { deviceId: "dev-b", now: 9600 })
      .items,
  );
  await S.pull({ now: () => 9700 });
  assert.strictEqual(store.youtubeGroups.groups[0].channels.length, 3);
});

test("pull con réplica incompleta o JSON no válido no escribe datos", async () => {
  const { mock, store, YouTubeGroupsSync: S } = setup(3);
  const groupsBefore = structuredClone(store.youtubeGroups);

  const items = S.buildReplica(S.stableStringify({ groups: makeGroups(2) }), {
    deviceId: "dev-b",
    now: 1,
  }).items;
  const broken = structuredClone(items);
  delete broken["ygSync:0"];
  mock.inject(broken);
  assert.strictEqual((await S.pull()).result, "incomplete");
  assert.deepStrictEqual(store.youtubeGroups, groupsBefore);

  mock.inject(S.buildReplica("{no json", { deviceId: "dev-b", now: 2 }).items);
  const result = await S.pull();
  assert.strictEqual(result.result, "error");
  assert.strictEqual(store.youtubeSync.status, "error");
  assert.deepStrictEqual(store.youtubeGroups, groupsBefore);
});

test("sin storage.sync push y pull devuelven unavailable", async () => {
  const env = loadModules();
  assert.strictEqual(
    (await env.YouTubeGroupsSync.push()).result,
    "unavailable",
  );
  assert.strictEqual(
    (await env.YouTubeGroupsSync.pull()).result,
    "unavailable",
  );
});

test("enable y disable cambian el estado y disable no borra la réplica", async () => {
  const { mock, store, YouTubeGroupsSync: S } = setup(3);
  store.youtubeSync = { version: 1, enabled: false };

  const result = await S.enable({});

  assert.strictEqual(result.result, "sent");
  assert.strictEqual(store.youtubeSync.enabled, true);
  assert.ok(store.youtubeSync.deviceId);
  assert.ok(mock.data["ygSync:meta"]);
  assert.strictEqual(typeof store.youtubeSync.deviceId, "string");
  assert.strictEqual(
    store.youtubeSync.deviceId,
    mock.data["ygSync:meta"].deviceId,
  );
  assert.strictEqual(S.readReplica(await mock.area.get(null)).status, "ok");
  const replicaBefore = structuredClone(mock.data);

  await S.disable();
  assert.strictEqual(store.youtubeSync.enabled, false);
  assert.strictEqual(store.youtubeSync.status, "off");
  assert.ok(mock.data["ygSync:meta"]);
  assert.deepStrictEqual(mock.data, replicaBefore);
});
