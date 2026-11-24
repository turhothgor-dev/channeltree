// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

// ADR 0047: separador bajo el título y buscadores por pestaña.
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

function declaration(body, property) {
  const match = body.match(new RegExp(`(?:^|;|\\s)${property}:\\s*([^;]+)`));
  return match ? match[1].trim() : null;
}

const RULES = parseRules("options/options.css");
const rule = (selector) => RULES.find((r) => r.selector === selector);

test("separador: el h1 de la cabecera tiene la misma línea que las pestañas", () => {
  const title = rule(".options__header h1");
  const tabs = rule(".options__tabs");
  assert.ok(title, "regla del h1");
  assert.ok(tabs, "regla de las pestañas");
  const tabsBorder = declaration(tabs.body, "border-bottom");
  assert.ok(tabsBorder);
  assert.strictEqual(declaration(title.body, "border-bottom"), tabsBorder);
  assert.ok(declaration(title.body, "padding-bottom"));
});

test("buscadores: el campo comparte la regla de .options__input y no hay [hidden]", () => {
  assert.strictEqual(rule(".options__search[hidden]"), undefined);
  const shared = rule(".options__input, .options__search input");
  assert.ok(shared, "regla compartida");
  assert.strictEqual(declaration(shared.body, "font"), "inherit");
  assert.strictEqual(declaration(shared.body, "border-radius"), "0.375rem");
  const search = rule(".options__search");
  assert.ok(search);
  assert.strictEqual(declaration(search.body, "margin-left"), null);
});

test("títulos: las secciones de Canales y de Datos comparten etiqueta y regla", () => {
  const shared = RULES.find(
    (r) =>
      r.selector.includes(".options__section h2") &&
      r.selector.includes(".options__list-title"),
  );
  assert.ok(shared, "regla compartida");
  assert.strictEqual(declaration(shared.body, "font-size"), "1.1rem");
  assert.strictEqual(declaration(shared.body, "margin"), "0 0 0.5rem");
  const pager = fs.readFileSync(path.join(ROOT, "options/pager.js"), "utf8");
  assert.match(pager, /el\("h2", "options__list-title"\)/);
  const backup = fs.readFileSync(
    path.join(ROOT, "options/backup-section.js"),
    "utf8",
  );
  assert.match(backup, /el\("h2", "options__channels-title"/);
  assert.strictEqual(rule(".options__list-title"), undefined);
});

test("botones: estilo base con radio y el hover del acento no lo cambia", () => {
  const base = rule(":where(button)");
  assert.ok(base, "regla base de baja especificidad");
  assert.strictEqual(declaration(base.body, "border-radius"), "0.375rem");
  assert.strictEqual(declaration(base.body, "font"), "inherit");
  assert.ok(declaration(base.body, "border"));
  assert.ok(declaration(base.body, "background"));
  assert.ok(declaration(base.body, "color"));
  const hover = RULES.find((r) =>
    r.selector
      .split(",")
      .some((s) => s.trim() === "button:not(:disabled):hover"),
  );
  assert.ok(hover, "regla de hover con acento");
  assert.strictEqual(declaration(hover.body, "border-radius"), null);
  assert.strictEqual(declaration(hover.body, "border"), null);
});

test("separador: ninguna regla html[dark] redefine el borde del h1", () => {
  const dark = RULES.filter(
    (r) =>
      r.selector.includes("html[dark]") &&
      r.selector.includes(".options__header h1"),
  );
  for (const r of dark) {
    assert.strictEqual(declaration(r.body, "border-bottom"), null);
  }
});
