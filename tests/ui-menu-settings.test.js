// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { loadDom, manifestScripts } = require("./helpers/load-dom");
const {
  VIDEO_ID,
  GUIDE_HTML,
  SUBSCRIPTION_CARD_HTML,
} = require("./helpers/youtube-fixtures");

const MENU = "#youtube-groups-menu";
const GEAR = ".youtube-groups__guide-menu-button";
const TOAST = "#youtube-groups-toast";

const SETTINGS = (settings) => ({
  youtubeSettings: { version: 1, settings },
});

/**
 * Selector de un ajuste dentro del menú.
 * @param {Object} dom - DOM cargado.
 * @param {string} key - Clave del ajuste.
 * @returns {HTMLSelectElement} Selector.
 */
function setting(dom, key) {
  return dom.document.querySelector(`${MENU} [data-setting="${key}"]`);
}

/**
 * Abre el menú con el engranaje y espera a que se estabilice.
 * @param {Object} dom - DOM cargado.
 * @returns {Promise<void>}
 */
async function openMenu(dom) {
  dom.document.querySelector(GEAR).click();
  await dom.flush();
}

/**
 * Carga la guía con unos ajustes guardados y abre el menú.
 * @param {Object} settings - Ajustes guardados.
 * @param {Object} [options] - Opciones extra de loadDom.
 * @returns {Promise<Object>} DOM cargado con el menú abierto.
 */
async function loadWithSettings(settings, options = {}) {
  const dom = loadDom({
    html: GUIDE_HTML,
    store: SETTINGS(settings),
    ...options,
  });
  await dom.flush();
  await openMenu(dom);
  return dom;
}

/**
 * Cambia un selector y espera a que termine la escritura.
 * @param {Object} dom - DOM cargado.
 * @param {string} key - Clave del ajuste.
 * @param {string} value - Valor nuevo.
 * @returns {Promise<void>}
 */
async function choose(dom, key, value) {
  const select = setting(dom, key);
  select.value = value;
  select.dispatchEvent(new dom.window.Event("change"));
  await dom.flush();
}

test("Ajustes muestra lo guardado y habilita los selectores", async () => {
  const dom = await loadWithSettings({
    watchedMode: "hide",
    outsideMode: "dim",
    autoMarkPercent: 80,
  });

  assert.strictEqual(setting(dom, "watchedMode").value, "hide");
  assert.strictEqual(setting(dom, "watchedMode").disabled, false);
  assert.strictEqual(setting(dom, "outsideMode").value, "dim");
  assert.strictEqual(setting(dom, "autoMarkPercent").value, "80");
});

test("cambiar Vídeos vistos guarda watchedMode sin aviso", async () => {
  const dom = await loadWithSettings({ watchedMode: "hide" });
  await choose(dom, "watchedMode", "show");

  assert.strictEqual(dom.store.youtubeSettings.settings.watchedMode, "show");
  const toast = dom.document.querySelector(TOAST);
  assert.ok(!toast || toast.hidden);
});

test("Marcar visto al reproducir guarda un número", async () => {
  const dom = await loadWithSettings({});
  await choose(dom, "autoMarkPercent", "50");

  assert.strictEqual(dom.store.youtubeSettings.settings.autoMarkPercent, 50);
});

test("un cambio externo de youtubeSettings actualiza los selectores", async () => {
  const dom = await loadWithSettings({ watchedMode: "show" });
  await dom.browser.storage.local.set(
    SETTINGS({ watchedMode: "dim", outsideMode: "dim", autoMarkPercent: 95 }),
  );
  await dom.flush();

  assert.strictEqual(setting(dom, "watchedMode").value, "dim");
  assert.strictEqual(setting(dom, "outsideMode").value, "dim");
  assert.strictEqual(setting(dom, "autoMarkPercent").value, "95");
});

test("un cambio externo no rehabilita un selector con guardado en curso", async () => {
  const dom = await loadWithSettings({ watchedMode: "hide" });
  const originalSet = dom.browser.storage.local.set;
  let release;
  dom.browser.storage.local.set = (items) =>
    new Promise((resolve) => {
      release = () => resolve(originalSet(items));
    });
  const select = setting(dom, "watchedMode");
  select.value = "show";
  select.dispatchEvent(new dom.window.Event("change"));
  await dom.flush();
  assert.strictEqual(select.disabled, true);

  await originalSet.call(
    dom.browser.storage.local,
    SETTINGS({ watchedMode: "dim" }),
  );
  await dom.flush();
  assert.strictEqual(select.disabled, true);
  assert.strictEqual(setting(dom, "outsideMode").disabled, false);

  dom.browser.storage.local.set = originalSet;
  release();
  await dom.flush();
  assert.strictEqual(select.disabled, false);
});

test("si guardar falla, el selector vuelve atrás y se avisa", async () => {
  const dom = await loadWithSettings({ watchedMode: "hide" });
  const originalSet = dom.browser.storage.local.set;
  dom.browser.storage.local.set = async () => {
    throw new Error("sin espacio");
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    await choose(dom, "watchedMode", "show");
  } finally {
    console.error = originalError;
    dom.browser.storage.local.set = originalSet;
  }

  const select = setting(dom, "watchedMode");
  assert.strictEqual(select.value, "hide");
  assert.strictEqual(select.disabled, false);
  const alert = dom.document.querySelector(
    `${MENU} .youtube-groups__settings-error[role='alert']`,
  );
  assert.strictEqual(alert.hidden, false);
  assert.match(alert.textContent, /No se pudo guardar el ajuste: sin espacio/);
});

test("si leer los ajustes falla, se ve el error y los selectores siguen deshabilitados", async () => {
  const dom = loadDom({ html: GUIDE_HTML, store: SETTINGS({}) });
  await dom.flush();
  const originalGet = dom.browser.storage.local.get;
  dom.browser.storage.local.get = async () => {
    throw new Error("sin lectura");
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    await openMenu(dom);
  } finally {
    console.error = originalError;
    dom.browser.storage.local.get = originalGet;
  }

  const alert = dom.document.querySelector(
    `${MENU} .youtube-groups__settings-error`,
  );
  assert.strictEqual(alert.hidden, false);
  assert.match(alert.textContent, /No se pudieron leer los ajustes/);
  assert.strictEqual(setting(dom, "watchedMode").disabled, true);
  assert.strictEqual(setting(dom, "outsideMode").disabled, true);
  assert.strictEqual(setting(dom, "autoMarkPercent").disabled, true);
});

test("un cambio de youtubeSettings antes de abrir el menú no falla y se ve al abrirlo", async () => {
  const dom = loadDom({
    html: GUIDE_HTML,
    store: SETTINGS({ watchedMode: "show" }),
  });
  await dom.flush();
  assert.strictEqual(dom.document.querySelector(MENU), null);

  await dom.browser.storage.local.set(SETTINGS({ watchedMode: "hide" }));
  await dom.flush();
  await openMenu(dom);

  assert.strictEqual(setting(dom, "watchedMode").value, "hide");
});

test("cambiar Vídeos vistos a Ocultar oculta las tarjetas vistas en la pestaña", async () => {
  const dom = loadDom({
    html: GUIDE_HTML + SUBSCRIPTION_CARD_HTML,
    store: {
      ...SETTINGS({ watchedMode: "show" }),
      youtubeWatched: { version: 1, videos: { [VIDEO_ID]: { watchedAt: 1 } } },
    },
  });
  await dom.flush();
  await openMenu(dom);
  const card = dom.document.querySelector("ytd-rich-item-renderer");
  assert.ok(!card.classList.contains("youtube-groups--hidden"));

  await choose(dom, "watchedMode", "hide");
  await dom.flush();

  assert.ok(card.classList.contains("youtube-groups--hidden"));
});

const ACCENT = `${MENU} .youtube-groups__settings-color`;
const ACCENT_RESET = `${MENU} .youtube-groups__settings-color-reset`;

/**
 * Cambia el color de acento y espera a que termine la escritura.
 * @param {Object} dom - DOM cargado.
 * @param {string} value - Color nuevo.
 * @returns {Promise<void>}
 */
async function chooseAccent(dom, value) {
  const input = dom.document.querySelector(ACCENT);
  input.value = value;
  input.dispatchEvent(new dom.window.Event("change"));
  await dom.flush();
}

test("Color de acento muestra lo guardado y está habilitado", async () => {
  const dom = await loadWithSettings({ accentColor: "#00ff00" });
  const input = dom.document.querySelector(ACCENT);

  assert.strictEqual(input.type, "color");
  assert.strictEqual(input.value, "#00ff00");
  assert.strictEqual(input.disabled, false);
});

test("cambiar el color de acento lo guarda y deshabilita el control mientras tanto", async () => {
  const dom = await loadWithSettings({});
  const originalSet = dom.browser.storage.local.set;
  let release;
  dom.browser.storage.local.set = (items) =>
    new Promise((resolve) => {
      release = () => resolve(originalSet(items));
    });
  const input = dom.document.querySelector(ACCENT);
  input.value = "#ff0000";
  input.dispatchEvent(new dom.window.Event("change"));
  await dom.flush();
  assert.strictEqual(input.disabled, true);

  dom.browser.storage.local.set = originalSet;
  release();
  await dom.flush();

  assert.strictEqual(input.disabled, false);
  assert.strictEqual(dom.store.youtubeSettings.settings.accentColor, "#ff0000");
});

test("Restablecer está deshabilitado con el color por defecto y lo recupera", async () => {
  const dom = await loadWithSettings({});
  const reset = dom.document.querySelector(ACCENT_RESET);
  assert.strictEqual(
    reset.getAttribute("aria-label"),
    "Restablecer el color de acento",
  );
  assert.strictEqual(reset.disabled, true);

  await chooseAccent(dom, "#ff0000");
  assert.strictEqual(reset.disabled, false);

  reset.click();
  await dom.flush();

  assert.strictEqual(dom.store.youtubeSettings.settings.accentColor, "#1a73e8");
  assert.strictEqual(dom.document.querySelector(ACCENT).value, "#1a73e8");
  assert.strictEqual(reset.disabled, true);
});

test("si guardar el color falla, vuelve al anterior y se avisa", async () => {
  const dom = await loadWithSettings({ accentColor: "#00ff00" });
  const originalSet = dom.browser.storage.local.set;
  dom.browser.storage.local.set = async () => {
    throw new Error("sin espacio");
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    await chooseAccent(dom, "#ff0000");
  } finally {
    console.error = originalError;
    dom.browser.storage.local.set = originalSet;
  }

  const input = dom.document.querySelector(ACCENT);
  assert.strictEqual(input.value, "#00ff00");
  assert.strictEqual(input.disabled, false);
  const alert = dom.document.querySelector(
    `${MENU} .youtube-groups__settings-error[role='alert']`,
  );
  assert.strictEqual(alert.hidden, false);
  assert.match(alert.textContent, /No se pudo guardar el ajuste: sin espacio/);
});

test("un cambio externo del color de acento actualiza el control", async () => {
  const dom = await loadWithSettings({});
  await dom.browser.storage.local.set(SETTINGS({ accentColor: "#123456" }));
  await dom.flush();

  assert.strictEqual(dom.document.querySelector(ACCENT).value, "#123456");
  assert.strictEqual(dom.document.querySelector(ACCENT_RESET).disabled, false);
});

const REFRESH = `${MENU} .youtube-groups__settings-refresh`;

test("Actualizar en segundo plano está marcada por defecto y habilitada", async () => {
  const dom = await loadWithSettings({});
  const input = dom.document.querySelector(REFRESH);

  assert.strictEqual(input.type, "checkbox");
  assert.strictEqual(input.checked, true);
  assert.strictEqual(input.disabled, false);
  assert.match(
    input.closest("label").textContent,
    /Actualizar en segundo plano/,
  );
});

test("desmarcar Actualizar en segundo plano guarda false", async () => {
  const dom = await loadWithSettings({});
  const input = dom.document.querySelector(REFRESH);
  input.checked = false;
  input.dispatchEvent(new dom.window.Event("change"));
  await dom.flush();

  assert.strictEqual(
    dom.store.youtubeSettings.settings.backgroundRefresh,
    false,
  );
  assert.strictEqual(input.checked, false);
  assert.strictEqual(input.disabled, false);
});

test("si guardar la casilla falla, vuelve a marcarse y se avisa", async () => {
  const dom = await loadWithSettings({});
  const originalSet = dom.browser.storage.local.set;
  dom.browser.storage.local.set = async () => {
    throw new Error("sin espacio");
  };
  const originalError = console.error;
  console.error = () => {};
  const input = dom.document.querySelector(REFRESH);
  try {
    input.checked = false;
    input.dispatchEvent(new dom.window.Event("change"));
    await dom.flush();
  } finally {
    console.error = originalError;
    dom.browser.storage.local.set = originalSet;
  }

  assert.strictEqual(input.checked, true);
  assert.strictEqual(input.disabled, false);
  const alert = dom.document.querySelector(
    `${MENU} .youtube-groups__settings-error[role='alert']`,
  );
  assert.strictEqual(alert.hidden, false);
  assert.match(alert.textContent, /No se pudo guardar el ajuste: sin espacio/);
});

test("un cambio externo de backgroundRefresh actualiza la casilla", async () => {
  const dom = await loadWithSettings({});
  await dom.browser.storage.local.set(SETTINGS({ backgroundRefresh: false }));
  await dom.flush();

  assert.strictEqual(dom.document.querySelector(REFRESH).checked, false);
});

const BADGE = `${MENU} .youtube-groups__settings-new-badge`;

test("Marcar vídeos nuevos está marcada por defecto, habilitada y entre el último selector y el color", async () => {
  const dom = await loadWithSettings({});
  const input = dom.document.querySelector(BADGE);

  assert.strictEqual(input.type, "checkbox");
  assert.strictEqual(input.checked, true);
  assert.strictEqual(input.disabled, false);
  assert.match(
    input.closest("label").textContent,
    /Marcar vídeos nuevos en las miniaturas/,
  );
  const row = input.closest(".youtube-groups__setting");
  assert.ok(
    row.previousElementSibling.querySelector(
      '[data-setting="autoMarkPercent"]',
    ),
  );
  assert.ok(
    row.nextElementSibling.querySelector(".youtube-groups__settings-color"),
  );
});

test("desmarcar Marcar vídeos nuevos guarda false y se deshabilita mientras guarda", async () => {
  const dom = await loadWithSettings({});
  const input = dom.document.querySelector(BADGE);
  const originalSet = dom.browser.storage.local.set;
  let release;
  dom.browser.storage.local.set = (...args) =>
    new Promise((resolve) => {
      release = () =>
        resolve(originalSet.apply(dom.browser.storage.local, args));
    });
  input.checked = false;
  input.dispatchEvent(new dom.window.Event("change"));
  await dom.flush();
  assert.strictEqual(input.disabled, true);

  dom.browser.storage.local.set = originalSet;
  release();
  await dom.flush();

  assert.strictEqual(dom.store.youtubeSettings.settings.showNewBadge, false);
  assert.strictEqual(input.checked, false);
  assert.strictEqual(input.disabled, false);
});

test("si guardar Marcar vídeos nuevos falla, vuelve a marcarse y se avisa", async () => {
  const dom = await loadWithSettings({});
  const originalSet = dom.browser.storage.local.set;
  dom.browser.storage.local.set = async () => {
    throw new Error("sin espacio");
  };
  const originalError = console.error;
  console.error = () => {};
  const input = dom.document.querySelector(BADGE);
  try {
    input.checked = false;
    input.dispatchEvent(new dom.window.Event("change"));
    await dom.flush();
  } finally {
    console.error = originalError;
    dom.browser.storage.local.set = originalSet;
  }

  assert.strictEqual(input.checked, true);
  assert.strictEqual(input.disabled, false);
  const alert = dom.document.querySelector(
    `${MENU} .youtube-groups__settings-error[role='alert']`,
  );
  assert.strictEqual(alert.hidden, false);
  assert.match(alert.textContent, /No se pudo guardar el ajuste: sin espacio/);
});

test("un cambio externo de showNewBadge actualiza la casilla", async () => {
  const dom = await loadWithSettings({});
  await dom.browser.storage.local.set(SETTINGS({ showNewBadge: false }));
  await dom.flush();

  assert.strictEqual(dom.document.querySelector(BADGE).checked, false);
});

test("YouTubeGroupsSettingsSection.create no toca el DOM fuera del contenedor", () => {
  const scripts = manifestScripts().filter((file) => file !== "content.js");
  const dom = loadDom({ scripts });
  const before = dom.document.body.innerHTML;
  const container = dom.document.createElement("div");

  const Section = dom.global("YouTubeGroupsSettingsSection");
  const section = Section.create(container);

  assert.strictEqual(dom.document.body.innerHTML, before);
  assert.strictEqual(container.querySelectorAll("select").length, 3);
  assert.strictEqual(typeof section.load, "function");
  assert.strictEqual(typeof section.applyStoredValue, "function");
  assert.strictEqual(typeof section.applyRefreshStatus, "function");
});

const STATUS = `${MENU} .youtube-groups__settings-refresh-status`;
const ACCOUNT = `${MENU} .youtube-groups__settings-refresh-account`;
const MINUTE = 60000;

/**
 * Estado sembrado de `youtubeBackgroundRefresh`.
 * @param {Object} fields - Campos que pisan los de por defecto.
 * @returns {Object} Valor del almacén.
 */
function refreshState(fields) {
  return {
    youtubeBackgroundRefresh: {
      version: 1,
      lease: null,
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastResult: null,
      lastError: null,
      accountHash: null,
      ...fields,
    },
  };
}

/**
 * Carga el menú con un estado sembrado y devuelve el texto de estado.
 * @param {Object} fields - Campos del estado.
 * @param {Object} [settings] - Ajustes guardados.
 * @returns {Promise<Object>} DOM y texto.
 */
async function statusFor(fields, settings = {}) {
  const dom = await loadWithSettings(settings, {
    store: { ...SETTINGS(settings), ...refreshState(fields) },
  });
  return { dom, text: dom.document.querySelector(STATUS).textContent };
}

test("la línea de estado muestra un texto por situación", async () => {
  const now = Date.now();
  assert.strictEqual(
    (await statusFor({}, { backgroundRefresh: false })).text,
    "Desactivada",
  );
  assert.strictEqual((await statusFor({})).text, "Aún no se ha actualizado");
  assert.strictEqual(
    (await statusFor({ lastResult: "ok", lastSuccessAt: now - 5 * MINUTE }))
      .text,
    "Actualizado hace 5 min",
  );
  assert.strictEqual(
    (await statusFor({ lastResult: "ok", lastSuccessAt: now })).text,
    "Actualizado hace menos de 1 min",
  );
  assert.strictEqual(
    (
      await statusFor({
        lastResult: "ok",
        lastSuccessAt: now - 3 * 60 * MINUTE,
      })
    ).text,
    "Actualizado hace 3 h",
  );
  assert.strictEqual(
    (
      await statusFor({
        lastResult: "ok",
        lastSuccessAt: now - 2 * 24 * 60 * MINUTE,
      })
    ).text,
    "Actualizado hace 2 días",
  );
  assert.strictEqual(
    (await statusFor({ lastResult: "no-session", lastAttemptAt: now })).text,
    "Sin sesión en YouTube: no se actualiza",
  );
  assert.strictEqual(
    (await statusFor({ lastResult: "account-mismatch", lastAttemptAt: now }))
      .text,
    "En pausa: has entrado con otra cuenta de YouTube",
  );
  assert.strictEqual(
    (
      await statusFor({
        lastResult: "error",
        lastError: "network",
        lastAttemptAt: now - 2 * MINUTE,
      })
    ).text,
    "No se pudo actualizar (hace 2 min): YouTube no responde",
  );
  assert.strictEqual(
    (
      await statusFor({
        lastResult: "error",
        lastError: "unrecognized",
        lastAttemptAt: now - 2 * MINUTE,
        lastSuccessAt: now - 3 * 60 * MINUTE,
      })
    ).text,
    "No se pudo actualizar (hace 2 min): YouTube ha cambiado su página. Última correcta hace 3 h",
  );
  assert.match(
    (
      await statusFor({
        lastResult: "error",
        lastError: "unsupported",
        lastAttemptAt: now,
      })
    ).text,
    /este Firefox no lo permite/,
  );
});

test("'Usar esta cuenta' solo aparece con account-mismatch y borra accountHash", async () => {
  const now = Date.now();
  const other = await statusFor({ lastResult: "ok", lastSuccessAt: now });
  assert.strictEqual(other.dom.document.querySelector(ACCOUNT).hidden, true);

  const { dom } = await statusFor({
    lastResult: "account-mismatch",
    lastAttemptAt: now,
    accountHash: "abc",
  });
  const button = dom.document.querySelector(ACCOUNT);
  assert.strictEqual(button.hidden, false);
  assert.strictEqual(button.textContent, "Usar esta cuenta");
  Object.defineProperty(dom.document, "visibilityState", {
    configurable: true,
    get: () => "visible",
  });

  button.click();
  await dom.flush();

  assert.strictEqual(dom.store.youtubeBackgroundRefresh.accountHash, null);
  // Lanza una comprobación inmediata: el intento queda anotado (resetAccount lo había puesto a null)
  assert.notStrictEqual(dom.store.youtubeBackgroundRefresh.lastAttemptAt, null);
});

const NOW_BUTTON = `${MENU} .youtube-groups__settings-refresh-now`;

test("'Actualizar ahora' está habilitado y lanza una ejecución ignorando el intervalo", async () => {
  const now = Date.now();
  const { dom } = await statusFor({
    lastResult: "ok",
    lastAttemptAt: now - 1000,
    lastSuccessAt: now - 1000,
  });
  const button = dom.document.querySelector(NOW_BUTTON);
  assert.strictEqual(button.textContent, "Actualizar ahora");
  assert.strictEqual(button.disabled, false);
  Object.defineProperty(dom.document, "visibilityState", {
    configurable: true,
    get: () => "visible",
  });

  button.click();
  await dom.flush();
  // El cerrojo espera LEASE_CONFIRM_MS (1 s) antes de ejecutar
  assert.notStrictEqual(dom.store.youtubeBackgroundRefresh.lease, null);
  assert.strictEqual(button.disabled, true);
  assert.strictEqual(
    dom.document.querySelector(STATUS).textContent,
    "Actualizando…",
  );
  for (
    let i = 0;
    i < 40 && dom.store.youtubeBackgroundRefresh.lease !== null;
    i += 1
  ) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await dom.flush();

  // Sin fetch en jsdom: la ejecución forzada queda anotada como unsupported
  const saved = dom.store.youtubeBackgroundRefresh;
  assert.strictEqual(saved.lastResult, "error");
  assert.strictEqual(saved.lastError, "unsupported");
  assert.strictEqual(saved.lease, null);
  assert.strictEqual(button.disabled, false);
});

test("'Actualizar ahora' se deshabilita con el ajuste desactivado o con una ejecución en curso", async () => {
  const off = await statusFor({}, { backgroundRefresh: false });
  assert.strictEqual(off.dom.document.querySelector(NOW_BUTTON).disabled, true);

  const { dom, text } = await statusFor({
    lease: { owner: "otra", until: Date.now() + MINUTE },
  });
  assert.strictEqual(text, "Actualizando…");
  assert.strictEqual(dom.document.querySelector(NOW_BUTTON).disabled, true);

  await dom.browser.storage.local.set(
    refreshState({ lastResult: "ok", lastSuccessAt: Date.now() }),
  );
  await dom.flush();

  assert.strictEqual(dom.document.querySelector(NOW_BUTTON).disabled, false);
  assert.match(dom.document.querySelector(STATUS).textContent, /^Actualizado/);
});

test("un cambio de youtubeBackgroundRefresh con el menú abierto actualiza el texto", async () => {
  const { dom } = await statusFor({});
  await dom.browser.storage.local.set(
    refreshState({ lastResult: "no-session", lastAttemptAt: Date.now() }),
  );
  await dom.flush();

  assert.strictEqual(
    dom.document.querySelector(STATUS).textContent,
    "Sin sesión en YouTube: no se actualiza",
  );
});

test("un cambio de youtubeBackgroundRefresh con el menú sin abrir no falla", async () => {
  const dom = loadDom({ html: GUIDE_HTML, store: SETTINGS({}) });
  await dom.flush();
  await dom.browser.storage.local.set(
    refreshState({ lastResult: "ok", lastSuccessAt: Date.now() }),
  );
  await dom.flush();

  assert.strictEqual(dom.document.querySelector(MENU), null);
});

test("desmarcar la casilla muestra 'Desactivada' en la línea de estado", async () => {
  const { dom } = await statusFor({
    lastResult: "ok",
    lastSuccessAt: Date.now(),
  });
  const input = dom.document.querySelector(REFRESH);
  input.checked = false;
  input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  await dom.flush();

  assert.strictEqual(
    dom.document.querySelector(STATUS).textContent,
    "Desactivada",
  );
});
