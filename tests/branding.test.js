// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const readJson = (file) =>
  JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));

const LONG_NAME = "ChannelTree: YouTube Subscriptions & Groups";

test("manifest: nombre largo, nombre corto y descripción", () => {
  const manifest = readJson("manifest.json");
  assert.strictEqual(manifest.name, LONG_NAME);
  assert.ok(manifest.name.length <= 50);
  assert.strictEqual(manifest.short_name, "ChannelTree");
  assert.ok(manifest.short_name.length <= 12);
  assert.ok(manifest.description.length <= 132);
  assert.ok(!/^YouTube/i.test(manifest.description));
});

test("manifest: id de gecko", () => {
  const manifest = readJson("manifest.json");
  assert.strictEqual(
    manifest.browser_specific_settings.gecko.id,
    "channeltree@turhothgor",
  );
});

test("package.json y package-lock.json se llaman channeltree", () => {
  assert.strictEqual(readJson("package.json").name, "channeltree");
  const lock = readJson("package-lock.json");
  assert.strictEqual(lock.name, "channeltree");
  assert.strictEqual(lock.packages[""].name, "channeltree");
});

// Guardia de código: el nombre antiguo no debe reaparecer. Los
// identificadores internos (youtube-groups__, youtube-groups:,
// youtube-groups-backup, #youtube-groups-..., YouTubeGroups*) no casan.
const OLD_NAME_PATTERNS = [
  /YouTube\s+Groups/i,
  /youtube-groups@/,
  /(["'`])youtube-groups-\1/,
  /youtube-groups-(\$\{|<versi|X\.Y\.Z|\d+\.\d+)/,
];

// fichero → texto admitido (se quita de la línea antes de vigilar el nombre antiguo).
// La sección 10 de RELEASE.md cita el id antiguo para explicar el cambio de id;
// "YouTube Groups" y el resto de patrones siguen vigilados en ese fichero.
const ALLOWED_TEXT = {
  "docs/RELEASE.md": /youtube-groups@turhothgor/g,
};

// Números de línea (1-based) con el nombre antiguo en `text`.
function oldNameLines(file, text) {
  const allowed = ALLOWED_TEXT[file];
  const hits = [];
  text.split("\n").forEach((line, index) => {
    const checked = allowed ? line.replace(allowed, "") : line;
    if (OLD_NAME_PATTERNS.some((pattern) => pattern.test(checked))) {
      hits.push(index + 1);
    }
  });
  return hits;
}

const DOC_FILES = [
  "README.md",
  "LICENSE.md",
  "CHANGELOG.md",
  "THIRD_PARTY_NOTICES.md",
  "docs/RELEASE.md",
  "docs/ARCHITECTURE.md",
];

const CODE_FILES = [
  "manifest.json",
  "background.js",
  "content.js",
  "Makefile",
  ...DOC_FILES,
];
const CODE_DIRS = ["modules", "ui", "options", "scripts"];
const CODE_EXTENSIONS = [".js", ".css", ".html", ".sh"];

function codeFiles() {
  const files = [...CODE_FILES, "web-ext-config.mjs"];
  for (const dir of CODE_DIRS) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const name of fs.readdirSync(abs)) {
      if (CODE_EXTENSIONS.includes(path.extname(name))) {
        files.push(`${dir}/${name}`);
      }
    }
  }
  return files;
}

test("el código no contiene el nombre antiguo", () => {
  const found = [];
  for (const file of codeFiles()) {
    const abs = path.join(ROOT, file);
    if (!fs.existsSync(abs)) continue;
    for (const line of oldNameLines(file, fs.readFileSync(abs, "utf8"))) {
      found.push(`${file}:${line}`);
    }
  }
  assert.deepStrictEqual(found, []);
});

test("la excepción de RELEASE.md solo admite el id antiguo", () => {
  const file = "docs/RELEASE.md";
  assert.deepStrictEqual(
    oldNameLines(file, "id antiguo (`youtube-groups@turhothgor`)"),
    [],
  );
  assert.deepStrictEqual(
    oldNameLines(file, "ok\nla extensión YouTube Groups\n"),
    [2],
  );
  assert.deepStrictEqual(
    oldNameLines(file, "youtube-groups@turhothgor y YouTube Groups"),
    [1],
  );
  assert.deepStrictEqual(
    oldNameLines("README.md", "youtube-groups@turhothgor"),
    [1],
  );
});

test("LICENSE.md y README.md contienen el nombre largo", () => {
  for (const file of ["LICENSE.md", "README.md"]) {
    const text = fs.readFileSync(path.join(ROOT, file), "utf8");
    assert.ok(text.includes(LONG_NAME), file);
  }
});
