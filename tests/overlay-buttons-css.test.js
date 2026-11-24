// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { loadDom } = require("./helpers/load-dom");
const { SUBSCRIPTION_CARD_HTML } = require("./helpers/youtube-fixtures");

const ROOT = path.join(__dirname, "..");
const FIXTURE = path.join(__dirname, "fixtures", "overlay-buttons-css.json");

// Clases y atributo que identifican los botones sobre miniaturas, reproductor
// y Shorts (ADR 0041: su aspecto queda fijado por esta instantánea).
const OVERLAY_CLASSES = new Set([
  "youtube-groups__card-actions--overlay",
  "youtube-groups__subscription-control",
  "youtube-groups__subscription-control--compact",
  "youtube-groups__subscription-add-button",
  "youtube-groups__watched-button",
  "youtube-groups__playlist-button",
  "youtube-groups__card-glyph",
  "youtube-groups__card-label",
  "youtube-groups__player-actions",
  "youtube-groups__shorts-actions",
  "action-button",
  "primary-button",
  "secondary-button",
]);
const OVERLAY_ATTRIBUTE = "data-youtube-groups-thumb-host";

// Mismo troceo que tests/accent-css.test.js: sin comentarios y con las reglas
// de @media como reglas sueltas.
function parseRules(relativePath) {
  const css = fs
    .readFileSync(path.join(ROOT, relativePath), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  return css
    .split("}")
    .map((chunk) => chunk.split("{"))
    .filter((parts) => parts.length >= 2)
    .map((parts) => ({
      selector: parts[parts.length - 2].replace(/\s+/g, " ").trim(),
      body: parts[parts.length - 1].replace(/\s+/g, " ").trim(),
    }));
}

function uiRules() {
  const dir = path.join(ROOT, "ui");
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".css"))
    .sort()
    .flatMap((file) =>
      parseRules(`ui/${file}`).map((rule) => ({ ...rule, file })),
    );
}

function affectsOverlay(selector) {
  if (selector.includes(OVERLAY_ATTRIBUTE)) return true;
  for (const match of selector.matchAll(/\.([\w-]+)/g)) {
    if (OVERLAY_CLASSES.has(match[1])) return true;
  }
  return false;
}

test("las reglas CSS de los botones de miniatura coinciden con la instantánea", () => {
  const current = uiRules()
    .filter((rule) => affectsOverlay(rule.selector))
    .map((rule) => `${rule.file}: ${rule.selector} { ${rule.body} }`);
  const snapshot = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
  assert.deepStrictEqual(current, snapshot);
  assert.ok(snapshot.length > 0);
});

test("ninguna regla de ui/*.css apunta a button sin clase ni atributo", () => {
  const offenders = uiRules().flatMap((rule) =>
    rule.selector
      .split(",")
      .map((part) => part.trim())
      .filter(
        (part) =>
          !/[.[#]/.test(part) &&
          /(^|[\s>+~])button(:[\w-]+(\([^)]*\))?)*$/.test(part),
      )
      .map((part) => `${rule.file}: ${part}`),
  );
  assert.deepStrictEqual(offenders, []);
});

test("los botones sobre la miniatura conservan sus clases y no usan la clase común de icono", async () => {
  const dom = loadDom({ html: SUBSCRIPTION_CARD_HTML });
  await dom.flush();
  const buttons = [
    ...dom.document.querySelectorAll(
      ".youtube-groups__card-actions--overlay button",
    ),
  ];
  assert.deepStrictEqual(
    buttons.map((button) => button.className),
    [
      "youtube-groups__subscription-add-button action-button primary-button",
      "youtube-groups__watched-button action-button secondary-button",
      "youtube-groups__playlist-button action-button secondary-button",
    ],
  );
  for (const button of buttons) {
    assert.ok(!button.classList.contains("youtube-groups__icon-button"));
  }
});
