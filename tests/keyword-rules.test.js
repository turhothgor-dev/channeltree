// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadModules, plain } = require("./helpers/load-modules");

const { YouTubeGroupsKeywordRules: Rules } = loadModules();

/**
 * Crea un grupo mínimo para los tests.
 * @param {string} id - Id del grupo.
 * @param {string} name - Nombre.
 * @param {*} keywords - Palabras clave (sin validar).
 * @param {Array<Object>} [subgroups] - Subgrupos.
 * @returns {Object} Grupo.
 */
function group(id, name, keywords, subgroups = []) {
  const result = { id, name, channels: [], subgroups };
  if (keywords !== undefined) {
    result.keywords = keywords;
  }
  return result;
}

/**
 * Sugerencia para un nombre con un árbol dado.
 * @param {string} name - Nombre del canal.
 * @param {Array<Object>} groups - Árbol.
 * @returns {Object|null} Sugerencia.
 */
function suggest(name, groups) {
  return plain(Rules.suggestGroup(name, Rules.collectRules(groups)));
}

test("tokenize pliega y parte por lo que no son letras ni números", () => {
  assert.deepEqual(plain(Rules.tokenize("¡Lo-Fi  Beats!")), [
    "lo",
    "fi",
    "beats",
  ]);
  assert.deepEqual(plain(Rules.tokenize("!!!")), []);
});

test("matchesKeyword busca la secuencia seguida de palabras completas", () => {
  const match = (name, keyword) =>
    Rules.matchesKeyword(Rules.tokenize(name), Rules.tokenize(keyword));
  assert.equal(match("MUSICA en directo", "Música"), true);
  assert.equal(match("Música Clásica", "musica"), true);
  assert.equal(match("Smarter Every Day", "art"), false);
  assert.equal(match("Lo Fi Beats", "lo-fi"), true);
  assert.equal(match("Lofi Girl", "lo-fi"), false);
  assert.equal(match("Hop Hip", "hip hop"), false);
  assert.equal(Rules.matchesKeyword(["a"], []), false);
});

test("gana la palabra clave con más palabras y, a igualdad, la más larga", () => {
  const tree = [
    group("a", "A", ["jazz"]),
    group("b", "B", ["smooth jazz"], []),
  ];
  assert.equal(suggest("Smooth Jazz Radio", tree).groupId, "b");
  assert.equal(suggest("Jazz Club", tree).groupId, "a");
  const longer = [group("a", "A", ["rock"]), group("b", "B", ["rockabilly"])];
  assert.equal(suggest("rock rockabilly", longer).groupId, "b");
});

test("a igualdad gana el primero en preorden", () => {
  const tree = [
    group("a", "A", [], [group("a1", "A1", ["jazz"])]),
    group("b", "B", ["jazz"]),
  ];
  assert.equal(suggest("Jazz Club", tree).groupId, "a1");
});

test("las palabras de un grupo no se heredan en sus subgrupos", () => {
  const tree = [group("a", "A", ["jazz"], [group("a1", "A1")])];
  const rules = Rules.collectRules(tree);
  assert.equal(rules.length, 1);
  assert.equal(suggest("Jazz Club", tree).groupId, "a");
});

test("groupPath de un subgrupo es Padre › Hijo y se devuelve la palabra", () => {
  const tree = [
    group("p", "Música", undefined, [group("h", "Lo-fi", ["lofi beats"])]),
  ];
  assert.deepEqual(suggest("Lofi Beats 24/7", tree), {
    groupId: "h",
    groupPath: "Música › Lo-fi",
    keyword: "lofi beats",
  });
});

test("un keywords no válido se ignora", () => {
  const tree = [group("a", "A", "x"), group("b", "B", [3, "!!!", "ok"])];
  const rules = plain(Rules.collectRules(tree));
  assert.equal(rules.length, 1);
  assert.equal(rules[0].groupId, "b");
  assert.equal(suggest("Sin nada", tree), null);
});

test("suggestForSubscriptions solo devuelve claves con sugerencia", () => {
  const tree = [group("a", "A", ["jazz"])];
  const items = [
    { key: "k1", name: "Jazz Club", url: "https://www.youtube.com/@jazz" },
    { key: "k2", name: "Cocina Fácil", url: "https://www.youtube.com/@cocina" },
  ];
  const map = Rules.suggestForSubscriptions(items, tree);
  assert.deepEqual([...map.keys()], ["k1"]);
  assert.equal(map.get("k1").groupId, "a");
});

test("suggestForSubscriptions usa las reglas que recibe como tercer argumento", () => {
  const items = [
    { key: "k1", name: "Jazz Club", url: "https://www.youtube.com/@jazz" },
    { key: "k2", name: "Rock Radio", url: "https://www.youtube.com/@rock" },
  ];
  const otherRules = Rules.collectRules([group("b", "B", ["rock"])]);
  const map = Rules.suggestForSubscriptions(items, [], otherRules);
  assert.deepEqual([...map.keys()], ["k2"]);
  assert.equal(map.get("k2").groupId, "b");
});
