// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

// ADR 0046: clase común de botón de texto del menú de opciones.
const ROOT = path.join(__dirname, "..");
const TEXT = ".youtube-groups__text-button";

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

const BUTTONS = parseRules("ui/buttons.css");
const rule = (selector) => BUTTONS.find((r) => r.selector === selector);

test("la clase común de texto define forma, tamaño y estados", () => {
  const base = rule(TEXT);
  assert.ok(base, "regla base");
  for (const decl of [
    "height: var(--yg-text-button-height, 36px)",
    "border-radius: 10px",
    "border: 0",
    "font-family: inherit",
    "font-weight: 500",
    "line-height: 1",
    "text-decoration: none",
    "background: var(--yt-spec-badge-chip-background",
  ]) {
    assert.ok(base.body.includes(decl), decl);
  }
  assert.ok(!/(^|[ ;])margin\s*:/.test(base.body), "sin margin");
  assert.ok(rule(`${TEXT}--small`).body.includes("28px"));
  assert.ok(rule(`${TEXT}[hidden]`).body.includes("display: none"));
  assert.ok(rule(`${TEXT}:disabled`));
  assert.ok(
    rule(`${TEXT}:not(:disabled):hover`).body.includes("var(--yg-accent"),
  );
  assert.ok(rule(`${TEXT}:focus-visible`));
  assert.ok(rule(`html[dark] ${TEXT}`));
  assert.ok(rule(`html[dark] ${TEXT}:focus-visible`));
});

test("el campo de nombre de lista y el modal en oscuro encajan con los botones", () => {
  const panel = parseRules("ui/panel.css");
  const find = (selector) => panel.find((r) => r.selector === selector);
  const input = find(".youtube-groups__playlist-input");
  for (const decl of [
    "height: 36px",
    "border-radius: 10px",
    "font-size: 14px",
  ]) {
    assert.ok(input.body.includes(decl), decl);
  }
  const modal = find("html[dark] .youtube-groups__channel-list-content");
  assert.ok(modal && modal.body.includes("background"));
});

test("selectores y color de Filtros y Ajustes miden 28 px con radio 10 px", () => {
  const panel = parseRules("ui/panel.css");
  const find = (selector) => panel.find((r) => r.selector === selector);
  const select = find(".youtube-groups__setting select");
  const color = find(".youtube-groups__settings-color");
  for (const decl of ["height: 28px", "border-radius: 10px"]) {
    assert.ok(select.body.includes(decl), decl);
    assert.ok(color.body.includes(decl), decl);
  }
  assert.ok(select.body.includes("font-size: 13px"));
});

test("ninguna regla del menú redefine la forma de los botones de texto", () => {
  const hooks = [
    "filters-reset",
    "play-visible",
    "playlist-create-button",
    "playlist-clear-button",
    "playlist-remove-button",
    "playlist-play",
    "settings-color-reset",
    "settings-refresh-now",
    "settings-refresh-account",
    "shortcuts-change",
  ].map((name) => `.youtube-groups__${name}`);
  const forbidden =
    /(^|[ ;])(width|height|padding[a-z-]*|border[a-z-]*|background[a-z-]*|font[a-z-]*|line-height)\s*:/;
  for (const file of fs.readdirSync(path.join(ROOT, "ui"))) {
    if (!file.endsWith(".css")) continue;
    for (const { selector, body } of parseRules(`ui/${file}`)) {
      const names = hooks.some((hook) =>
        new RegExp(`${hook}(?![\\w-])`).test(selector),
      );
      const nested =
        selector !== TEXT &&
        /\.youtube-groups__text-button(?![\w-])/.test(selector);
      if (!names && !nested) continue;
      if (file === "buttons.css" && nested) continue;
      assert.ok(!forbidden.test(body), `${file}: ${selector}`);
    }
  }
});
