// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { loadDom, loadOptionsDom } = require("./helpers/load-dom");
const {
  CHANNEL_URL,
  GUIDE_HTML,
  makeGroup,
  groupsStore,
} = require("./helpers/youtube-fixtures");

const ROOT = path.join(__dirname, "..");

// Reglas :hover que no son botones y por eso no usan el acento (ADR 0040).
const UI_EXCEPTIONS = [
  ".youtube-groups--dimmed:hover",
  ".youtube-groups__card-label",
  // ADR 0041: el bullet usa zoom y flecha, no el acento
  ".youtube-groups__guide-bullet",
];

// Un troceo por "}" basta: estos ficheros no anidan reglas salvo @media y
// @keyframes, que no contienen :hover.
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
      body: parts[parts.length - 1],
    }));
}

function uiRules() {
  const dir = path.join(ROOT, "ui");
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".css"))
    .flatMap((file) =>
      parseRules(`ui/${file}`).map((rule) => ({ ...rule, file })),
    );
}

function hasAccentHover(rules, family) {
  return rules.some(
    (rule) =>
      rule.body.includes("var(--yg-accent") &&
      rule.selector
        .split(",")
        .map((part) => part.trim())
        .some((part) => part.startsWith(family) && part.includes(":hover")),
  );
}

test("toda regla :hover de ui/*.css usa el color de acento salvo las excepciones", () => {
  const offenders = uiRules().filter(
    (rule) =>
      rule.selector.includes(":hover") &&
      !rule.body.includes("var(--yg-accent") &&
      !UI_EXCEPTIONS.some((exception) => rule.selector.includes(exception)),
  );
  assert.deepStrictEqual(
    offenders.map((rule) => `${rule.file}: ${rule.selector}`),
    [],
  );
});

test("cada familia de botones de ui/*.css tiene hover con el color de acento", () => {
  const rules = uiRules();
  const families = [
    ".action-button",
    ".mini-action-button",
    ".youtube-groups__guide-item",
    ".youtube-groups__icon-button",
    ".youtube-groups__text-button",
    ".youtube-groups__toast-action",
    ".youtube-groups__icon-picker-tab",
    ".youtube-groups__card-actions--overlay button",
    ".youtube-groups__watched-button",
    ".youtube-groups__playlist-button",
    ".youtube-groups__subscription-hide-button",
  ];
  const missing = families.filter((family) => !hasAccentHover(rules, family));
  assert.deepStrictEqual(missing, []);
});

// Reglas :hover de las opciones que no son botones (filas del árbol y canales).
const OPTIONS_EXCEPTIONS = [".options__row:hover", ".options__channel:hover"];

test("toda regla :hover de options/options.css usa el color de acento salvo las excepciones", () => {
  const offenders = parseRules("options/options.css").filter(
    (rule) =>
      rule.selector.includes(":hover") &&
      !rule.body.includes("var(--yg-accent") &&
      !OPTIONS_EXCEPTIONS.some((exception) =>
        rule.selector.includes(exception),
      ),
  );
  assert.deepStrictEqual(
    offenders.map((rule) => rule.selector),
    [],
  );
});

test("los botones de options/options.css tienen hover con el color de acento", () => {
  const rules = parseRules("options/options.css");
  const families = [
    ".options__action",
    '.options__tabs [role="tab"]',
    ".options__toggle",
  ];
  const missing = families.filter((family) => !hasAccentHover(rules, family));
  assert.deepStrictEqual(missing, []);
});

test("el grupo seleccionado de la guía conserva su fondo propio, sin acento", () => {
  const pressed = uiRules().filter(
    (rule) =>
      rule.selector === '.youtube-groups__guide-item[aria-pressed="true"]',
  );
  assert.ok(pressed.length > 0);
  assert.ok(pressed.some((rule) => rule.body.includes("background")));
  assert.ok(pressed.every((rule) => !rule.body.includes("--yg-accent")));
});

// Botones que conservan su color propio en hover (ADR 0040, excepciones).
const DOM_EXCEPTIONS = [
  ".youtube-groups__guide-item[aria-pressed='true']",
  ".youtube-groups__watched-button[aria-pressed='true']",
  // ADR 0041: el bullet usa zoom y flecha, no el acento
  "button.youtube-groups__guide-bullet",
];

/**
 * Selectores de las reglas :hover con acento, sin los pseudo-estados de
 * interacción, para comprobar con `matches` qué elementos cubren.
 * @param {string[]} files - Ficheros CSS relativos a la raíz.
 * @returns {string[]} Selectores sin `:hover` ni `:not(:disabled)`.
 */
function accentHoverSelectors(files) {
  return files
    .flatMap((file) => parseRules(file))
    .filter((rule) => rule.body.includes("var(--yg-accent"))
    .flatMap((rule) => rule.selector.split(","))
    .map((part) => part.trim())
    .filter((part) => part.includes(":hover"))
    .map((part) =>
      part
        .replace(/:not\(:disabled\)/g, "")
        .replace(/:hover/g, "")
        .trim(),
    );
}

/**
 * Devuelve los botones que ninguna regla :hover con acento cubre.
 * @param {Element[]} buttons - Botones del DOM cargado.
 * @param {string[]} selectors - Selectores de accentHoverSelectors.
 * @returns {string[]} Descripción de cada botón sin cubrir.
 */
function uncovered(buttons, selectors) {
  return buttons
    .filter(
      (button) =>
        !DOM_EXCEPTIONS.some((exception) => button.matches(exception)) &&
        !selectors.some((selector) => {
          try {
            return button.matches(selector);
          } catch {
            return false;
          }
        }),
    )
    .map((button) => `${button.className} "${button.textContent.trim()}"`);
}

test("todo botón de la página de opciones tiene hover con acento", async () => {
  const url = "https://www.youtube.com/@rock01";
  const store = {
    ...groupsStore([
      {
        ...makeGroup("a", {
          name: "A",
          channels: [{ name: "Canal", url: "https://www.youtube.com/@c" }],
          subgroups: [makeGroup("a1")],
        }),
        keywords: ["rock"],
      },
    ]),
    youtubeSubscriptions: { [url]: { name: "Rock 01", url, firstSeen: 1 } },
  };
  const dom = loadOptionsDom({ store });
  await dom.flush();
  dom.document.querySelector('[role="treeitem"]').click();
  await dom.flush();
  const buttons = [...dom.document.querySelectorAll("button")];
  assert.ok(buttons.length > 10);
  const selectors = accentHoverSelectors(["options/options.css"]);
  assert.deepStrictEqual(uncovered(buttons, selectors), []);
});

test("todo botón de la guía, con su formulario abierto, tiene hover con acento", async () => {
  const store = groupsStore([
    makeGroup("A", {
      channels: [{ name: "Canal", url: CHANNEL_URL }],
      subgroups: [makeGroup("A1")],
    }),
    makeGroup("B"),
  ]);
  const dom = loadDom({ html: GUIDE_HTML, store });
  await dom.flush();
  dom.document.querySelector(".youtube-groups__guide-create").click();
  const buttons = [
    ...dom.document.querySelectorAll("#youtube-groups-guide button"),
  ];
  assert.ok(
    buttons.some((b) => b.className === "youtube-groups__guide-form-save"),
  );
  const files = fs
    .readdirSync(path.join(ROOT, "ui"))
    .filter((file) => file.endsWith(".css"))
    .map((file) => `ui/${file}`);
  assert.deepStrictEqual(uncovered(buttons, accentHoverSelectors(files)), []);
});
