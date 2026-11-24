// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const EXTENSIONS = new Set([".js", ".mjs", ".css", ".html", ".sh"]);
const RECURSIVE_DIRS = ["modules", "ui", "options", "scripts", "tests"];

// Rutas (relativas a la raíz) que quedan fuera del recorrido.
const EXCLUDED = [
  // Instantáneas y páginas guardadas: las leen tests de coincidencia y no se tocan.
  "tests/fixtures/",
];

// Ficheros con material de terceros: identificador compuesto y línea que remite a los avisos.
const EXCEPTIONS = {
  "modules/fxemoji-data.js": {
    identifier: "GPL-3.0-or-later AND CC-BY-4.0",
    extra:
      "Incluye dibujos de fxemoji (Mozilla), CC BY 4.0; ver THIRD_PARTY_NOTICES.md",
  },
  "modules/icons.js": {
    identifier: "GPL-3.0-or-later AND Apache-2.0",
    extra:
      "Incluye trazados de Material Icons (Google), Apache 2.0; ver THIRD_PARTY_NOTICES.md",
  },
};

function isExcluded(rel) {
  return EXCLUDED.some((prefix) => rel.startsWith(prefix));
}

function hasSourceExtension(name) {
  return EXTENSIONS.has(path.extname(name));
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), {
    withFileTypes: true,
  })) {
    const rel = `${dir}/${entry.name}`;
    if (isExcluded(rel) || isExcluded(`${rel}/`)) continue;
    if (entry.isDirectory()) walk(rel, out);
    else if (entry.isFile() && hasSourceExtension(entry.name)) out.push(rel);
  }
}

function collectFiles() {
  const files = [];
  for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (
      entry.isFile() &&
      !entry.name.startsWith(".") &&
      hasSourceExtension(entry.name)
    ) {
      files.push(entry.name);
    }
  }
  for (const dir of RECURSIVE_DIRS) walk(dir, files);
  return files.sort();
}

function wrap(ext, text) {
  switch (ext) {
    case ".js":
    case ".mjs":
      return `// ${text}`;
    case ".css":
      return `/* ${text} */`;
    case ".html":
      return `<!-- ${text} -->`;
    case ".sh":
      return `# ${text}`;
    default:
      throw new Error(`Extensión sin envoltorio: ${ext}`);
  }
}

function readLines(rel) {
  return fs
    .readFileSync(path.join(ROOT, rel), "utf8")
    .split("\n")
    .map((line) => line.replace(/[ \t\r]+$/, ""));
}

function expectedHeader(rel) {
  const ext = path.extname(rel);
  const exception = EXCEPTIONS[rel];
  const lines = [
    wrap(
      ext,
      `SPDX-License-Identifier: ${exception?.identifier ?? "GPL-3.0-or-later"}`,
    ),
    wrap(ext, "Copyright (C) 2026 Javier López Diego"),
  ];
  if (exception) lines.push(wrap(ext, exception.extra));
  return lines;
}

function headerStart(rel, lines) {
  const ext = path.extname(rel);
  if (ext === ".html" && /^<!doctype html>$/i.test(lines[0])) return 1;
  if (ext === ".sh" && lines[0].startsWith("#!")) return 1;
  return 0;
}

const files = collectFiles();

test("el recorrido llega a cada tipo de fichero y carpeta", () => {
  assert.ok(files.length > 100, `solo ${files.length} ficheros`);
  for (const rel of [
    "background.js",
    "web-ext-config.mjs",
    "options/options.html",
    "ui/cards.css",
    "scripts/build-xpi.sh",
    "tests/helpers/load-dom.js",
  ]) {
    assert.ok(files.includes(rel), `falta en el recorrido: ${rel}`);
  }
});

test("ningún fichero de tests/fixtures/ está en el alcance", () => {
  assert.deepEqual(
    files.filter((rel) => rel.startsWith("tests/fixtures/")),
    [],
  );
});

test("las excepciones apuntan a ficheros que existen", () => {
  for (const rel of Object.keys(EXCEPTIONS)) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `no existe: ${rel}`);
  }
});

test("cada fichero fuente propio empieza por la cabecera SPDX", () => {
  assert.ok(files.length > 0);
  for (const rel of files) {
    const lines = readLines(rel);
    const header = expectedHeader(rel);
    const start = headerStart(rel, lines);
    assert.deepEqual(
      lines.slice(start, start + header.length),
      header,
      `${rel}: falta o es incorrecta la cabecera SPDX`,
    );
  }
});

test('"use strict" sigue siendo la primera sentencia tras la cabecera', () => {
  for (const rel of files.filter((f) => f.endsWith(".js"))) {
    const lines = readLines(rel);
    const index = lines.findIndex(
      (line) => line === '"use strict";' || line === "'use strict';",
    );
    if (index === -1) continue;
    const header = expectedHeader(rel);
    for (let i = 0; i < index; i += 1) {
      assert.ok(
        i < header.length || lines[i] === "",
        `${rel}: línea ${i + 1} antes de "use strict"`,
      );
    }
  }
});
