// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const {
  loadDom,
  loadOptionsDom,
  manifestScripts,
} = require("./helpers/load-dom");

const STYLE = "style#youtube-groups-accent";

function settingsStore(accentColor) {
  return { youtubeSettings: { version: 1, settings: { accentColor } } };
}

function loadAccent() {
  const scripts = manifestScripts().filter((file) => file !== "content.js");
  const dom = loadDom({ scripts });
  return { dom, accent: dom.global("YouTubeGroupsAccent") };
}

test("applyAccent crea un único style con el acento y el texto por defecto", () => {
  const { dom, accent } = loadAccent();
  accent.applyAccent(dom.document, "#1a73e8");
  accent.applyAccent(dom.document, "#1a73e8");
  const styles = dom.document.querySelectorAll(STYLE);
  assert.strictEqual(styles.length, 1);
  assert.match(styles[0].textContent, /--yg-accent: #1a73e8;/);
  assert.match(styles[0].textContent, /--yg-accent-text: #ffffff;/);
});

test("applyAccent con un color claro usa texto oscuro", () => {
  const { dom, accent } = loadAccent();
  accent.applyAccent(dom.document, "#ffeb3b");
  const css = dom.document.querySelector(STYLE).textContent;
  assert.match(css, /--yg-accent: #ffeb3b;/);
  assert.match(css, /--yg-accent-text: #0f0f0f;/);
});

test("applyAccent no reescribe con el mismo color y no toca el style de html", () => {
  const { dom, accent } = loadAccent();
  accent.applyAccent(dom.document, "#00ff00");
  const style = dom.document.querySelector(STYLE);
  const text = style.firstChild;
  accent.applyAccent(dom.document, "#00ff00");
  assert.strictEqual(dom.document.querySelector(STYLE), style);
  assert.strictEqual(style.firstChild, text);
  assert.strictEqual(dom.document.documentElement.hasAttribute("style"), false);
});

test("applyAccent con un color no válido usa el de por defecto", () => {
  const { dom, accent } = loadAccent();
  accent.applyAccent(dom.document, "red");
  assert.match(
    dom.document.querySelector(STYLE).textContent,
    /--yg-accent: #1a73e8;/,
  );
});

test("en YouTube el style existe con el color guardado y sigue los cambios", async () => {
  const dom = loadDom({ store: settingsStore("#ff0000") });
  await dom.flush();
  assert.match(
    dom.document.querySelector(STYLE).textContent,
    /--yg-accent: #ff0000;/,
  );

  await dom.browser.storage.local.set(settingsStore("#00ff00"));
  await dom.flush();
  assert.strictEqual(dom.document.querySelectorAll(STYLE).length, 1);
  assert.match(
    dom.document.querySelector(STYLE).textContent,
    /--yg-accent: #00ff00;/,
  );
});

test("en la página de opciones el style existe y sigue los cambios", async () => {
  const dom = loadOptionsDom({ store: settingsStore("#ff0000") });
  await dom.flush();
  assert.match(
    dom.document.querySelector(STYLE).textContent,
    /--yg-accent: #ff0000;/,
  );

  await dom.browser.storage.local.set(settingsStore("#00ff00"));
  await dom.flush();
  assert.strictEqual(dom.document.querySelectorAll(STYLE).length, 1);
  assert.match(
    dom.document.querySelector(STYLE).textContent,
    /--yg-accent: #00ff00;/,
  );
});
