// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { loadModules, plain } = require("./helpers/load-modules");

const before = { items: [1, 2] };
const after = { items: [1] };

test("revertSnapshot restaura una copia de before cuando current es after", () => {
  const { YouTubeGroupsUndo } = loadModules();
  const current = structuredClone(after);
  const undo = {
    before: structuredClone(before),
    after: structuredClone(after),
  };

  const result = YouTubeGroupsUndo.revertSnapshot(current, undo);

  assert.strictEqual(result.status, "restored");
  assert.deepStrictEqual(plain(result.value), before);
  assert.notStrictEqual(result.value, undo.before);
  assert.deepStrictEqual(plain(current), after);
  assert.deepStrictEqual(plain(undo), { before, after });
});

test("revertSnapshot da already con before y changed con otro valor", () => {
  const { YouTubeGroupsUndo } = loadModules();
  const undo = { before, after };

  const already = structuredClone(before);
  const r1 = YouTubeGroupsUndo.revertSnapshot(already, undo);
  assert.strictEqual(r1.status, "already");
  assert.strictEqual(r1.value, already);

  const other = { items: [9] };
  const r2 = YouTubeGroupsUndo.revertSnapshot(other, undo);
  assert.strictEqual(r2.status, "changed");
  assert.strictEqual(r2.value, other);
});

function target(initial) {
  const { YouTubeGroupsUndo, store, calls } = loadModules({ k: initial });
  return {
    YouTubeGroupsUndo,
    store,
    calls,
    target: {
      key: "k",
      read: async () => structuredClone(store.k),
      save: async (value) => {
        await Promise.resolve();
        store.k = structuredClone(value);
        calls.set += 1;
      },
    },
  };
}

test("revertAndSave escribe una vez en restored", async () => {
  const ctx = target(after);
  const result = await ctx.YouTubeGroupsUndo.revertAndSave(ctx.target, {
    before,
    after,
  });

  assert.strictEqual(result.status, "restored");
  assert.strictEqual(ctx.calls.set, 1);
  assert.deepStrictEqual(plain(ctx.store.k), before);
});

test("revertAndSave no escribe en already ni en changed", async () => {
  const already = target(before);
  const r1 = await already.YouTubeGroupsUndo.revertAndSave(already.target, {
    before,
    after,
  });
  assert.strictEqual(r1.status, "already");
  assert.strictEqual(already.calls.set, 0);

  const changed = target({ items: [7] });
  const r2 = await changed.YouTubeGroupsUndo.revertAndSave(changed.target, {
    before,
    after,
  });
  assert.strictEqual(r2.status, "changed");
  assert.strictEqual(changed.calls.set, 0);
  assert.deepStrictEqual(plain(changed.store.k), { items: [7] });
});

test("dos revertAndSave seguidos dan restored y already", async () => {
  const ctx = target(after);
  const undo = { before, after };
  const [a, b] = await Promise.all([
    ctx.YouTubeGroupsUndo.revertAndSave(ctx.target, undo),
    ctx.YouTubeGroupsUndo.revertAndSave(ctx.target, undo),
  ]);

  assert.strictEqual(a.status, "restored");
  assert.strictEqual(b.status, "already");
  assert.strictEqual(ctx.calls.set, 1);
  assert.deepStrictEqual(plain(ctx.store.k), before);
});

test("describeStatus da los tres textos", () => {
  const { YouTubeGroupsUndo } = loadModules();

  assert.strictEqual(
    YouTubeGroupsUndo.describeStatus("restored", "las listas"),
    "Deshecho",
  );
  assert.strictEqual(
    YouTubeGroupsUndo.describeStatus("already", "las listas"),
    "Ya estaba deshecho",
  );
  assert.strictEqual(
    YouTubeGroupsUndo.describeStatus("changed", "los grupos"),
    "No se puede deshacer: los grupos han cambiado desde entonces",
  );
});
