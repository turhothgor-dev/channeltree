// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

// ADR 0041: el bullet de la guía hace zoom y muestra una flecha, sin acento.
const CSS_PATH = path.join(__dirname, "..", "ui", "guide-section.css");
const RAW = fs.readFileSync(CSS_PATH, "utf8");

function parseRules() {
  return RAW.replace(/\/\*[\s\S]*?\*\//g, "")
    .split("}")
    .map((chunk) => chunk.split("{"))
    .filter((parts) => parts.length >= 2)
    .map((parts) => ({
      selector: parts[parts.length - 2].replace(/\s+/g, " ").trim(),
      parts: parts[parts.length - 2]
        .split(",")
        .map((part) => part.replace(/\s+/g, " ").trim()),
      body: parts[parts.length - 1],
    }));
}

const RULES = parseRules();
const BULLET = ".youtube-groups__group-bullet";
const STATES = [":hover", ":focus-visible", '[aria-expanded="true"]'];

function coversStates(rule, suffix = "") {
  return STATES.every((state) =>
    rule.parts.some(
      (part) =>
        part.startsWith("button.youtube-groups__guide-bullet") &&
        part.includes(state) &&
        part.endsWith(`${BULLET}${suffix}`),
    ),
  );
}

test("ninguna regla del bullet con :hover declara el color de acento", () => {
  const offenders = RULES.filter(
    (rule) =>
      rule.selector.includes("guide-bullet") &&
      rule.selector.includes(":hover") &&
      rule.body.includes("--yg-accent"),
  );
  assert.deepStrictEqual(
    offenders.map((rule) => rule.selector),
    [],
  );
});

test("el bullet crece con :hover y :focus-visible, no con la lista abierta", () => {
  const zoom = RULES.find(
    (rule) =>
      rule.body.includes("transform: scale(1.15)") &&
      rule.parts.some((part) => part.includes(":hover")) &&
      rule.parts.some((part) => part.includes(":focus-visible")) &&
      rule.parts.every(
        (part) =>
          part.startsWith(`button.youtube-groups__guide-bullet`) &&
          part.endsWith(BULLET),
      ),
  );
  assert.ok(zoom, "falta la regla de zoom");
  assert.ok(!zoom.selector.includes("aria-expanded"));
});

test("la flecha sustituye al número con :hover, :focus-visible y la lista abierta", () => {
  const hide = RULES.find(
    (rule) => coversStates(rule) && rule.body.includes("color: transparent"),
  );
  assert.ok(hide, "falta la regla que oculta el número");
  const arrow = RULES.find(
    (rule) =>
      coversStates(rule, "::after") &&
      rule.body.includes("content:") &&
      rule.body.includes("var(--yg-bullet-text"),
  );
  assert.ok(arrow, "falta la regla de la flecha");
});

test("con reducir movimiento el bullet no anima", () => {
  const media = RAW.match(
    /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g,
  );
  assert.ok(media);
  assert.ok(
    media.some(
      (block) =>
        block.includes("button.youtube-groups__guide-bullet") &&
        block.includes(BULLET) &&
        block.includes("transition: none"),
    ),
  );
});

test("las reglas del bullet con estado empiezan por button.", () => {
  const offenders = RULES.flatMap((rule) => rule.parts).filter(
    (part) =>
      part.includes("guide-bullet") &&
      STATES.some((state) => part.includes(state)) &&
      !/^(html\[dark\] )?button\./.test(part),
  );
  assert.deepStrictEqual(offenders, []);
});
