// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const GPL_SHA256 =
  "8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903";
const START = "<!-- gpl-3.0-text:start -->";
const END = "<!-- gpl-3.0-text:end -->";

const license = fs.readFileSync(path.join(ROOT, "LICENSE.md"), "utf8");

function count(text, needle) {
  return text.split(needle).length - 1;
}

function extractGplText() {
  const afterStart = license.slice(license.indexOf(START) + START.length);
  const fenceOpen = afterStart.indexOf("\n```text\n");
  const body = afterStart.slice(fenceOpen + "\n```text\n".length);
  const endIndex = body.indexOf(END);
  const beforeEnd = body.slice(0, endIndex);
  const fenceClose = beforeEnd.lastIndexOf("\n```\n");
  return beforeEnd.slice(0, fenceClose + 1);
}

test("el texto de la GPLv3 de LICENSE.md es el oficial (SHA-256)", () => {
  const text = extractGplText();
  assert.ok(
    text.startsWith("                    GNU GENERAL PUBLIC LICENSE\n"),
  );
  assert.equal(
    crypto.createHash("sha256").update(text, "utf8").digest("hex"),
    GPL_SHA256,
  );
});

test("LICENSE.md tiene un único marcador de inicio y uno de fin", () => {
  assert.equal(count(license, START), 1);
  assert.equal(count(license, END), 1);
});

test("LICENSE.md lleva copyright, atribución y licencia", () => {
  for (const expected of [
    "Copyright (C) 2026 Javier López Diego",
    "Project direction, design, architecture, logic and structure by Javier López Diego. Developed with AI assistance.",
    "Dirección, arquitectura, diseño, lógica y estructura del proyecto: Javier López Diego. Desarrollado con asistencia de inteligencia artificial.",
    "GPL-3.0-or-later",
    "any later version",
    "https://www.gnu.org/licenses/translations.html",
    "THIRD_PARTY_NOTICES.md",
  ]) {
    assert.ok(license.includes(expected), `falta: ${expected}`);
  }
});

test("README.md lleva copyright, atribución y licencia", () => {
  const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
  for (const expected of [
    "Copyright (C) 2026 Javier López Diego",
    "asistencia de inteligencia artificial",
    "Dirección, arquitectura, diseño, lógica y estructura del proyecto",
    "GPL-3.0-or-later",
    "LICENSE.md",
  ]) {
    assert.ok(readme.includes(expected), `falta: ${expected}`);
  }
});

test("package.json y package-lock.json declaran GPL-3.0-or-later", () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
  );
  const lock = JSON.parse(
    fs.readFileSync(path.join(ROOT, "package-lock.json"), "utf8"),
  );
  assert.equal(pkg.license, "GPL-3.0-or-later");
  assert.equal(lock.packages[""].license, "GPL-3.0-or-later");
});

test("THIRD_PARTY_NOTICES.md cita Material Icons y Apache", () => {
  const notices = fs.readFileSync(
    path.join(ROOT, "THIRD_PARTY_NOTICES.md"),
    "utf8",
  );
  assert.ok(notices.includes("Material Icons"));
  assert.ok(notices.includes("Apache"));
});

test("docs/RELEASE.md da la licencia por decidida", () => {
  const release = fs.readFileSync(
    path.join(ROOT, "docs", "RELEASE.md"),
    "utf8",
  );
  assert.ok(release.includes("GNU General Public License v3.0 or later"));
  assert.ok(!release.includes("el repositorio no tiene una"));
});
