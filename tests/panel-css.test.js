// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

// Plan 6-31 (ADR 0045): el menú nunca es más alto que la ventana y solo
// se desplaza el panel activo.
const ROOT = path.join(__dirname, "..");
const SOURCE = fs
  .readFileSync(path.join(ROOT, "ui/panel.css"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "");

const RULES = SOURCE.split("}")
  .map((chunk) => chunk.split("{"))
  .filter((parts) => parts.length >= 2)
  .map((parts) => ({
    selector: parts[parts.length - 2].replace(/\s+/g, " ").trim(),
    body: parts[parts.length - 1].replace(/\s+/g, " ").trim(),
  }));
const rule = (selector) => RULES.find((r) => r.selector === selector);
const prop = (r, name) => {
  const match = r.body.match(new RegExp(`(?:^|;|\\s)${name}:\\s*([^;]+)`));
  return match ? match[1].trim() : null;
};

test("el menú es una columna flex limitada a la ventana y sin scroll propio", () => {
  const menu = rule("#youtube-groups-menu");
  assert.ok(menu, "regla del menú");
  assert.strictEqual(prop(menu, "display"), "flex");
  assert.strictEqual(prop(menu, "flex-direction"), "column");
  assert.strictEqual(prop(menu, "max-height"), "calc(100vh - 16px)");
  assert.strictEqual(prop(menu, "overflow"), "hidden");
  const hidden = rule("#youtube-groups-menu[hidden]");
  assert.ok(hidden, "regla [hidden]");
  assert.strictEqual(prop(hidden, "display"), "none");
});

test("la cabecera no se encoge y el panel activo es el que se desplaza", () => {
  assert.strictEqual(
    prop(rule(".youtube-groups__menu-header"), "flex"),
    "none",
  );
  const panel = rule(".youtube-groups__menu-panel");
  assert.strictEqual(prop(panel, "overflow-y"), "auto");
  assert.strictEqual(prop(panel, "min-height"), "0");
});

test("ninguna regla de panel.css nombra summary", () => {
  assert.ok(!RULES.some((r) => /\bsummary\b/.test(r.selector)));
});

test("las pestañas del menú tienen las esquinas superiores redondeadas", () => {
  const tab = rule(".youtube-groups__menu-tab");
  assert.ok(tab, "regla de la pestaña");
  assert.strictEqual(prop(tab, "border-radius"), "6px 6px 0 0");
});
