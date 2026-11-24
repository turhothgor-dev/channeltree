// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { loadModules, plain } = require("./helpers/load-modules");

const DEFAULTS = {
  watchedMode: "dim",
  outsideMode: "hide",
  autoMarkPercent: 80,
  accentColor: "#1a73e8",
  backgroundRefresh: true,
  showNewBadge: true,
};

test("normalizeSettings devuelve los valores por defecto con entradas no válidas", () => {
  const { YouTubeGroupsSettings } = loadModules();

  for (const raw of [undefined, null, [], {}, 3]) {
    assert.deepStrictEqual(
      plain(YouTubeGroupsSettings.normalizeSettings(raw)),
      DEFAULTS,
    );
  }
});

test("normalizeSettings conserva valores válidos", () => {
  const { YouTubeGroupsSettings } = loadModules();
  const raw = {
    watchedMode: "hide",
    outsideMode: "dim",
    autoMarkPercent: 95,
    accentColor: "#00ff00",
    backgroundRefresh: false,
    showNewBadge: false,
  };

  assert.deepStrictEqual(
    plain(YouTubeGroupsSettings.normalizeSettings(raw)),
    raw,
  );
});

test("normalizeSettings conserva autoMarkPercent 0 y sustituye valores no válidos", () => {
  const { YouTubeGroupsSettings } = loadModules();

  assert.strictEqual(
    YouTubeGroupsSettings.normalizeSettings({ autoMarkPercent: 0 })
      .autoMarkPercent,
    0,
  );
  for (const bad of [70, "80", null, NaN]) {
    assert.strictEqual(
      YouTubeGroupsSettings.normalizeSettings({ autoMarkPercent: bad })
        .autoMarkPercent,
      80,
    );
  }
});

test("normalizeSettings sustituye solo el campo inválido", () => {
  const { YouTubeGroupsSettings } = loadModules();

  const result = YouTubeGroupsSettings.normalizeSettings({
    watchedMode: "x",
    outsideMode: "dim",
  });

  assert.deepStrictEqual(plain(result), {
    watchedMode: "dim",
    outsideMode: "dim",
    autoMarkPercent: 80,
    accentColor: "#1a73e8",
    backgroundRefresh: true,
    showNewBadge: true,
  });
});

test("normalizeSettings conserva showNewBadge false y sustituye no booleanos por true", () => {
  const { YouTubeGroupsSettings: S } = loadModules();

  assert.strictEqual(
    S.normalizeSettings({ showNewBadge: false }).showNewBadge,
    false,
  );
  assert.strictEqual(S.normalizeSettings({}).showNewBadge, true);
  for (const bad of ["x", 1, null]) {
    assert.strictEqual(
      S.normalizeSettings({ showNewBadge: bad }).showNewBadge,
      true,
    );
  }
});

test("updateSettings guarda showNewBadge false y rechaza un no booleano", async () => {
  const { YouTubeGroupsSettings: S, store } = loadModules();

  const result = await S.updateSettings({ showNewBadge: false });

  assert.strictEqual(result.changed, true);
  assert.strictEqual(store.youtubeSettings.settings.showNewBadge, false);
  await assert.rejects(
    () => S.updateSettings({ showNewBadge: "no" }),
    /Ajuste inválido: showNewBadge/,
  );
});

test("normalizeSettings conserva backgroundRefresh false y sustituye no booleanos por true", () => {
  const { YouTubeGroupsSettings: S } = loadModules();

  assert.strictEqual(
    S.normalizeSettings({ backgroundRefresh: false }).backgroundRefresh,
    false,
  );
  for (const bad of ["no", 1, 0, null]) {
    assert.strictEqual(
      S.normalizeSettings({ backgroundRefresh: bad }).backgroundRefresh,
      true,
    );
  }
});

test("updateSettings rechaza un backgroundRefresh no booleano", async () => {
  const { YouTubeGroupsSettings: S } = loadModules();

  await assert.rejects(
    () => S.updateSettings({ backgroundRefresh: "x" }),
    /Ajuste inválido: backgroundRefresh/,
  );
});

test("normalizeSettings normaliza accentColor y sustituye los no válidos", () => {
  const { YouTubeGroupsSettings: S } = loadModules();

  assert.strictEqual(S.normalizeSettings({}).accentColor, "#1a73e8");
  assert.strictEqual(
    S.normalizeSettings({ accentColor: "#ABCDEF" }).accentColor,
    "#abcdef",
  );
  for (const bad of ["red", "#abc", "#abcdefg", 123, null]) {
    assert.strictEqual(
      S.normalizeSettings({ accentColor: bad }).accentColor,
      "#1a73e8",
    );
  }
  assert.deepStrictEqual(
    plain(S.normalizeSettings({ accentColor: "#ABCDEF" })),
    { ...DEFAULTS, accentColor: "#abcdef" },
  );
});

test("updateSettings guarda accentColor y rechaza uno no válido sin escribir", async () => {
  const { YouTubeGroupsSettings: S, calls, store } = loadModules();

  const result = await S.updateSettings({ accentColor: "#00FF00" });

  assert.strictEqual(result.settings.accentColor, "#00ff00");
  assert.strictEqual(store.youtubeSettings.settings.accentColor, "#00ff00");
  assert.strictEqual(calls.set, 1);

  const other = loadModules();
  await assert.rejects(
    other.YouTubeGroupsSettings.updateSettings({ accentColor: "azul" }),
    /Ajuste inválido: accentColor\./,
  );
  assert.strictEqual(other.calls.set, 0);
});

test("normalizeSettings no devuelve panelCollapsed", () => {
  const { YouTubeGroupsSettings } = loadModules();

  assert.deepStrictEqual(
    plain(YouTubeGroupsSettings.normalizeSettings({ panelCollapsed: false })),
    DEFAULTS,
  );
});

test("DEFAULT_SETTINGS no incluye panelCollapsed", () => {
  const { YouTubeGroupsSettings } = loadModules();

  assert.deepStrictEqual(
    plain(YouTubeGroupsSettings.DEFAULT_SETTINGS),
    DEFAULTS,
  );
});

test("normalizeSettings descarta campos desconocidos y no muta la entrada", () => {
  const { YouTubeGroupsSettings } = loadModules();
  const raw = { watchedMode: "show", foo: 1 };

  const result = YouTubeGroupsSettings.normalizeSettings(raw);

  assert.deepStrictEqual(plain(result), {
    watchedMode: "show",
    outsideMode: "hide",
    autoMarkPercent: 80,
    accentColor: "#1a73e8",
    backgroundRefresh: true,
    showNewBadge: true,
  });
  assert.deepStrictEqual(raw, { watchedMode: "show", foo: 1 });
  assert.notStrictEqual(result, raw);
});

test("getSettings sin datos devuelve los valores por defecto sin escribir", async () => {
  const { YouTubeGroupsSettings, calls } = loadModules();

  const settings = await YouTubeGroupsSettings.getSettings();

  assert.deepStrictEqual(plain(settings), DEFAULTS);
  assert.strictEqual(calls.set, 0);
});

test("updateSettings escribe una vez y no repite si no cambia", async () => {
  const { YouTubeGroupsSettings, calls, store } = loadModules();

  const first = await YouTubeGroupsSettings.updateSettings({
    watchedMode: "hide",
  });
  assert.strictEqual(first.changed, true);
  assert.deepStrictEqual(plain(first.settings), {
    watchedMode: "hide",
    outsideMode: "hide",
    autoMarkPercent: 80,
    accentColor: "#1a73e8",
    backgroundRefresh: true,
    showNewBadge: true,
  });
  assert.strictEqual(calls.set, 1);
  assert.strictEqual(store.youtubeSettings.version, 1);

  const second = await YouTubeGroupsSettings.updateSettings({
    watchedMode: "hide",
  });
  assert.strictEqual(second.changed, false);
  assert.strictEqual(calls.set, 1);
});

test("updateSettings conserva el otro campo", async () => {
  const { YouTubeGroupsSettings } = loadModules({
    youtubeSettings: {
      version: 1,
      settings: { watchedMode: "show", outsideMode: "dim" },
    },
  });

  const result = await YouTubeGroupsSettings.updateSettings({
    watchedMode: "hide",
  });

  assert.deepStrictEqual(plain(result.settings), {
    watchedMode: "hide",
    outsideMode: "dim",
    autoMarkPercent: 80,
    accentColor: "#1a73e8",
    backgroundRefresh: true,
    showNewBadge: true,
  });
});

test("ajustes guardados con panelCollapsed se leen sin error y la siguiente escritura no lo guarda", async () => {
  const { YouTubeGroupsSettings, calls, store } = loadModules({
    youtubeSettings: {
      version: 1,
      settings: {
        watchedMode: "show",
        outsideMode: "dim",
        panelCollapsed: false,
      },
    },
  });

  assert.deepStrictEqual(plain(await YouTubeGroupsSettings.getSettings()), {
    watchedMode: "show",
    outsideMode: "dim",
    autoMarkPercent: 80,
    accentColor: "#1a73e8",
    backgroundRefresh: true,
    showNewBadge: true,
  });

  const result = await YouTubeGroupsSettings.updateSettings({
    watchedMode: "hide",
  });

  assert.strictEqual(result.changed, true);
  assert.strictEqual(calls.set, 1);
  assert.deepStrictEqual(plain(store.youtubeSettings.settings), {
    watchedMode: "hide",
    outsideMode: "dim",
    autoMarkPercent: 80,
    accentColor: "#1a73e8",
    backgroundRefresh: true,
    showNewBadge: true,
  });
});

test("normalizeSettings ignora un sidebarCollapsed guardado", () => {
  const { YouTubeGroupsSettings } = loadModules();

  assert.deepStrictEqual(
    plain(
      YouTubeGroupsSettings.normalizeSettings({
        sidebarCollapsed: true,
        watchedMode: "hide",
      }),
    ),
    { ...DEFAULTS, watchedMode: "hide" },
  );
});

test("updateSettings con autoMarkPercent 0 escribe y conserva los otros campos", async () => {
  const { YouTubeGroupsSettings, calls } = loadModules({
    youtubeSettings: {
      version: 1,
      settings: { watchedMode: "show", outsideMode: "dim" },
    },
  });

  const result = await YouTubeGroupsSettings.updateSettings({
    autoMarkPercent: 0,
  });

  assert.strictEqual(result.changed, true);
  assert.deepStrictEqual(plain(result.settings), {
    watchedMode: "show",
    outsideMode: "dim",
    autoMarkPercent: 0,
    accentColor: "#1a73e8",
    backgroundRefresh: true,
    showNewBadge: true,
  });
  assert.strictEqual(calls.set, 1);
});

test("updateSettings rechaza claves y valores inválidos sin leer ni escribir", async () => {
  for (const patch of [
    { watchedMode: "nope" },
    { foo: 1 },
    { autoMarkPercent: 70 },
    { autoMarkPercent: "80" },
    { panelCollapsed: true },
    { sidebarCollapsed: true },
  ]) {
    const { YouTubeGroupsSettings, calls } = loadModules();

    await assert.rejects(
      YouTubeGroupsSettings.updateSettings(patch),
      /Ajuste inválido: /,
    );
    assert.strictEqual(calls.set, 0);
    assert.strictEqual(calls.get, 0);
  }
});

test("dos updateSettings a la vez conservan los dos cambios", async () => {
  const { YouTubeGroupsSettings: S, store } = loadModules({}, { latencyMs: 5 });

  await Promise.all([
    S.updateSettings({ watchedMode: "hide" }),
    S.updateSettings({ outsideMode: "dim" }),
  ]);

  assert.strictEqual(store.youtubeSettings.settings.watchedMode, "hide");
  assert.strictEqual(store.youtubeSettings.settings.outsideMode, "dim");
});
