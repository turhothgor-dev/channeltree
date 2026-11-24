// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadModules, plain } = require("./helpers/load-modules");

const { YouTubeGroupsIcons: Icons, YouTubeGroupsFxemoji: Fxemoji } =
  loadModules();

test("los ids de ICON_SET y COLOR_SET son únicos y las etiquetas no están vacías", () => {
  const iconIds = Icons.ICON_SET.map((icon) => icon.id);
  assert.equal(new Set(iconIds).size, iconIds.length);
  for (const icon of Icons.ICON_SET) {
    assert.ok(icon.label.length > 0, `etiqueta vacía en ${icon.id}`);
  }
  const colorIds = Icons.COLOR_SET.map((color) => color.id);
  assert.equal(new Set(colorIds).size, colorIds.length);
});

test("todo id de ICON_SET tiene gráfico", () => {
  for (const icon of Icons.ICON_SET) {
    const graphic = Icons.getIconGraphic(icon.id);
    assert.ok(graphic, `${icon.id} sin gráfico`);
    assert.ok(graphic.viewBox.length > 0, `${icon.id} sin viewBox`);
    assert.ok(graphic.shapes.length > 0, `${icon.id} sin formas`);
  }
});

test("el codepoint de cada entrada de ICON_SET coincide con el de YouTubeGroupsFxemoji.ICONS", () => {
  for (const icon of Icons.ICON_SET) {
    const data = Fxemoji.ICONS[icon.id];
    assert.ok(data, `${icon.id} sin datos de fxemoji`);
    assert.equal(icon.codepoint, data.codepoint, icon.id);
  }
});

test("los ids guardados por la versión anterior siguen siendo válidos", () => {
  const storedIds = [
    "tech",
    "music",
    "news",
    "gaming",
    "sports",
    "education",
    "food",
    "travel",
    "art",
    "science",
    "movie",
    "default",
  ];
  for (const id of storedIds) {
    assert.equal(Icons.isValidIconId(id), true, id);
    assert.notEqual(Icons.getIconGraphic(id), null, id);
  }
});

test("isValidColor acepta vacío y #rrggbb, y rechaza el resto", () => {
  for (const valid of ["", "#2196F3", "#abcdef"]) {
    assert.equal(Icons.isValidColor(valid), true, valid);
  }
  for (const invalid of ["#abc", "2196F3", "#12345g", "red"]) {
    assert.equal(Icons.isValidColor(invalid), false, invalid);
  }
});

test("todos los colores de COLOR_SET son válidos", () => {
  for (const color of Icons.COLOR_SET) {
    assert.equal(Icons.isValidColor(color.hex), true, color.id);
  }
});

test("isValidIconId y getIconGraphic", () => {
  assert.equal(Icons.isValidIconId(""), true);
  assert.equal(Icons.isValidIconId("tech"), true);
  assert.equal(Icons.isValidIconId("nope"), false);
  assert.equal(Icons.getIconGraphic("nope"), null);
});

test("getUiIconPath devuelve rutas de interfaz sin mezclarlas con ICON_SET", () => {
  const ids = [
    "eye",
    "check",
    "playlist-add",
    "settings",
    "recycle",
    "add",
    "edit",
    "arrow-up",
    "arrow-down",
    "palette",
    "delete",
    "swap",
    "ungrouped",
    "merge",
    "sort-az",
    "eye-off",
  ];
  for (const id of ids) {
    const path = Icons.getUiIconPath(id);
    assert.equal(typeof path, "string", id);
    assert.ok(path.length > 0, id);
    assert.match(path, /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/, id);
    assert.equal(Icons.isValidIconId(id), false, id);
    assert.equal(Icons.getIconGraphic(id), null, id);
  }
  assert.equal(Icons.getUiIconPath("x"), null);
  assert.equal(Icons.getUiIconPath("play"), null);
  const iconIds = new Set(Icons.ICON_SET.map((icon) => icon.id));
  for (const id of ids) {
    assert.equal(iconIds.has(id), false, `${id} está en ICON_SET`);
  }
});

test("cada icono tiene una categoría de ICON_CATEGORIES y ninguna pasa de 24", () => {
  const categoryIds = Icons.ICON_CATEGORIES.map((category) => category.id);
  assert.deepEqual(plain(categoryIds), ["general", "media", "sports"]);
  for (const category of Icons.ICON_CATEGORIES) {
    assert.ok(category.label.length > 0, `etiqueta vacía en ${category.id}`);
  }
  for (const icon of Icons.ICON_SET) {
    assert.ok(categoryIds.includes(icon.category), `${icon.id}: categoría`);
  }
  for (const id of categoryIds) {
    const count = Icons.ICON_SET.filter((icon) => icon.category === id).length;
    assert.ok(count <= 24, `${id} tiene ${count} iconos`);
  }
});

test("el orden de ICON_SET por categoría coincide con la lista esperada", () => {
  const expected = {
    general: [
      "tech",
      "gaming",
      "music",
      "movie",
      "education",
      "science",
      "art",
      "food",
      "travel",
      "leisure",
      "humor",
      "cars",
      "nature",
      "animals",
      "home",
      "diy",
      "fashion",
      "health",
      "books",
      "camping",
      "adventure",
      "agriculture",
      "default",
    ],
    media: [
      "news",
      "videopodcast",
      "interviews",
      "podcast",
      "radio",
      "television",
      "live",
      "vlogs",
      "photography",
      "social",
      "geopolitics",
      "politics",
      "elections",
      "opinion",
      "history",
      "economy",
      "data",
      "money",
      "finance",
      "business",
      "astronomy",
      "mystery",
      "research",
    ],
    sports: [
      "sports",
      "mma",
      "basketball",
      "american-football",
      "rugby",
      "baseball",
      "golf",
      "billiards",
      "darts",
      "gym",
      "ski",
      "trophy",
      "medal",
      "running",
      "athletics",
      "cycling",
      "swimming",
      "surf",
      "tennis",
      "motorsport",
    ],
  };
  for (const [category, ids] of Object.entries(expected)) {
    const actual = Icons.ICON_SET.filter(
      (icon) => icon.category === category,
    ).map((icon) => icon.id);
    assert.deepEqual(plain(actual), ids, category);
  }
});

test("getIconCategory devuelve la categoría o general por defecto", () => {
  assert.equal(Icons.getIconCategory("news"), "media");
  assert.equal(Icons.getIconCategory("sports"), "sports");
  assert.equal(Icons.getIconCategory("tech"), "general");
  assert.equal(Icons.getIconCategory("mystery"), "media");
  assert.equal(Icons.getIconCategory("camping"), "general");
  assert.equal(Icons.getIconCategory(""), "general");
  assert.equal(Icons.getIconCategory("nope"), "general");
});

test("getContrastTextColor elige el texto de mayor contraste WCAG", () => {
  assert.equal(Icons.getContrastTextColor("#9C27B0"), "#ffffff");
  assert.equal(Icons.getContrastTextColor("#3F51B5"), "#ffffff");
  assert.equal(Icons.getContrastTextColor("#FF9800"), "#0f0f0f");
  assert.equal(Icons.getContrastTextColor("#2196F3"), "#0f0f0f");
});
