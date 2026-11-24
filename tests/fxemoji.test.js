// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadModules, plain } = require("./helpers/load-modules");
const {
  parseSvgShapes,
  ALLOWED_TAGS,
  ALLOWED_ATTRS,
} = require("./helpers/svg-shapes");

const { YouTubeGroupsFxemoji: Fxemoji } = loadModules();
const SVG_DIR = path.resolve(__dirname, "..", "third_party", "fxemoji");

const { YouTubeGroupsIcons: Icons } = loadModules();

// Ids de icono de grupo: los de ICON_SET.
const EXPECTED_IDS = Icons.ICON_SET.map((icon) => icon.id);

test("parseSvgShapes aplana <g>, ignora prólogo y comentarios y normaliza espacios", () => {
  const svg = `<?xml version="1.0"?>
<!-- comentario -->
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg viewBox="0 0 512 512"><g id="a"><path fill="#112233" d="M0,0
	l1,1z"/></g><circle fill="none" cx="1" cy="2" r="3"/></svg>`;
  assert.deepEqual(parseSvgShapes(svg), {
    viewBox: "0 0 512 512",
    shapes: [
      { tag: "path", attrs: { fill: "#112233", d: "M0,0 l1,1z" } },
      { tag: "circle", attrs: { fill: "none", cx: "1", cy: "2", r: "3" } },
    ],
  });
});

test("parseSvgShapes falla con etiquetas o atributos fuera de la lista blanca", () => {
  const wrap = (body) => `<svg viewBox="0 0 1 1">${body}</svg>`;
  for (const body of [
    "<style>.a{}</style>",
    '<text x="1">a</text>',
    '<use xlink:href="#a"/>',
    '<linearGradient id="g"/>',
    '<path d="M0,0z" transform="scale(2)"/>',
    '<path d="M0,0z" class="a"/>',
    '<g transform="scale(2)"><path d="M0,0z"/></g>',
  ]) {
    assert.throws(() => parseSvgShapes(wrap(body)), body);
  }
  assert.throws(() => parseSvgShapes('<path d="M0,0z"/>'), /viewBox/);
});

test("hay una entrada de fxemoji por cada id de icono de grupo", () => {
  assert.deepEqual(Object.keys(Fxemoji.ICONS).sort(), [...EXPECTED_IDS].sort());
});

test("cada entrada coincide en viewBox y formas con su SVG de third_party/fxemoji", () => {
  for (const [id, icon] of Object.entries(Fxemoji.ICONS)) {
    // Un icono usa un SVG completo (`file`) o, si el original no es válido,
    // las formas de sus capas (`layers`) concatenadas en orden.
    assert.ok(
      Boolean(icon.file) !== Boolean(icon.layers),
      `${id}: debe tener file o layers, no ambos`,
    );
    // Copia a un array de este contexto: los de ICONS vienen de otro (vm).
    const files = icon.file ? [icon.file] : [...icon.layers];
    const prefix = icon.file
      ? `u${icon.codepoint}-`
      : `u${icon.codepoint}.layer`;
    const parsed = files.map((file) => {
      assert.ok(
        file.startsWith(prefix),
        `${id}: el fichero ${file} no corresponde al codepoint`,
      );
      return parseSvgShapes(fs.readFileSync(path.join(SVG_DIR, file), "utf8"));
    });
    for (const [index, svg] of parsed.entries()) {
      assert.equal(
        icon.viewBox,
        svg.viewBox,
        `${id}: viewBox de ${files[index]}`,
      );
    }
    const expectedShapes = parsed.flatMap((svg) => svg.shapes);
    assert.deepEqual(plain(icon.shapes), expectedShapes, `${id}: formas`);
  }
});

test("las formas usan solo etiquetas y atributos de la lista blanca, con fill #rrggbb o none", () => {
  for (const [id, icon] of Object.entries(Fxemoji.ICONS)) {
    assert.ok(icon.shapes.length > 0, `${id}: sin formas`);
    for (const shape of icon.shapes) {
      assert.ok(ALLOWED_TAGS.has(shape.tag), `${id}: etiqueta ${shape.tag}`);
      for (const name of Object.keys(shape.attrs)) {
        assert.ok(ALLOWED_ATTRS.has(name), `${id}: atributo ${name}`);
      }
      assert.match(shape.attrs.fill, /^(#[0-9A-Fa-f]{6}|none)$/, `${id}: fill`);
    }
  }
});

test("modules/fxemoji-data.js mide menos de 300 000 bytes", () => {
  const file = path.resolve(__dirname, "..", "modules", "fxemoji-data.js");
  assert.ok(fs.statSync(file).size < 300000);
});

test("ICONS está congelado en profundidad", () => {
  assert.ok(Object.isFrozen(Fxemoji.ICONS));
  assert.ok(Object.isFrozen(Fxemoji.ICONS.tech));
  assert.ok(Object.isFrozen(Fxemoji.ICONS.tech.shapes[0].attrs));
});
