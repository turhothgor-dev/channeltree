// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

// ADR 0041: clase común de botón de icono.
const ROOT = path.join(__dirname, "..");
const ICON = ".youtube-groups__icon-button";

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

function uiRules() {
  return fs
    .readdirSync(path.join(ROOT, "ui"))
    .filter((file) => file.endsWith(".css"))
    .flatMap((file) =>
      parseRules(`ui/${file}`).map((rule) => ({ ...rule, file })),
    );
}

const BUTTONS = parseRules("ui/buttons.css");
const rule = (selector) => BUTTONS.find((r) => r.selector === selector);

test("la clase común define forma, tamaño y estados", () => {
  const base = rule(ICON);
  assert.ok(base, "regla base");
  assert.ok(base.body.includes("border-radius: 10px"));
  assert.ok(base.body.includes("padding: 0"));
  assert.ok(base.body.includes("width: var(--yg-icon-button-size, 36px)"));
  assert.ok(base.body.includes("height: var(--yg-icon-button-size, 36px)"));
  assert.ok(rule(`${ICON}--small`).body.includes("28px"));
  assert.ok(rule(`${ICON}[hidden]`).body.includes("display: none"));
  assert.ok(rule(`${ICON}:disabled`));
  assert.ok(
    rule(`${ICON}:not(:disabled):hover`).body.includes("var(--yg-accent"),
  );
  assert.ok(rule(`${ICON}:focus-visible`));
  assert.ok(rule(`html[dark] ${ICON}`));
});

// Clases propias que ya usan la común (se amplía en T6).
const OWN_CLASSES = [
  // Con el ancestro: panel.css se carga antes que buttons.css y necesita más especificidad.
  ".youtube-groups__channel-list-header .youtube-groups__close-channels-button",
  ".youtube-groups__icon-picker-option",
  ".youtube-groups__guide-back",
  ".youtube-groups__guide-create",
  ".youtube-groups__guide-edit",
  ".youtube-groups__guide-enter",
  ".youtube-groups__guide-clear",
  ".youtube-groups__guide-menu-button",
];
const FORBIDDEN = ["width", "height", "padding", "border", "border-radius"];

test("las clases propias no redeclaran caja, borde ni fondo", () => {
  const offenders = uiRules()
    .filter((r) => OWN_CLASSES.includes(r.selector))
    .flatMap((r) =>
      r.body
        .split(";")
        .map((decl) => decl.split(":")[0].trim())
        .filter(
          (prop) =>
            FORBIDDEN.includes(prop) ||
            prop === "background" ||
            prop.startsWith("border-"),
        )
        .map((prop) => `${r.file}: ${r.selector} ${prop}`),
    );
  assert.deepStrictEqual(offenders, []);
});

test("el selector de iconos marca la celda con box-shadow inset y conserva la rejilla", () => {
  const picker = parseRules("ui/icon-picker.css");
  const find = (selector) => picker.find((r) => r.selector === selector);
  const option = ".youtube-groups__icon-picker-option";

  for (const selector of [
    `${option}.selected`,
    `html[dark] ${option}.selected`,
  ]) {
    const selected = find(selector);
    assert.ok(selected, selector);
    assert.ok(/box-shadow: inset /.test(selected.body), selector);
    assert.ok(!selected.body.includes("border-color"), selector);
  }
  const grid = find(`.youtube-groups__icon-picker-grid ${option}`);
  assert.ok(grid && grid.body.includes("width: 100%"));
  assert.ok(find(option), "regla propia de la celda");
  assert.ok(
    uiRules().some((r) => r.selector === OWN_CLASSES[0]),
    "regla propia de la ×",
  );
});

test("las clases propias de la página de opciones no redeclaran caja, borde ni fondo", () => {
  const own = [".options__action--icon", ".options__toggle"];
  const offenders = parseRules("options/options.css")
    .filter((r) => own.includes(r.selector))
    .flatMap((r) =>
      r.body
        .split(";")
        .map((decl) => decl.split(":")[0].trim())
        .filter(
          (prop) =>
            FORBIDDEN.includes(prop) ||
            prop === "background" ||
            prop.startsWith("border-"),
        )
        .map((prop) => `${r.selector} ${prop}`),
    );
  assert.deepStrictEqual(offenders, []);
});

test("los botones de texto del formulario de la guía miden 36px y radio 10px", () => {
  for (const hook of ["form-icon", "form-save", "form-cancel"]) {
    const selectors = [`.youtube-groups__guide-${hook}`];
    const found = uiRules().filter(
      (r) =>
        r.file === "guide-section.css" &&
        (selectors.includes(r.selector) ||
          r.selector.split(", ").includes(selectors[0])) &&
        r.body.includes("height"),
    );
    assert.ok(found.length > 0, hook);
    assert.ok(
      found.every(
        (r) =>
          r.body.includes("height: 36px") &&
          r.body.includes("border-radius: 10px"),
      ),
      hook,
    );
  }
});
