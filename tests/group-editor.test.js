// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { loadModules, plain } = require("./helpers/load-modules");

function node(id, subgroups = [], extra = {}) {
  const isSub = Boolean(extra.parentId);
  return {
    id,
    name: id,
    type: isSub ? "subgroup" : "group",
    channels: [],
    subgroups,
    icon: "",
    color: "",
    ...extra,
  };
}

// A (A1 (A1a), A2), B, C
function sampleTree() {
  return [
    node("A", [
      node("A1", [node("A1a", [], { parentId: "A1" })], { parentId: "A" }),
      node("A2", [], { parentId: "A" }),
    ]),
    node("B"),
    node("C"),
  ];
}

const ids = (list) => list.map((group) => group.id);

test("findGroupLocation devuelve padre, índice y número de hermanos", () => {
  const { YouTubeGroupsEditor } = loadModules();
  const tree = sampleTree();

  assert.deepStrictEqual(
    plain(YouTubeGroupsEditor.findGroupLocation(tree, "B")),
    { parentId: null, index: 1, siblingCount: 3 },
  );
  assert.deepStrictEqual(
    plain(YouTubeGroupsEditor.findGroupLocation(tree, "A1a")),
    { parentId: "A1", index: 0, siblingCount: 1 },
  );
  assert.strictEqual(YouTubeGroupsEditor.findGroupLocation(tree, "X"), null);
});

test("getSiblingMove: subir el primero es null y bajar A en [A,B,C] da [B,A,C]", () => {
  const { YouTubeGroupsEditor } = loadModules();
  const tree = sampleTree();

  assert.strictEqual(YouTubeGroupsEditor.getSiblingMove(tree, "A", -1), null);
  assert.strictEqual(YouTubeGroupsEditor.getSiblingMove(tree, "C", 1), null);

  const place = plain(YouTubeGroupsEditor.getSiblingMove(tree, "A", 1));
  assert.deepStrictEqual(place, { parentId: null, index: 1 });
  const { groups } = YouTubeGroupsEditor.moveGroup(
    tree,
    "A",
    place.parentId,
    place.index,
  );
  assert.deepStrictEqual(ids(groups), ["B", "A", "C"]);

  const up = plain(YouTubeGroupsEditor.getSiblingMove(tree, "C", -1));
  const moved = YouTubeGroupsEditor.moveGroup(tree, "C", up.parentId, up.index);
  assert.deepStrictEqual(ids(moved.groups), ["A", "C", "B"]);
});

test("moveGroup: un subgrupo al primer nivel pasa a type group sin parentId", () => {
  const { YouTubeGroupsEditor } = loadModules();
  const tree = sampleTree();

  const { groups, changed } = YouTubeGroupsEditor.moveGroup(
    tree,
    "A1",
    null,
    1,
  );
  assert.strictEqual(changed, true);
  assert.deepStrictEqual(ids(groups), ["A", "A1", "B", "C"]);
  const moved = groups[1];
  assert.strictEqual(moved.type, "group");
  assert.ok(!("parentId" in moved));
  assert.deepStrictEqual(ids(moved.subgroups), ["A1a"]);
  assert.deepStrictEqual(ids(groups[0].subgroups), ["A2"]);
});

test("moveGroup: un grupo dentro de otro pasa a subgroup con parentId y conserva sus hijos", () => {
  const { YouTubeGroupsEditor } = loadModules();
  const tree = sampleTree();

  const { groups } = YouTubeGroupsEditor.moveGroup(tree, "A", "B", 0);
  assert.deepStrictEqual(ids(groups), ["B", "C"]);
  const moved = groups[0].subgroups[0];
  assert.strictEqual(moved.id, "A");
  assert.strictEqual(moved.type, "subgroup");
  assert.strictEqual(moved.parentId, "B");
  assert.deepStrictEqual(plain(moved.subgroups), plain(tree[0].subgroups));
});

test("moveGroup lanza al mover dentro de sí mismo, de un descendiente o con ids inexistentes", () => {
  const { YouTubeGroupsEditor } = loadModules();
  const tree = sampleTree();

  assert.throws(() => YouTubeGroupsEditor.moveGroup(tree, "A", "A", 0));
  assert.throws(() => YouTubeGroupsEditor.moveGroup(tree, "A", "A1a", 0));
  assert.throws(() => YouTubeGroupsEditor.moveGroup(tree, "X", null, 0));
  assert.throws(() => YouTubeGroupsEditor.moveGroup(tree, "A", "X", 0));
});

test("moveGroup acota el índice y detecta el mismo lugar", () => {
  const { YouTubeGroupsEditor } = loadModules();
  const tree = sampleTree();

  const high = YouTubeGroupsEditor.moveGroup(tree, "A", null, 99);
  assert.deepStrictEqual(ids(high.groups), ["B", "C", "A"]);
  const low = YouTubeGroupsEditor.moveGroup(tree, "C", null, -5);
  assert.deepStrictEqual(ids(low.groups), ["C", "A", "B"]);

  const same = YouTubeGroupsEditor.moveGroup(tree, "B", null, 1);
  assert.strictEqual(same.changed, false);
  assert.deepStrictEqual(plain(same.groups), plain(tree));
  const sameEnd = YouTubeGroupsEditor.moveGroup(tree, "C", null, 99);
  assert.strictEqual(sameEnd.changed, false);
});

test("moveGroup no muta la entrada", () => {
  const { YouTubeGroupsEditor } = loadModules();
  const tree = sampleTree();
  const before = structuredClone(tree);

  YouTubeGroupsEditor.moveGroup(tree, "A1", "B", 0);
  YouTubeGroupsEditor.moveGroup(tree, "A", null, 2);
  YouTubeGroupsEditor.moveGroup(tree, "B", null, 1);
  assert.deepStrictEqual(plain(tree), plain(before));
});

test("getMoveTargets excluye el grupo y sus descendientes y marca el padre actual", () => {
  const { YouTubeGroupsEditor } = loadModules();
  const tree = sampleTree();

  const targets = plain(YouTubeGroupsEditor.getMoveTargets(tree, "A1"));
  assert.deepStrictEqual(
    targets.map((t) => t.id),
    [null, "A", "A2", "B", "C"],
  );
  assert.deepStrictEqual(
    targets.map((t) => t.level),
    [0, 1, 2, 1, 1],
  );
  assert.strictEqual(targets[0].name, "Primer nivel");
  assert.deepStrictEqual(
    targets.filter((t) => t.current).map((t) => t.id),
    ["A"],
  );

  const rootTargets = plain(YouTubeGroupsEditor.getMoveTargets(tree, "B"));
  assert.deepStrictEqual(
    rootTargets.filter((t) => t.current).map((t) => t.id),
    [null],
  );
});

test("getDropPosition: before, after e inside en el mismo nivel y en otro", () => {
  const { YouTubeGroupsEditor } = loadModules();
  const tree = sampleTree();
  const drop = (d, t, z) =>
    plain(YouTubeGroupsEditor.getDropPosition(tree, d, t, z));

  // Otro nivel
  assert.deepStrictEqual(drop("C", "A2", "before"), {
    parentId: "A",
    index: 1,
  });
  assert.deepStrictEqual(drop("C", "A2", "after"), {
    parentId: "A",
    index: 2,
  });
  assert.deepStrictEqual(drop("C", "A", "inside"), {
    parentId: "A",
    index: 2,
  });

  // Mismo nivel, arrastrado antes del destino: índice corregido
  assert.deepStrictEqual(drop("A", "C", "before"), {
    parentId: null,
    index: 1,
  });
  assert.deepStrictEqual(drop("A", "C", "after"), {
    parentId: null,
    index: 2,
  });
  // Mismo nivel, arrastrado después del destino
  assert.deepStrictEqual(drop("C", "A", "before"), {
    parentId: null,
    index: 0,
  });
  assert.deepStrictEqual(drop("C", "A", "after"), {
    parentId: null,
    index: 1,
  });
  // Inside con el arrastrado ya hijo del destino
  assert.deepStrictEqual(drop("A1", "A", "inside"), {
    parentId: "A",
    index: 1,
  });

  // Aplicado, el resultado es el esperado
  const place = drop("A", "C", "before");
  const { groups } = YouTubeGroupsEditor.moveGroup(
    tree,
    "A",
    place.parentId,
    place.index,
  );
  assert.deepStrictEqual(ids(groups), ["B", "A", "C"]);
});

test("getDropPosition devuelve null sobre sí mismo, un descendiente o ids inexistentes", () => {
  const { YouTubeGroupsEditor } = loadModules();
  const tree = sampleTree();

  assert.strictEqual(
    YouTubeGroupsEditor.getDropPosition(tree, "A", "A", "inside"),
    null,
  );
  assert.strictEqual(
    YouTubeGroupsEditor.getDropPosition(tree, "A", "A1a", "before"),
    null,
  );
  assert.strictEqual(
    YouTubeGroupsEditor.getDropPosition(tree, "X", "A", "after"),
    null,
  );
  assert.strictEqual(
    YouTubeGroupsEditor.getDropPosition(tree, "A", "X", "after"),
    null,
  );
});

test("moveGroupAndSave guarda el movimiento y no escribe si no hay cambios", async () => {
  const { YouTubeGroupsEditor, store, calls } = loadModules({
    youtubeGroups: { version: 1, groups: sampleTree() },
  });

  const none = await YouTubeGroupsEditor.moveGroupAndSave("B", null, 1);
  assert.strictEqual(none.changed, false);
  assert.strictEqual(calls.set, 0);

  const done = await YouTubeGroupsEditor.moveGroupAndSave("B", "A", 0);
  assert.strictEqual(done.changed, true);
  assert.strictEqual(calls.set, 1);
  const saved = store.youtubeGroups.groups;
  assert.deepStrictEqual(ids(saved), ["A", "C"]);
  assert.deepStrictEqual(ids(saved[0].subgroups), ["B", "A1", "A2"]);
});

function treeWithChannels() {
  const tree = sampleTree();
  tree[0].channels = [{ name: "Foo", url: "https://www.youtube.com/@Foo" }];
  tree[0].subgroups[0].channels = [
    { name: "foo", url: "https://www.youtube.com/@foo" },
    { name: "Bar", url: "https://www.youtube.com/@Bar" },
  ];
  return tree;
}

test("summarizeSubtree cuenta descendientes y canales distintos", () => {
  const { YouTubeGroupsEditor } = loadModules();
  const tree = treeWithChannels();

  assert.deepStrictEqual(
    plain(YouTubeGroupsEditor.summarizeSubtree(tree, "A")),
    { subgroups: 3, channels: 2 },
  );
  assert.deepStrictEqual(
    plain(YouTubeGroupsEditor.summarizeSubtree(tree, "B")),
    { subgroups: 0, channels: 0 },
  );
  assert.strictEqual(YouTubeGroupsEditor.summarizeSubtree(tree, "X"), null);
});

test("removeGroupWithSnapshot y restoreGroup dejan el árbol igual", () => {
  const { YouTubeGroupsEditor } = loadModules();
  const tree = treeWithChannels();
  const before = structuredClone(tree);

  for (const id of ["A", "A1", "A1a", "B", "C"]) {
    const removed = YouTubeGroupsEditor.removeGroupWithSnapshot(tree, id);
    assert.ok(!JSON.stringify(removed.groups).includes(`"id":"${id}"`));
    const back = YouTubeGroupsEditor.restoreGroup(
      removed.groups,
      removed.snapshot,
    );
    assert.strictEqual(back.restored, true);
    assert.strictEqual(back.atRoot, false);
    assert.deepStrictEqual(plain(back.groups), plain(before));
  }
  assert.deepStrictEqual(plain(tree), plain(before));

  const removed = YouTubeGroupsEditor.removeGroupWithSnapshot(tree, "A");
  assert.deepStrictEqual(plain(removed.removedIds), ["A", "A1", "A1a", "A2"]);
  assert.throws(() => YouTubeGroupsEditor.removeGroupWithSnapshot(tree, "X"));
});

test("restoreGroup: dos veces no cambia; sin padre va al final del primer nivel; índice acotado", () => {
  const { YouTubeGroupsEditor } = loadModules();
  const tree = sampleTree();

  const removed = YouTubeGroupsEditor.removeGroupWithSnapshot(tree, "A1");
  const once = YouTubeGroupsEditor.restoreGroup(
    removed.groups,
    removed.snapshot,
  );
  const twice = YouTubeGroupsEditor.restoreGroup(once.groups, removed.snapshot);
  assert.strictEqual(twice.restored, false);

  // Padre borrado
  const noParent = YouTubeGroupsEditor.removeGroupWithSnapshot(
    removed.groups,
    "A",
  );
  const orphan = YouTubeGroupsEditor.restoreGroup(
    noParent.groups,
    removed.snapshot,
  );
  assert.strictEqual(orphan.restored, true);
  assert.strictEqual(orphan.atRoot, true);
  assert.deepStrictEqual(ids(orphan.groups), ["B", "C", "A1"]);
  const placed = orphan.groups[2];
  assert.strictEqual(placed.type, "group");
  assert.ok(!("parentId" in placed));
  assert.deepStrictEqual(ids(placed.subgroups), ["A1a"]);

  // Índice acotado tras cambiar los hermanos: A1 estaba en el índice 0
  const sibling = removed.groups;
  sibling[0].subgroups = [];
  const clamped = YouTubeGroupsEditor.restoreGroup(sibling, {
    ...removed.snapshot,
    index: 5,
  });
  assert.deepStrictEqual(ids(clamped.groups[0].subgroups), ["A1"]);
  assert.strictEqual(clamped.groups[0].subgroups[0].parentId, "A");
});

test("deleteGroupAndSnapshot y restoreGroupAndSave guardan y no escriben de más", async () => {
  const { YouTubeGroupsEditor, store, calls } = loadModules({
    youtubeGroups: { version: 1, groups: treeWithChannels() },
  });
  const before = structuredClone(store.youtubeGroups.groups);

  const deleted = await YouTubeGroupsEditor.deleteGroupAndSnapshot("A");
  assert.strictEqual(calls.set, 1);
  assert.deepStrictEqual(plain(deleted.removedIds), ["A", "A1", "A1a", "A2"]);
  assert.deepStrictEqual(plain(deleted.summary), { subgroups: 3, channels: 2 });
  assert.deepStrictEqual(ids(store.youtubeGroups.groups), ["B", "C"]);

  const restored = await YouTubeGroupsEditor.restoreGroupAndSave(
    deleted.snapshot,
  );
  assert.deepStrictEqual(plain(restored), { restored: true, atRoot: false });
  assert.strictEqual(calls.set, 2);
  assert.deepStrictEqual(plain(store.youtubeGroups.groups), plain(before));

  const again = await YouTubeGroupsEditor.restoreGroupAndSave(deleted.snapshot);
  assert.strictEqual(again.restored, false);
  assert.strictEqual(calls.set, 2);

  await assert.rejects(YouTubeGroupsEditor.deleteGroupAndSnapshot("X"));
  assert.strictEqual(calls.set, 2);
});

const chUrl = (name) => `https://www.youtube.com/@${name}`;

// A con cinco canales (c1..c5); B con c2 y A1 vacío
function treeWithFiveChannels() {
  const tree = sampleTree();
  tree[0].channels = [1, 2, 3, 4, 5].map((n) => ({
    name: `c${n}`,
    url: chUrl(`c${n}`),
  }));
  tree[1].channels = [{ name: "c2", url: chUrl("C2") }];
  return tree;
}

const urlsOf = (group) => Array.from(group.channels, (channel) => channel.url);

test("removeChannels y restoreChannels dejan el orden original", () => {
  const { YouTubeGroupsEditor } = loadModules();
  const tree = treeWithFiveChannels();
  const before = structuredClone(tree);

  const out = YouTubeGroupsEditor.removeChannels(tree, "A", [
    chUrl("c4"),
    chUrl("c2"),
    chUrl("noexiste"),
  ]);
  assert.deepStrictEqual(urlsOf(out.groups[0]), [
    chUrl("c1"),
    chUrl("c3"),
    chUrl("c5"),
  ]);
  assert.deepStrictEqual(
    plain(out.removed).map((item) => [item.channel.name, item.index]),
    [
      ["c2", 1],
      ["c4", 3],
    ],
  );
  assert.deepStrictEqual(plain(tree), plain(before));

  const back = YouTubeGroupsEditor.restoreChannels(
    out.groups,
    "A",
    out.removed,
  );
  assert.strictEqual(back.restored, 2);
  assert.deepStrictEqual(plain(back.groups), plain(before));

  assert.throws(() => YouTubeGroupsEditor.removeChannels(tree, "X", []));
});

test("restoreChannels no duplica uno ya vuelto a añadir y no falla sin el grupo", () => {
  const { YouTubeGroupsEditor } = loadModules();
  const tree = treeWithFiveChannels();
  const out = YouTubeGroupsEditor.removeChannels(tree, "A", [chUrl("c1")]);
  const readded = structuredClone(out.groups);
  readded[0].channels.push({ name: "C1", url: chUrl("C1") });

  const back = YouTubeGroupsEditor.restoreChannels(readded, "A", out.removed);
  assert.strictEqual(back.restored, 0);
  assert.strictEqual(back.groups[0].channels.length, 5);

  const gone = YouTubeGroupsEditor.restoreChannels(
    sampleTree(),
    "X",
    out.removed,
  );
  assert.strictEqual(gone.restored, 0);
  assert.deepStrictEqual(plain(gone.groups), plain(sampleTree()));
});

test("restoreChannels no muta la entrada", () => {
  const { YouTubeGroupsEditor } = loadModules();
  const out = YouTubeGroupsEditor.removeChannels(treeWithFiveChannels(), "A", [
    chUrl("c2"),
    chUrl("c4"),
  ]);
  const input = structuredClone(out.groups);
  const removed = structuredClone(out.removed);
  const back = YouTubeGroupsEditor.restoreChannels(input, "A", removed);
  assert.strictEqual(back.restored, 2);
  assert.deepStrictEqual(plain(input), plain(out.groups));
  assert.deepStrictEqual(plain(removed), plain(out.removed));
});

test("removeChannelsAndSave con un grupo inexistente lanza sin escribir", async () => {
  const { YouTubeGroupsEditor, calls } = loadModules({
    youtubeGroups: { version: 1, groups: treeWithFiveChannels() },
  });
  await assert.rejects(() =>
    YouTubeGroupsEditor.removeChannelsAndSave("X", [chUrl("c1")]),
  );
  assert.strictEqual(calls.set, 0);
});

test("transferChannels copia sin repetir y mover quita también los repetidos", () => {
  const { YouTubeGroupsEditor } = loadModules();
  const tree = treeWithFiveChannels();
  const before = structuredClone(tree);
  const urls = [chUrl("c1"), chUrl("c2"), chUrl("c3")];

  const copied = YouTubeGroupsEditor.transferChannels(
    tree,
    "A",
    urls,
    "B",
    "copy",
  );
  assert.strictEqual(copied.added, 2);
  assert.strictEqual(copied.skipped, 1);
  assert.strictEqual(copied.groups[0].channels.length, 5);
  assert.deepStrictEqual(urlsOf(copied.groups[1]), [
    chUrl("C2"),
    chUrl("c1"),
    chUrl("c3"),
  ]);

  const moved = YouTubeGroupsEditor.transferChannels(
    tree,
    "A",
    urls,
    "B",
    "move",
  );
  assert.strictEqual(moved.added, 2);
  assert.strictEqual(moved.skipped, 1);
  assert.deepStrictEqual(urlsOf(moved.groups[0]), [chUrl("c4"), chUrl("c5")]);
  assert.deepStrictEqual(plain(tree), plain(before));

  assert.throws(() =>
    YouTubeGroupsEditor.transferChannels(tree, "A", urls, "A", "copy"),
  );
  assert.throws(() =>
    YouTubeGroupsEditor.transferChannels(tree, "A", urls, "X", "copy"),
  );
  assert.throws(() =>
    YouTubeGroupsEditor.transferChannels(tree, "X", urls, "B", "copy"),
  );
});

test("removeChannelsAndSave, restoreChannelsAndSave y transferChannelsAndSave guardan solo si cambia algo", async () => {
  const { YouTubeGroupsEditor, store, calls } = loadModules({
    youtubeGroups: { version: 1, groups: treeWithFiveChannels() },
  });
  const before = structuredClone(store.youtubeGroups.groups);

  const none = await YouTubeGroupsEditor.removeChannelsAndSave("A", [
    chUrl("noexiste"),
  ]);
  assert.strictEqual(none.removed.length, 0);
  assert.strictEqual(calls.set, 0);

  const removed = await YouTubeGroupsEditor.removeChannelsAndSave("A", [
    chUrl("c2"),
    chUrl("c4"),
  ]);
  assert.strictEqual(removed.removed.length, 2);
  assert.strictEqual(calls.set, 1);
  assert.strictEqual(store.youtubeGroups.groups[0].channels.length, 3);

  const restored = await YouTubeGroupsEditor.restoreChannelsAndSave(
    "A",
    removed.removed,
  );
  assert.strictEqual(restored.restored, 2);
  assert.strictEqual(calls.set, 2);
  assert.deepStrictEqual(plain(store.youtubeGroups.groups), plain(before));

  const again = await YouTubeGroupsEditor.restoreChannelsAndSave(
    "A",
    removed.removed,
  );
  assert.strictEqual(again.restored, 0);
  assert.strictEqual(calls.set, 2);

  const missing = await YouTubeGroupsEditor.restoreChannelsAndSave(
    "X",
    removed.removed,
  );
  assert.strictEqual(missing.restored, 0);
  assert.strictEqual(calls.set, 2);

  const copied = await YouTubeGroupsEditor.transferChannelsAndSave(
    "A",
    [chUrl("c2")],
    "B",
    "copy",
  );
  assert.deepStrictEqual(plain(copied), { added: 0, skipped: 1 });
  assert.strictEqual(calls.set, 2);

  const moved = await YouTubeGroupsEditor.transferChannelsAndSave(
    "A",
    [chUrl("c2"), chUrl("c3")],
    "B",
    "move",
  );
  assert.deepStrictEqual(plain(moved), { added: 1, skipped: 1 });
  assert.strictEqual(calls.set, 3);
  assert.deepStrictEqual(urlsOf(store.youtubeGroups.groups[0]), [
    chUrl("c1"),
    chUrl("c4"),
    chUrl("c5"),
  ]);

  await assert.rejects(
    YouTubeGroupsEditor.transferChannelsAndSave("A", [], "A", "move"),
  );
  await assert.rejects(
    YouTubeGroupsEditor.transferChannelsAndSave("A", [], "X", "move"),
  );
  assert.strictEqual(calls.set, 3);
});

test("moveGroupAndSave: dos movimientos solapados no se pisan", async () => {
  const { YouTubeGroupsEditor, store } = loadModules(
    { youtubeGroups: { version: 1, groups: sampleTree() } },
    { latencyMs: 5 },
  );

  await Promise.all([
    YouTubeGroupsEditor.moveGroupAndSave("B", "A", 0),
    YouTubeGroupsEditor.moveGroupAndSave("C", "A", 0),
  ]);

  const saved = store.youtubeGroups.groups;
  assert.deepStrictEqual(ids(saved), ["A"]);
  assert.deepStrictEqual(ids(saved[0].subgroups), ["C", "B", "A1", "A2"]);
});

test("normalizeSearchText quita acentos, mayúsculas y espacios sobrantes", () => {
  const { YouTubeGroupsEditor } = loadModules();

  assert.strictEqual(
    YouTubeGroupsEditor.normalizeSearchText("  Músíca "),
    "musica",
  );
  assert.strictEqual(
    YouTubeGroupsEditor.normalizeSearchText("MÚSICA"),
    "musica",
  );
  assert.strictEqual(YouTubeGroupsEditor.normalizeSearchText("a   b"), "a b");
});

test("searchGroups: consulta vacía devuelve null", () => {
  const { YouTubeGroupsEditor } = loadModules();

  assert.strictEqual(YouTubeGroupsEditor.searchGroups(sampleTree(), ""), null);
  assert.strictEqual(
    YouTubeGroupsEditor.searchGroups(sampleTree(), "   "),
    null,
  );
});

test("searchGroups encuentra grupos por nombre sin acentos ni mayúsculas", () => {
  const { YouTubeGroupsEditor } = loadModules();
  const tree = [
    node("A", [], { name: "Música" }),
    node("B", [], { name: "Cine" }),
  ];

  for (const query of ["  Músíca ", "musica", "MÚSICA"]) {
    const result = plain(YouTubeGroupsEditor.searchGroups(tree, query));
    assert.deepStrictEqual(result, {
      groupIds: ["A"],
      channelMatches: {},
      visibleIds: ["A"],
    });
  }
});

test("searchGroups: un canal en A1a hace visibles sus antecesores en preorden", () => {
  const { YouTubeGroupsEditor } = loadModules();
  const tree = sampleTree();
  tree[0].subgroups[0].subgroups[0].channels = [
    { name: "Jazz Club", url: "https://www.youtube.com/@jazz" },
    { name: "Otro", url: "https://www.youtube.com/@otro" },
  ];

  const result = plain(YouTubeGroupsEditor.searchGroups(tree, "jazz"));
  assert.deepStrictEqual(result.groupIds, []);
  assert.deepStrictEqual(result.visibleIds, ["A", "A1", "A1a"]);
  assert.deepStrictEqual(result.channelMatches, {
    A1a: ["https://www.youtube.com/@jazz"],
  });
});

test("searchGroups encuentra canales por handle de la URL", () => {
  const { YouTubeGroupsEditor } = loadModules();
  const tree = [node("B")];
  tree[0].channels = [
    { name: "Chill", url: "https://www.youtube.com/@lofigirl" },
  ];

  const result = plain(YouTubeGroupsEditor.searchGroups(tree, "lofi"));
  assert.deepStrictEqual(result.channelMatches, {
    B: ["https://www.youtube.com/@lofigirl"],
  });
});

test("searchGroups no duplica ids si coinciden el grupo y un canal", () => {
  const { YouTubeGroupsEditor } = loadModules();
  const tree = [node("A", [], { name: "Rock" })];
  tree[0].channels = [{ name: "Rock FM", url: "https://www.youtube.com/@fm" }];

  const result = plain(YouTubeGroupsEditor.searchGroups(tree, "rock"));
  assert.deepStrictEqual(result.groupIds, ["A"]);
  assert.deepStrictEqual(result.visibleIds, ["A"]);
  assert.deepStrictEqual(result.channelMatches, {
    A: ["https://www.youtube.com/@fm"],
  });
});

test("addChannels añade al final, cuenta omitidos y no muta la entrada", () => {
  const { YouTubeGroupsEditor } = loadModules();
  const tree = treeWithFiveChannels();
  const before = structuredClone(tree);

  const out = YouTubeGroupsEditor.addChannels(tree, "A", [
    { name: "C1", url: chUrl("C1") },
    { name: "n1", url: chUrl("n1") },
    { name: "n2", url: chUrl("n2") },
  ]);
  assert.deepStrictEqual(plain({ added: out.added, skipped: out.skipped }), {
    added: 2,
    skipped: 1,
  });
  assert.deepStrictEqual(urlsOf(out.groups[0]).slice(5), [
    chUrl("n1"),
    chUrl("n2"),
  ]);
  assert.deepStrictEqual(plain(tree), plain(before));
});

test("addChannels añade a un subgrupo y lanza con un id inexistente", () => {
  const { YouTubeGroupsEditor } = loadModules();
  const tree = sampleTree();

  const out = YouTubeGroupsEditor.addChannels(tree, "A1", [
    { name: "n1", url: chUrl("n1") },
  ]);
  assert.strictEqual(out.added, 1);
  assert.deepStrictEqual(urlsOf(out.groups[0].subgroups[0]), [chUrl("n1")]);

  assert.throws(
    () => YouTubeGroupsEditor.addChannels(tree, "X", []),
    /No existe el grupo indicado/,
  );
});

test("addChannelsAndSave escribe una vez y no escribe si todos ya estaban", async () => {
  const { YouTubeGroupsEditor, store, calls } = loadModules({
    youtubeGroups: { version: 1, groups: treeWithFiveChannels() },
  });

  const done = await YouTubeGroupsEditor.addChannelsAndSave("A", [
    { name: "n1", url: chUrl("n1") },
    { name: "c1", url: chUrl("c1") },
  ]);
  assert.deepStrictEqual(plain(done), { added: 1, skipped: 1 });
  assert.strictEqual(calls.set, 1);
  assert.strictEqual(store.youtubeGroups.groups[0].channels.length, 6);

  const again = await YouTubeGroupsEditor.addChannelsAndSave("A", [
    { name: "n1", url: chUrl("N1") },
  ]);
  assert.deepStrictEqual(plain(again), { added: 0, skipped: 1 });
  assert.strictEqual(calls.set, 1);

  await assert.rejects(YouTubeGroupsEditor.addChannelsAndSave("X", []));
  assert.strictEqual(calls.set, 1);
});

function twoGroupsTree() {
  return [
    node("A", [], { channels: [{ name: "Uno", url: chUrl("Uno") }] }),
    node("B"),
  ];
}

test("addChannelsToGroups añade al final de cada grupo sin mutar la entrada", () => {
  const { YouTubeGroupsEditor } = loadModules();
  const tree = twoGroupsTree();
  const copy = structuredClone(tree);
  const out = YouTubeGroupsEditor.addChannelsToGroups(tree, [
    { groupId: "A", channel: { name: "Dos", url: chUrl("dos") } },
    { groupId: "B", channel: { name: "Tres", url: chUrl("tres") } },
  ]);
  assert.deepStrictEqual(
    { added: out.added, skipped: out.skipped, missing: out.missing },
    { added: 2, skipped: 0, missing: 0 },
  );
  assert.deepStrictEqual(urlsOf(out.groups[0]), [chUrl("Uno"), chUrl("dos")]);
  assert.deepStrictEqual(urlsOf(out.groups[1]), [chUrl("tres")]);
  assert.deepStrictEqual(tree, copy);
});

test("addChannelsToGroups cuenta repetidos y grupos inexistentes sin lanzar", () => {
  const { YouTubeGroupsEditor } = loadModules();
  const out = YouTubeGroupsEditor.addChannelsToGroups(twoGroupsTree(), [
    { groupId: "A", channel: { name: "uno", url: chUrl("uno") } },
    { groupId: "X", channel: { name: "Dos", url: chUrl("dos") } },
    { groupId: "B", channel: { name: "Tres", url: chUrl("tres") } },
    { groupId: "B", channel: { name: "Tres", url: chUrl("TRES") } },
  ]);
  assert.deepStrictEqual(
    { added: out.added, skipped: out.skipped, missing: out.missing },
    { added: 1, skipped: 2, missing: 1 },
  );
});

test("addChannelsToGroupsAndSave escribe una vez y se deshace con revertGroupsAndSave", async () => {
  const original = twoGroupsTree();
  const { YouTubeGroupsEditor, store, calls } = loadModules({
    youtubeGroups: { version: 1, groups: structuredClone(original) },
  });

  const none = await YouTubeGroupsEditor.addChannelsToGroupsAndSave([
    { groupId: "A", channel: { name: "Uno", url: chUrl("uno") } },
    { groupId: "X", channel: { name: "Dos", url: chUrl("dos") } },
  ]);
  assert.strictEqual(none.undo, null);
  assert.strictEqual(none.added, 0);
  assert.strictEqual(calls.set, 0);

  const done = await YouTubeGroupsEditor.addChannelsToGroupsAndSave([
    { groupId: "A", channel: { name: "Dos", url: chUrl("dos") } },
    { groupId: "B", channel: { name: "Tres", url: chUrl("tres") } },
  ]);
  assert.strictEqual(done.added, 2);
  assert.strictEqual(calls.set, 1);
  assert.deepStrictEqual(plain(done.undo.before), plain(original));
  assert.deepStrictEqual(
    plain(done.undo.after),
    plain(store.youtubeGroups.groups),
  );

  const undone = await YouTubeGroupsEditor.revertGroupsAndSave(done.undo);
  assert.strictEqual(undone.status, "restored");
  assert.deepStrictEqual(plain(store.youtubeGroups.groups), plain(original));

  const second = await YouTubeGroupsEditor.addChannelsToGroupsAndSave([
    { groupId: "A", channel: { name: "Dos", url: chUrl("dos") } },
  ]);
  store.youtubeGroups.groups[1].name = "Renombrado";
  const blocked = await YouTubeGroupsEditor.revertGroupsAndSave(second.undo);
  assert.strictEqual(blocked.status, "changed");
});

test("mergeGroups fusiona las palabras clave sin repetir", () => {
  const { YouTubeGroupsEditor } = loadModules();
  const build = (sourceWords, targetWords) => [
    node("a", [], sourceWords ? { keywords: sourceWords } : {}),
    node("b", [], targetWords ? { keywords: targetWords } : {}),
  ];

  const same = YouTubeGroupsEditor.mergeGroups(
    build(["jazz"], ["Blues", "JAZZ"]),
    "a",
    "b",
  );
  assert.deepStrictEqual(plain(same.groups[0].keywords), ["Blues", "JAZZ"]);

  const more = YouTubeGroupsEditor.mergeGroups(
    build(["soul"], ["Blues", "JAZZ"]),
    "a",
    "b",
  );
  assert.deepStrictEqual(plain(more.groups[0].keywords), [
    "Blues",
    "JAZZ",
    "soul",
  ]);

  const none = YouTubeGroupsEditor.mergeGroups(build(null, null), "a", "b");
  assert.strictEqual("keywords" in none.groups[0], false);
});

function namedNode(id, name, extra = {}) {
  return { ...node(id, [], extra), name };
}

test("sortSubgroups ordena la raíz sin distinguir mayúsculas ni acentos y con números naturales", () => {
  const { YouTubeGroupsEditor } = loadModules();
  const tree = [
    namedNode("g1", "beta"),
    namedNode("g2", "Álvaro"),
    namedNode("g3", "alba"),
    namedNode("g4", "Grupo 10"),
    namedNode("g5", "Grupo 2"),
  ];
  const copy = structuredClone(tree);

  const out = YouTubeGroupsEditor.sortSubgroups(tree, null);
  assert.strictEqual(out.changed, true);
  assert.deepStrictEqual(
    out.groups.map((group) => group.name),
    ["alba", "Álvaro", "beta", "Grupo 2", "Grupo 10"],
  );
  assert.deepStrictEqual(tree, copy);

  const ties = [namedNode("t1", "abc"), namedNode("t2", "ABC")];
  const tied = YouTubeGroupsEditor.sortSubgroups(ties, null);
  assert.deepStrictEqual(ids(tied.groups), ["t1", "t2"]);
  assert.strictEqual(tied.changed, false);
});

test("sortSubgroups: los subárboles viajan con su grupo y solo cambia la lista indicada", () => {
  const { YouTubeGroupsEditor } = loadModules();
  const tree = [
    node("c", [namedNode("c1", "z", { parentId: "c" })]),
    node("a", [
      namedNode("b2", "b2", { parentId: "a" }),
      namedNode("b1", "B1", { parentId: "a" }),
    ]),
  ];

  const root = YouTubeGroupsEditor.sortSubgroups(tree, null);
  assert.deepStrictEqual(ids(root.groups), ["a", "c"]);
  assert.deepStrictEqual(ids(root.groups[1].subgroups), ["c1"]);
  assert.deepStrictEqual(ids(root.groups[0].subgroups), ["b2", "b1"]);

  const sub = YouTubeGroupsEditor.sortSubgroups(tree, "a");
  assert.strictEqual(sub.changed, true);
  assert.deepStrictEqual(ids(sub.groups), ["c", "a"]);
  assert.deepStrictEqual(ids(sub.groups[1].subgroups), ["b1", "b2"]);

  const done = YouTubeGroupsEditor.sortSubgroups(tree, "c");
  assert.strictEqual(done.changed, false);
  assert.strictEqual(
    YouTubeGroupsEditor.sortSubgroups([node("x")], null).changed,
    false,
  );
  assert.strictEqual(
    YouTubeGroupsEditor.sortSubgroups([], null).changed,
    false,
  );
  assert.throws(
    () => YouTubeGroupsEditor.sortSubgroups(tree, "nope"),
    /No existe el grupo indicado/,
  );
});

test("sortChannels ordena por nombre, usa la URL sin nombre y conserva los campos", () => {
  const { YouTubeGroupsEditor } = loadModules();
  const tree = [
    node("a", [], {
      channels: [
        { name: "Zeta", url: chUrl("zeta"), extra: 1 },
        { name: "", url: "https://www.youtube.com/@bravo" },
        { name: "alfa", url: chUrl("alfa") },
      ],
    }),
  ];
  const copy = structuredClone(tree);

  const out = YouTubeGroupsEditor.sortChannels(tree, "a");
  assert.strictEqual(out.changed, true);
  assert.deepStrictEqual(
    out.groups[0].channels.map((channel) => channel.url),
    [chUrl("alfa"), "https://www.youtube.com/@bravo", chUrl("zeta")],
  );
  assert.strictEqual(out.groups[0].channels[2].extra, 1);
  assert.deepStrictEqual(tree, copy);

  assert.strictEqual(
    YouTubeGroupsEditor.sortChannels(out.groups, "a").changed,
    false,
  );
  assert.throws(
    () => YouTubeGroupsEditor.sortChannels(tree, "nope"),
    /No existe el grupo indicado/,
  );
});

test("sortChannels usa la URL si el nombre solo tiene espacios", () => {
  const { YouTubeGroupsEditor } = loadModules();
  const tree = [
    node("a", [], {
      channels: [
        { name: "Zeta", url: chUrl("zeta") },
        { name: "   ", url: "https://www.youtube.com/@alfa" },
      ],
    }),
  ];
  const out = YouTubeGroupsEditor.sortChannels(tree, "a");
  assert.strictEqual(out.changed, true);
  assert.deepStrictEqual(
    out.groups[0].channels.map((channel) => channel.url),
    ["https://www.youtube.com/@alfa", chUrl("zeta")],
  );
});

test("isSorted comprueba subgrupos y canales sin cambiar nada", () => {
  const { YouTubeGroupsEditor } = loadModules();
  const tree = [
    node("b", [node("b2"), node("b1")], {
      name: "beta",
      channels: [
        { name: "Zeta", url: chUrl("zeta") },
        { name: "alfa", url: chUrl("alfa") },
      ],
    }),
    node("a", [], { name: "Alfa" }),
  ];
  const copy = structuredClone(tree);
  assert.strictEqual(
    YouTubeGroupsEditor.isSorted(tree, null, "subgroups"),
    false,
  );
  assert.strictEqual(
    YouTubeGroupsEditor.isSorted(tree, "b", "channels"),
    false,
  );
  assert.strictEqual(YouTubeGroupsEditor.isSorted(tree, "a", "channels"), true);
  assert.strictEqual(
    YouTubeGroupsEditor.isSorted(tree, "a", "subgroups"),
    true,
  );
  assert.strictEqual(
    YouTubeGroupsEditor.isSorted(tree, "nope", "channels"),
    true,
  );
  const sorted = YouTubeGroupsEditor.sortSubgroups(tree, null).groups;
  assert.strictEqual(
    YouTubeGroupsEditor.isSorted(sorted, null, "subgroups"),
    true,
  );
  assert.deepStrictEqual(tree, copy);
});

function mergeTree() {
  return [
    node(
      "a",
      [
        node("a1", [], {
          parentId: "a",
          channels: [{ name: "Uno", url: chUrl("uno") }],
        }),
        node("a2", [node("a2a", [], { parentId: "a2" })], { parentId: "a" }),
      ],
      {
        channels: [
          { name: "Foo", url: chUrl("Foo") },
          { name: "Bar", url: chUrl("bar") },
          { name: "Bar otra vez", url: chUrl("BAR") },
        ],
      },
    ),
    node("b", [node("b1", [], { parentId: "b" })], {
      name: "Beta",
      icon: "star",
      color: "#123456",
      channels: [
        { name: "Y", url: chUrl("y") },
        { name: "foo", url: chUrl("foo") },
      ],
    }),
    node("c"),
  ];
}

test("getMergeTargets excluye el origen y sus descendientes", () => {
  const { YouTubeGroupsEditor } = loadModules();
  const tree = mergeTree();
  const toA = YouTubeGroupsEditor.getMergeTargets(tree, "a");
  assert.deepStrictEqual(
    plain(toA.map((target) => [target.id, target.level])),
    [
      ["b", 0],
      ["b1", 1],
      ["c", 0],
    ],
  );
  assert.strictEqual(toA[0].name, "Beta");

  const toA1 = YouTubeGroupsEditor.getMergeTargets(tree, "a1");
  assert.deepStrictEqual(plain(toA1.map((target) => target.id)), [
    "a",
    "a2",
    "a2a",
    "b",
    "b1",
    "c",
  ]);
  assert.strictEqual(
    YouTubeGroupsEditor.getMergeTargets(tree, "nope").length,
    0,
  );
});

test("mergeGroups funde el origen en el destino sin duplicar canales", () => {
  const { YouTubeGroupsEditor } = loadModules();
  const tree = mergeTree();
  const copy = structuredClone(tree);

  const out = YouTubeGroupsEditor.mergeGroups(tree, "a", "b");
  assert.deepStrictEqual(ids(out.groups), ["b", "c"]);
  const b = out.groups[0];
  assert.deepStrictEqual(urlsOf(b), [chUrl("y"), chUrl("foo"), chUrl("bar")]);
  assert.strictEqual(out.added, 1);
  assert.strictEqual(out.skipped, 2);
  assert.strictEqual(out.movedSubgroups, 2);
  assert.deepStrictEqual(ids(b.subgroups), ["b1", "a1", "a2"]);
  assert.strictEqual(b.subgroups[1].parentId, "b");
  assert.strictEqual(b.subgroups[1].type, "subgroup");
  assert.strictEqual(b.subgroups[2].subgroups[0].parentId, "a2");
  assert.strictEqual(b.name, "Beta");
  assert.strictEqual(b.icon, "star");
  assert.strictEqual(b.color, "#123456");
  assert.deepStrictEqual(plain(tree), plain(copy));
});

test("mergeGroups admite fundir un subgrupo en su padre o en la raíz", () => {
  const { YouTubeGroupsEditor } = loadModules();
  const tree = mergeTree();

  const intoParent = YouTubeGroupsEditor.mergeGroups(tree, "a1", "a");
  const a = intoParent.groups[0];
  assert.deepStrictEqual(ids(a.subgroups), ["a2"]);
  assert.deepStrictEqual(urlsOf(a), [
    chUrl("Foo"),
    chUrl("bar"),
    chUrl("BAR"),
    chUrl("uno"),
  ]);
  assert.strictEqual(intoParent.movedSubgroups, 0);

  const intoRoot = YouTubeGroupsEditor.mergeGroups(tree, "a2", "c");
  assert.deepStrictEqual(ids(intoRoot.groups), ["a", "b", "c"]);
  const c = intoRoot.groups[2];
  assert.deepStrictEqual(ids(c.subgroups), ["a2a"]);
  assert.strictEqual(c.subgroups[0].parentId, "c");
  assert.strictEqual(c.subgroups[0].type, "subgroup");
  assert.deepStrictEqual(ids(intoRoot.groups[0].subgroups), ["a1"]);
});

test("mergeGroups lanza con ids inexistentes, el mismo grupo o un descendiente", () => {
  const { YouTubeGroupsEditor } = loadModules();
  const tree = mergeTree();
  assert.throws(() => YouTubeGroupsEditor.mergeGroups(tree, "nope", "b"));
  assert.throws(() => YouTubeGroupsEditor.mergeGroups(tree, "a", "nope"));
  assert.throws(() => YouTubeGroupsEditor.mergeGroups(tree, "a", "a"));
  assert.throws(() => YouTubeGroupsEditor.mergeGroups(tree, "a", "a2a"));
});

test("revertGroups: restored, already y changed según el árbol actual", () => {
  const { YouTubeGroupsEditor } = loadModules();
  const before = mergeTree();
  const after = YouTubeGroupsEditor.mergeGroups(before, "a", "b").groups;
  const undo = { before, after };

  const restored = YouTubeGroupsEditor.revertGroups(after, undo);
  assert.strictEqual(restored.status, "restored");
  assert.deepStrictEqual(plain(restored.groups), plain(before));

  assert.strictEqual(
    YouTubeGroupsEditor.revertGroups(before, undo).status,
    "already",
  );

  const other = structuredClone(after);
  other[0].name = "Otro";
  const changed = YouTubeGroupsEditor.revertGroups(other, undo);
  assert.strictEqual(changed.status, "changed");
  assert.deepStrictEqual(plain(changed.groups), plain(other));
});

test("mergeGroupsAndSave y revertGroupsAndSave guardan una vez y deshacen sin pisar", async () => {
  const original = mergeTree();
  const { YouTubeGroupsEditor, store, calls } = loadModules({
    youtubeGroups: { version: 1, groups: structuredClone(original) },
  });

  await assert.rejects(YouTubeGroupsEditor.mergeGroupsAndSave("a", "a2a"));
  assert.strictEqual(calls.set, 0);

  const merged = await YouTubeGroupsEditor.mergeGroupsAndSave("a", "b");
  assert.strictEqual(calls.set, 1);
  assert.deepStrictEqual(
    plain(merged.undo.after),
    plain(store.youtubeGroups.groups),
  );
  assert.deepStrictEqual(plain(merged.undo.before), plain(original));
  assert.strictEqual(merged.movedSubgroups, 2);

  const undone = await YouTubeGroupsEditor.revertGroupsAndSave(merged.undo);
  assert.strictEqual(undone.status, "restored");
  assert.strictEqual(calls.set, 2);
  assert.deepStrictEqual(plain(store.youtubeGroups.groups), plain(original));

  const again = await YouTubeGroupsEditor.revertGroupsAndSave(merged.undo);
  assert.strictEqual(again.status, "already");
  assert.strictEqual(calls.set, 2);

  const second = await YouTubeGroupsEditor.mergeGroupsAndSave("a", "b");
  store.youtubeGroups.groups[1].name = "Renombrado";
  const blocked = await YouTubeGroupsEditor.revertGroupsAndSave(second.undo);
  assert.strictEqual(blocked.status, "changed");
  assert.strictEqual(calls.set, 3);
});

test("sortSubgroupsAndSave y sortChannelsAndSave no escriben si ya está ordenado", async () => {
  const tree = [
    node("z", [], { name: "Zeta" }),
    node("a", [], {
      name: "Alfa",
      channels: [
        { name: "b", url: chUrl("b") },
        { name: "a", url: chUrl("a") },
      ],
    }),
  ];
  const { YouTubeGroupsEditor, store, calls } = loadModules({
    youtubeGroups: { version: 1, groups: tree },
  });

  const sortedRoot = await YouTubeGroupsEditor.sortSubgroupsAndSave(null);
  assert.strictEqual(sortedRoot.changed, true);
  assert.strictEqual(calls.set, 1);
  assert.deepStrictEqual(ids(store.youtubeGroups.groups), ["a", "z"]);
  assert.deepStrictEqual(
    plain(sortedRoot.undo.after),
    plain(store.youtubeGroups.groups),
  );

  const noRoot = await YouTubeGroupsEditor.sortSubgroupsAndSave(null);
  assert.deepStrictEqual(plain(noRoot), { changed: false, undo: null });
  assert.strictEqual(calls.set, 1);

  const sortedChannels = await YouTubeGroupsEditor.sortChannelsAndSave("a");
  assert.strictEqual(sortedChannels.changed, true);
  assert.strictEqual(calls.set, 2);
  const noChannels = await YouTubeGroupsEditor.sortChannelsAndSave("a");
  assert.strictEqual(noChannels.undo, null);
  assert.strictEqual(calls.set, 2);
  await assert.rejects(YouTubeGroupsEditor.sortChannelsAndSave("nope"));
  await assert.rejects(YouTubeGroupsEditor.sortSubgroupsAndSave("nope"));
  assert.strictEqual(calls.set, 2);
});

test("fusionar y ordenar solapados no se pisan", async () => {
  const { YouTubeGroupsEditor, store } = loadModules(
    {
      youtubeGroups: {
        version: 1,
        groups: [
          node("c", [], { name: "Gamma" }),
          node("b", [], { name: "Beta" }),
          node("a", [], { name: "Alfa" }),
        ],
      },
    },
    { latencyMs: 5 },
  );

  await Promise.all([
    YouTubeGroupsEditor.mergeGroupsAndSave("c", "a"),
    YouTubeGroupsEditor.sortSubgroupsAndSave(null),
  ]);

  assert.deepStrictEqual(ids(store.youtubeGroups.groups), ["a", "b"]);
});

function channelTree() {
  return [
    node(
      "a",
      [
        node("a1", [], {
          parentId: "a",
          channels: [
            { name: "Dos", url: "https://www.youtube.com/@dos" },
            { name: "Uno", url: "https://www.youtube.com/@Uno" },
          ],
        }),
      ],
      {
        channels: [
          { name: "Uno", url: "https://www.youtube.com/@Uno" },
          { name: "Tres", url: "https://www.youtube.com/@tres" },
        ],
      },
    ),
    node("b", [], {
      channels: [{ name: "Cuatro", url: "https://www.youtube.com/@cuatro" }],
    }),
  ];
}

test("removeChannelsEverywhere quita el canal de grupos y subgrupos sin mutar", () => {
  const { YouTubeGroupsEditor } = loadModules();
  const tree = channelTree();
  const before = structuredClone(tree);

  const result = YouTubeGroupsEditor.removeChannelsEverywhere(tree, [
    "https://www.youtube.com/@uno",
  ]);

  assert.strictEqual(result.removedChannels, 1);
  assert.strictEqual(result.removedEntries, 2);
  assert.deepStrictEqual(
    result.groups[0].channels.map((c) => c.name),
    ["Tres"],
  );
  assert.deepStrictEqual(
    result.groups[0].subgroups[0].channels.map((c) => c.name),
    ["Dos"],
  );
  assert.deepStrictEqual(plain(result.groups[1]), plain(before[1]));
  assert.deepStrictEqual(plain(tree), plain(before));

  const none = YouTubeGroupsEditor.removeChannelsEverywhere(tree, [
    "https://www.youtube.com/@nadie",
  ]);
  assert.strictEqual(none.removedEntries, 0);
  assert.deepStrictEqual(plain(none.groups), plain(before));
});

test("removeChannelsEverywhereAndSave escribe una vez, no escribe sin cambio y se deshace", async () => {
  const original = channelTree();
  const { YouTubeGroupsEditor, store, calls } = loadModules({
    youtubeGroups: { version: 1, groups: structuredClone(original) },
  });

  const absent = await YouTubeGroupsEditor.removeChannelsEverywhereAndSave([
    "https://www.youtube.com/@nadie",
  ]);
  assert.strictEqual(absent.removedEntries, 0);
  assert.strictEqual(absent.undo, null);
  assert.strictEqual(calls.set, 0);

  const done = await YouTubeGroupsEditor.removeChannelsEverywhereAndSave([
    "https://www.youtube.com/@uno",
  ]);
  assert.strictEqual(done.removedChannels, 1);
  assert.strictEqual(done.removedEntries, 2);
  assert.strictEqual(calls.set, 1);
  assert.deepStrictEqual(
    plain(done.undo.after),
    plain(store.youtubeGroups.groups),
  );

  const undone = await YouTubeGroupsEditor.revertGroupsAndSave(done.undo);
  assert.strictEqual(undone.status, "restored");
  assert.deepStrictEqual(plain(store.youtubeGroups.groups), plain(original));

  const again = await YouTubeGroupsEditor.removeChannelsEverywhereAndSave([
    "https://www.youtube.com/@uno",
  ]);
  await YouTubeGroupsEditor.removeChannelsEverywhereAndSave([
    "https://www.youtube.com/@tres",
  ]);
  const blocked = await YouTubeGroupsEditor.revertGroupsAndSave(again.undo);
  assert.strictEqual(blocked.status, "changed");
});
