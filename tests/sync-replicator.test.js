// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { loadModules, plain } = require("./helpers/load-modules");
const { createSyncArea } = require("./helpers/sync-area");

function makeGroups(channelCount, prefix = "canal") {
  const channels = [];
  for (let i = 0; i < channelCount; i += 1) {
    channels.push({
      name: `Canal ${i}`,
      url: `https://www.youtube.com/@${prefix}${i}`,
    });
  }
  return [
    {
      id: "g1",
      name: "Grupo",
      type: "group",
      channels,
      subgroups: [],
      icon: "",
      color: "",
    },
  ];
}

function fakeTimers() {
  const timers = { pending: null, armed: 0, cleared: 0 };
  return {
    timers,
    setTimer(fn) {
      timers.armed += 1;
      timers.pending = fn;
      return timers.armed;
    },
    clearTimer() {
      timers.cleared += 1;
      timers.pending = null;
    },
    async fire() {
      const fn = timers.pending;
      timers.pending = null;
      fn();
      // Deja que la cola interna termine.
      await new Promise((resolve) => setTimeout(resolve, 20));
    },
  };
}

function setup({ enabled = true, syncState = {}, groups = 3 } = {}) {
  const mock = createSyncArea();
  const env = loadModules(
    {
      youtubeGroups: { version: 1, groups: makeGroups(groups) },
      youtubeSync: {
        version: 1,
        enabled,
        deviceId: "dev-a",
        ...syncState,
      },
    },
    { sync: mock.area },
  );
  const fake = fakeTimers();
  let clock = 1000;
  const replicator = env.YouTubeGroupsSync.createReplicator({
    setTimer: fake.setTimer,
    clearTimer: fake.clearTimer,
    now: () => clock,
  });
  return {
    mock,
    fake,
    replicator,
    setClock: (value) => {
      clock = value;
    },
    ...env,
  };
}

const LOCAL_CHANGE = { youtubeGroups: { newValue: {} } };

function remoteItems(S, deviceId, updatedAt, groups = makeGroups(5, "remoto")) {
  const text = S.stableStringify({
    groups,
    settings: { watchedMode: "hide", outsideMode: "dim", autoMarkPercent: 80 },
    hiddenChannels: {},
  });
  return S.buildReplica(text, { deviceId, now: updatedAt }).items;
}

test("un cambio local guarda dirtySince y no escribe hasta disparar el temporizador", async () => {
  const {
    mock,
    fake,
    replicator,
    store,
    setClock,
    YouTubeGroupsSync: S,
  } = setup();
  await S.push({ force: true, now: () => 1 });
  const sets = mock.calls.set;
  store.youtubeGroups = { version: 1, groups: makeGroups(4) };
  setClock(2000);

  await replicator.onStorageChanged(LOCAL_CHANGE, "local");

  assert.strictEqual(store.youtubeSync.dirtySince, 2000);
  assert.strictEqual(mock.calls.set, sets);
  await fake.fire();
  assert.strictEqual(mock.calls.set, sets + 1);
  assert.strictEqual(store.youtubeSync.dirtySince, null);
});

test("tres cambios seguidos dan un solo set", async () => {
  const { mock, fake, replicator, store, YouTubeGroupsSync: S } = setup();
  await S.push({ force: true, now: () => 1 });
  const sets = mock.calls.set;
  for (const n of [4, 5, 6]) {
    store.youtubeGroups = { version: 1, groups: makeGroups(n) };
    await replicator.onStorageChanged(LOCAL_CHANGE, "local");
  }
  await fake.fire();
  assert.strictEqual(mock.calls.set, sets + 1);
  assert.strictEqual(fake.timers.pending, null);
});

test("un cambio que deja el hash igual a lastHash no arma nada", async () => {
  const { fake, replicator, YouTubeGroupsSync: S } = setup();
  await S.push({ force: true, now: () => 1 });

  await replicator.onStorageChanged(LOCAL_CHANGE, "local");

  assert.strictEqual(fake.timers.armed, 0);
});

test("desactivada, o con otras claves, no hace nada", async () => {
  const off = setup({ enabled: false });
  await off.replicator.onStorageChanged(LOCAL_CHANGE, "local");
  assert.strictEqual(off.fake.timers.armed, 0);

  const on = setup();
  await on.replicator.onStorageChanged(
    { youtubeSync: { newValue: {} }, youtubeWatched: { newValue: {} } },
    "local",
  );
  assert.strictEqual(on.fake.timers.armed, 0);
  assert.strictEqual(on.mock.calls.set, 0);
});

test("cambios locales solo de suscripciones, vídeos nuevos o actividad no despiertan al replicador", async () => {
  const { mock, fake, replicator, YouTubeGroupsSync: S } = setup();
  await S.push({ force: true, now: () => 1 });
  const sets = mock.calls.set;

  await replicator.onStorageChanged(
    {
      youtubeSubscriptions: { newValue: {} },
      youtubeNewVideos: { newValue: {} },
      youtubeChannelActivity: { newValue: {} },
    },
    "local",
  );

  assert.strictEqual(fake.timers.armed, 0);
  assert.strictEqual(mock.calls.set, sets);
});

test("sin bucle: tras importar una réplica ajena, el cambio local resultante no envía", async () => {
  const { mock, fake, replicator, store, YouTubeGroupsSync: S } = setup();
  mock.inject(remoteItems(S, "dev-b", 9000));
  await replicator.onStorageChanged(
    { "ygSync:meta": { newValue: {} } },
    "sync",
  );
  assert.strictEqual(store.youtubeGroups.groups[0].channels.length, 5);
  const sets = mock.calls.set;

  await replicator.onStorageChanged(LOCAL_CHANGE, "local");

  assert.strictEqual(fake.timers.armed, 0);
  assert.strictEqual(mock.calls.set, sets);
});

test("el eco de una escritura propia no importa", async () => {
  const { mock, replicator, store, YouTubeGroupsSync: S } = setup();
  await S.push({ force: true, now: () => 1 });
  const before = structuredClone(store.youtubeGroups);

  await replicator.onStorageChanged(
    { "ygSync:meta": { newValue: {} } },
    "sync",
  );

  assert.deepStrictEqual(store.youtubeGroups, before);
  assert.strictEqual(store.youtubeSync.lastReceivedAt, null);
  assert.ok(mock.data["ygSync:meta"]);
});

test("réplica ajena más nueva que dirtySince importa y cancela el envío", async () => {
  const {
    mock,
    fake,
    replicator,
    store,
    YouTubeGroupsSync: S,
  } = setup({
    syncState: { dirtySince: 500 },
  });
  fake.setTimer(() => {});
  mock.inject(remoteItems(S, "dev-b", 9000));

  await replicator.onStorageChanged(
    { "ygSync:meta": { newValue: {} } },
    "sync",
  );

  assert.strictEqual(store.youtubeGroups.groups[0].channels.length, 5);
  assert.strictEqual(store.youtubeSync.dirtySince, null);
});

test("réplica ajena más antigua que dirtySince envía lo local", async () => {
  const {
    mock,
    replicator,
    store,
    YouTubeGroupsSync: S,
  } = setup({
    syncState: { dirtySince: 5000 },
  });
  mock.inject(remoteItems(S, "dev-b", 1000));

  await replicator.onStorageChanged(
    { "ygSync:meta": { newValue: {} } },
    "sync",
  );

  assert.strictEqual(store.youtubeGroups.groups[0].channels.length, 3);
  assert.strictEqual(mock.data["ygSync:meta"].deviceId, "dev-a");
});

test("réplica incompleta no hace nada", async () => {
  const { mock, replicator, store, YouTubeGroupsSync: S } = setup();
  const items = remoteItems(S, "dev-b", 9000);
  delete items["ygSync:0"];
  mock.inject(items);
  const before = structuredClone(store.youtubeGroups);
  const sets = mock.calls.set;

  await replicator.onStorageChanged(
    { "ygSync:meta": { newValue: {} } },
    "sync",
  );

  assert.deepStrictEqual(store.youtubeGroups, before);
  assert.strictEqual(mock.calls.set, sets);
});

test("reconcile con réplica vacía envía y con una ajena importa", async () => {
  const empty = setup();
  await empty.replicator.reconcile();
  assert.strictEqual(empty.mock.data["ygSync:meta"].deviceId, "dev-a");

  const other = setup();
  other.mock.inject(remoteItems(other.YouTubeGroupsSync, "dev-b", 9000));
  await other.replicator.reconcile();
  assert.strictEqual(other.store.youtubeGroups.groups[0].channels.length, 5);
});

test("enable sin réplica activa y escribe la réplica", async () => {
  const {
    mock,
    replicator,
    store,
    YouTubeGroupsSync: S,
  } = setup({ enabled: false });

  const result = await replicator.handleMessage({
    type: "youtube-groups:sync",
    action: "enable",
  });

  assert.deepStrictEqual(plain(result), { result: "enabled" });
  assert.strictEqual(store.youtubeSync.enabled, true);
  assert.ok(mock.data["ygSync:meta"]);
  const replica = S.readReplica(await mock.area.get(null));
  assert.strictEqual(replica.status, "ok");
  assert.strictEqual(replica.meta.deviceId, "dev-a");
  const written = JSON.parse(replica.text);
  const group = written.groups.find((g) => g.id === "g1");
  assert.strictEqual(group.channels.length, 3);
});

test("enable con réplica ajena distinta pide elegir y sigue desactivada", async () => {
  const {
    mock,
    replicator,
    store,
    YouTubeGroupsSync: S,
  } = setup({
    enabled: false,
  });
  mock.inject(remoteItems(S, "dev-b", 9000));

  const result = await replicator.handleMessage({
    type: "youtube-groups:sync",
    action: "enable",
  });

  assert.deepStrictEqual(plain(result), {
    result: "choose",
    remoteUpdatedAt: 9000,
  });
  assert.strictEqual(store.youtubeSync.enabled, false);
  assert.strictEqual(mock.data["ygSync:meta"].deviceId, "dev-b");
});

test("enable con direction pull o push hace lo suyo", async () => {
  const pull = setup({ enabled: false });
  pull.mock.inject(remoteItems(pull.YouTubeGroupsSync, "dev-b", 9000));
  const pulled = await pull.replicator.handleMessage({
    type: "youtube-groups:sync",
    action: "enable",
    direction: "pull",
  });
  assert.deepStrictEqual(plain(pulled), { result: "enabled" });
  assert.strictEqual(pull.store.youtubeGroups.groups[0].channels.length, 5);
  assert.strictEqual(pull.store.youtubeSync.enabled, true);

  const push = setup({ enabled: false });
  push.mock.inject(remoteItems(push.YouTubeGroupsSync, "dev-b", 9000));
  const pushed = await push.replicator.handleMessage({
    type: "youtube-groups:sync",
    action: "enable",
    direction: "push",
  });
  assert.deepStrictEqual(plain(pushed), { result: "enabled" });
  assert.strictEqual(push.mock.data["ygSync:meta"].deviceId, "dev-a");
  assert.strictEqual(push.store.youtubeGroups.groups[0].channels.length, 3);
});

test("disable desactiva y la réplica sigue en sync", async () => {
  const { mock, replicator, store, YouTubeGroupsSync: S } = setup();
  await S.push({ force: true, now: () => 1 });
  const before = structuredClone(mock.data);

  const result = await replicator.handleMessage({
    type: "youtube-groups:sync",
    action: "disable",
  });

  assert.deepStrictEqual(plain(result), { result: "disabled" });
  assert.strictEqual(store.youtubeSync.enabled, false);
  assert.ok(mock.data["ygSync:meta"]);
  assert.deepStrictEqual(mock.data, before);
  assert.strictEqual(S.readReplica(await mock.area.get(null)).status, "ok");
});

test("status devuelve localBytes y remote; otros mensajes, undefined", async () => {
  const { replicator, YouTubeGroupsSync: S } = setup();
  await S.push({ force: true, now: () => 1 });

  const status = await replicator.handleMessage({
    type: "youtube-groups:sync",
    action: "status",
  });

  assert.strictEqual(status.available, true);
  assert.ok(status.localBytes > 0);
  assert.strictEqual(status.remote.status, "ok");
  assert.strictEqual(status.remote.fromThisDevice, true);
  assert.strictEqual(replicator.handleMessage({ type: "otro" }), undefined);
});

const MSG = { type: "youtube-groups:sync" };

test("activar con árbol local vacío y réplica vacía no envía y espera a la réplica", async () => {
  const { mock, replicator, store } = setup({ enabled: false });
  store.youtubeGroups = { version: 1, groups: [] };

  const result = await replicator.handleMessage({ ...MSG, action: "enable" });

  assert.deepStrictEqual(plain(result), { result: "enabled" });
  assert.strictEqual(store.youtubeSync.enabled, true);
  assert.strictEqual(store.youtubeSync.lastHash, null);
  assert.strictEqual(mock.calls.set, 0);
  assert.strictEqual(mock.data["ygSync:meta"], undefined);
});

test("activado con árbol vacío, una réplica ajena llega y se importa en vez de enviar el vacío", async () => {
  const {
    mock,
    replicator,
    store,
    YouTubeGroupsSync: S,
  } = setup({ enabled: false });
  store.youtubeGroups = { version: 1, groups: [] };
  await replicator.handleMessage({ ...MSG, action: "enable" });
  mock.inject(remoteItems(S, "dev-b", 9000));

  await replicator.onStorageChanged(
    { "ygSync:meta": { newValue: {} } },
    "sync",
  );

  assert.strictEqual(store.youtubeGroups.groups[0].channels.length, 5);
  assert.strictEqual(mock.data["ygSync:meta"].deviceId, "dev-b");
});

test("una réplica con árbol vacío no pisa un árbol local con datos: se envía lo local", async () => {
  const {
    mock,
    replicator,
    store,
    YouTubeGroupsSync: S,
  } = setup({ syncState: { lastHash: "otro" } });
  mock.inject(remoteItems(S, "dev-b", 9000, []));

  await replicator.onStorageChanged(
    { "ygSync:meta": { newValue: {} } },
    "sync",
  );

  assert.strictEqual(store.youtubeGroups.groups[0].channels.length, 3);
  assert.strictEqual(mock.data["ygSync:meta"].deviceId, "dev-a");
});

test("reconcile tampoco importa una réplica vacía sobre datos locales", async () => {
  const {
    mock,
    replicator,
    store,
    YouTubeGroupsSync: S,
  } = setup({ syncState: { lastHash: "otro" } });
  mock.inject(remoteItems(S, "dev-b", 9000, []));

  await replicator.reconcile();

  assert.strictEqual(store.youtubeGroups.groups[0].channels.length, 3);
  assert.strictEqual(mock.data["ygSync:meta"].deviceId, "dev-a");
});

test("un cambio local sin marcar (dirtySince null) no se pierde al llegar una réplica más antigua", async () => {
  const {
    mock,
    replicator,
    store,
    YouTubeGroupsSync: S,
  } = setup({ syncState: { lastHash: "otro", dirtySince: null } });
  mock.inject(remoteItems(S, "dev-b", 500));

  await replicator.onStorageChanged(
    { "ygSync:meta": { newValue: {} } },
    "sync",
  );

  assert.strictEqual(store.youtubeGroups.groups[0].channels.length, 3);
  assert.strictEqual(mock.data["ygSync:meta"].deviceId, "dev-a");
});

test("el temporizador no envía si la sincronización se desactivó entretanto", async () => {
  const { mock, fake, replicator, store } = setup();
  store.youtubeGroups = { version: 1, groups: makeGroups(4) };
  await replicator.onStorageChanged(LOCAL_CHANGE, "local");
  assert.ok(fake.timers.pending);
  store.youtubeSync = { ...store.youtubeSync, enabled: false };

  await fake.fire();

  assert.strictEqual(mock.calls.set, 0);
});

test("si falla una escritura al importar, lastHash pasa a null y el estado a error", async () => {
  const {
    mock,
    replicator,
    store,
    YouTubeGroupsStorage,
    YouTubeGroupsSync: S,
  } = setup();
  mock.inject(remoteItems(S, "dev-b", 9000));
  YouTubeGroupsStorage.saveGroups = async () => {
    throw new Error("disco lleno");
  };

  await replicator.onStorageChanged(
    { "ygSync:meta": { newValue: {} } },
    "sync",
  );

  assert.strictEqual(store.youtubeSync.lastHash, null);
  assert.strictEqual(store.youtubeSync.status, "error");
  assert.strictEqual(store.youtubeSync.error, "disco lleno");
});
