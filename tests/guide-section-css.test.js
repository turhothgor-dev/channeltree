// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

// Plan 6-31 (ADR 0044): barra a la derecha y rótulo de navegación resaltado.
const ROOT = path.join(__dirname, "..");

function parseRules(relativePath) {
  return fs
    .readFileSync(path.join(ROOT, relativePath), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("}")
    .map((chunk) => chunk.split("{"))
    .filter((parts) => parts.length >= 2)
    .map((parts) => ({
      selector: parts[parts.length - 2].replace(/\s+/g, " ").trim(),
      body: parts[parts.length - 1].replace(/\s+/g, " ").trim(),
    }));
}

const RULES = parseRules("ui/guide-section.css");
const rule = (selector) => RULES.find((r) => r.selector === selector);
const prop = (r, name) => {
  const match = r.body.match(new RegExp(`(?:^|;|\\s)${name}:\\s*([^;]+)`));
  return match ? match[1].trim() : null;
};
const px = (value) => parseFloat(value);

test("la barra de botones de la guía va a la derecha con 8 px de separación", () => {
  const toolbar = rule(".youtube-groups__guide-toolbar");
  assert.ok(toolbar, "regla de la barra");
  assert.strictEqual(prop(toolbar, "justify-content"), "flex-end");
  assert.strictEqual(prop(toolbar, "gap"), "8px");
});

test("el rótulo de navegación pesa 600 a 15 px, entre las filas y el encabezado", () => {
  const title = rule(".youtube-groups__guide-nav-title");
  const item = rule(".youtube-groups__guide-item");
  const heading = rule(".youtube-groups__guide-heading");
  assert.ok(
    title && item && heading,
    "reglas del rótulo, la fila y el encabezado",
  );
  assert.strictEqual(prop(title, "font-size"), "15px");
  assert.strictEqual(prop(title, "font-weight"), "600");
  assert.ok(px(prop(title, "font-size")) > px(prop(item, "font-size")));
  assert.ok(px(prop(title, "font-size")) < px(prop(heading, "font-size")));
  assert.ok(px(prop(title, "font-weight")) < px(prop(heading, "font-weight")));
});

test("el rótulo de navegación tiene color en tema oscuro", () => {
  const dark = RULES.find(
    (r) =>
      r.selector
        .split(",")
        .map((s) => s.trim())
        .includes("html[dark] .youtube-groups__guide-nav-title") &&
      prop(r, "color"),
  );
  assert.ok(dark, "variante html[dark] con color");
});
