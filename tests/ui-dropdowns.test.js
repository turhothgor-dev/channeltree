// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { loadDom, manifestScripts } = require("./helpers/load-dom");
const {
  CHANNEL_URL,
  makeGroup,
  groupsStore,
  SUBSCRIPTION_CARD_HTML,
} = require("./helpers/youtube-fixtures");

const SUBSCRIPTION_DROPDOWN = ".youtube-groups__subscription-dropdown";
const SUBSCRIPTION_FORM = ".youtube-groups__subscription-groups-form";
const PLAYLIST_DROPDOWN = ".youtube-groups__playlist-dropdown";
const PLAYLIST_FORM = ".youtube-groups__playlist-dropdown-form";

/**
 * Carga una página de suscripciones con una tarjeta y los grupos A y B.
 * @returns {Promise<Object>} El resultado de loadDom, ya estabilizado.
 */
async function loadWithCard() {
  const dom = loadDom({
    html: SUBSCRIPTION_CARD_HTML,
    store: groupsStore([makeGroup("A"), makeGroup("B")]),
  });
  await dom.flush();
  return dom;
}

test("YouTubeGroupsDropdowns.create es una función y crearlo no toca el DOM", () => {
  const scripts = manifestScripts().filter((file) => file !== "content.js");
  const dom = loadDom({ html: SUBSCRIPTION_CARD_HTML, scripts });
  const before = dom.document.body.innerHTML;
  const Dropdowns = dom.global("YouTubeGroupsDropdowns");

  assert.strictEqual(typeof Dropdowns.create, "function");
  const dropdowns = Dropdowns.create({ state: {} });

  assert.strictEqual(dom.document.body.innerHTML, before);
  assert.strictEqual(typeof dropdowns.openSubscriptionGroupsForm, "function");
  assert.strictEqual(typeof dropdowns.openPlaylistForm, "function");
});

test('"+G" abre un único desplegable con una casilla por grupo y no se duplica', async () => {
  const dom = await loadWithCard();
  const addButton = dom.document.querySelector(
    ".youtube-groups__subscription-add-button",
  );

  addButton.click();
  await dom.flush();
  addButton.click();
  await dom.flush();

  assert.strictEqual(
    dom.document.querySelectorAll(SUBSCRIPTION_DROPDOWN).length,
    1,
  );
  const form = dom.document.querySelector(SUBSCRIPTION_FORM);
  assert.strictEqual(form.hidden, false);
  assert.strictEqual(form.querySelectorAll("input[type='checkbox']").length, 2);
});

test("marcar B y Guardar añade el canal a B en el almacenamiento", async () => {
  const dom = await loadWithCard();
  dom.document
    .querySelector(".youtube-groups__subscription-add-button")
    .click();
  await dom.flush();

  const form = dom.document.querySelector(SUBSCRIPTION_FORM);
  const checkboxB = Array.from(form.querySelectorAll("input")).find(
    (input) => input.value === "B",
  );
  checkboxB.checked = true;
  form.querySelector("button[type='submit']").click();
  await dom.flush();

  const groups = dom.store.youtubeGroups.groups;
  assert.deepStrictEqual(
    groups.find((group) => group.id === "B").channels.map((c) => c.url),
    [CHANNEL_URL],
  );
  assert.strictEqual(
    groups.find((group) => group.id === "A").channels.length,
    0,
  );
  assert.strictEqual(form.hidden, true);
});

test('"Lista" abre el desplegable de listas, "Crear" crea la lista y la deja marcada', async () => {
  const dom = await loadWithCard();
  dom.document.querySelector(".youtube-groups__playlist-button").click();
  await dom.flush();

  assert.strictEqual(
    dom.document.querySelectorAll(PLAYLIST_DROPDOWN).length,
    1,
  );
  const form = dom.document.querySelector(PLAYLIST_FORM);
  assert.strictEqual(form.hidden, false);

  dom.document.querySelector(".youtube-groups__playlist-dropdown-input").value =
    "Ver luego";
  dom.document
    .querySelector(".youtube-groups__playlist-dropdown-create")
    .click();
  await dom.flush();

  const playlists = dom.store.youtubePlaylists.playlists;
  assert.deepStrictEqual(
    playlists.map((playlist) => playlist.name),
    ["Ver luego"],
  );
  const checkbox = form.querySelector("input[type='checkbox']");
  assert.strictEqual(checkbox.value, playlists[0].id);
  assert.strictEqual(checkbox.checked, true);
});

test("abrir un desplegable oculta el otro", async () => {
  const dom = await loadWithCard();
  const addButton = dom.document.querySelector(
    ".youtube-groups__subscription-add-button",
  );
  const listButton = dom.document.querySelector(
    ".youtube-groups__playlist-button",
  );

  addButton.click();
  await dom.flush();
  assert.strictEqual(
    dom.document.querySelector(SUBSCRIPTION_FORM).hidden,
    false,
  );

  listButton.click();
  await dom.flush();
  assert.strictEqual(
    dom.document.querySelector(SUBSCRIPTION_FORM).hidden,
    true,
  );
  assert.strictEqual(dom.document.querySelector(PLAYLIST_FORM).hidden, false);

  addButton.click();
  await dom.flush();
  assert.strictEqual(dom.document.querySelector(PLAYLIST_FORM).hidden, true);
  assert.strictEqual(
    dom.document.querySelector(SUBSCRIPTION_FORM).hidden,
    false,
  );
});

const HIDE_BUTTON = ".youtube-groups__subscription-hide-button";
const TOAST = "#youtube-groups-toast";

/** Abre el desplegable de "+G" y espera a que cargue. */
async function openDropdown(dom) {
  dom.document
    .querySelector(".youtube-groups__subscription-add-button")
    .click();
  await dom.flush();
}

test('el desplegable tiene "Ocultar canal" habilitado, también sin grupos', async () => {
  const dom = loadDom({ html: SUBSCRIPTION_CARD_HTML, store: {} });
  await dom.flush();
  await openDropdown(dom);

  const button = dom.document.querySelector(HIDE_BUTTON);
  assert.strictEqual(button.disabled, false);
  assert.strictEqual(button.textContent.trim(), "Ocultar canal");
});

test('"Ocultar canal" guarda el canal, cierra el formulario y "Deshacer" lo quita', async () => {
  const dom = await loadWithCard();
  await openDropdown(dom);

  dom.document.querySelector(HIDE_BUTTON).click();
  await dom.flush();

  assert.deepStrictEqual(
    Object.keys(dom.store.youtubeHiddenChannels.channels),
    [CHANNEL_URL],
  );
  assert.strictEqual(
    dom.document.querySelector(SUBSCRIPTION_FORM).hidden,
    true,
  );
  const toast = dom.document.querySelector(TOAST);
  assert.strictEqual(toast.hidden, false);
  assert.match(
    toast.textContent,
    /Canal «Canal» oculto en inicio, búsqueda y recomendaciones/,
  );

  toast.querySelector("button").click();
  await dom.flush();

  assert.deepStrictEqual(dom.store.youtubeHiddenChannels.channels, {});
  assert.match(toast.textContent, /Deshecho/);
  assert.strictEqual(toast.querySelector("button"), null);
});

test('con el canal oculto el botón dice "Dejar de ocultar" y "Deshacer" conserva su hiddenAt', async () => {
  const hiddenAt = 1234;
  const dom = loadDom({
    html: SUBSCRIPTION_CARD_HTML,
    store: {
      ...groupsStore([makeGroup("A")]),
      youtubeHiddenChannels: {
        version: 1,
        channels: {
          [CHANNEL_URL]: { name: "Canal", url: CHANNEL_URL, hiddenAt },
        },
      },
    },
  });
  await dom.flush();
  await openDropdown(dom);

  const button = dom.document.querySelector(HIDE_BUTTON);
  assert.strictEqual(button.textContent.trim(), "Dejar de ocultar");

  button.click();
  await dom.flush();
  assert.deepStrictEqual(dom.store.youtubeHiddenChannels.channels, {});
  const toast = dom.document.querySelector(TOAST);
  assert.match(toast.textContent, /visible de nuevo/);

  toast.querySelector("button").click();
  await dom.flush();
  assert.strictEqual(
    dom.store.youtubeHiddenChannels.channels[CHANNEL_URL].hiddenAt,
    hiddenAt,
  );
});

test("el aviso con Deshacer sale aunque falle el repintado", async () => {
  const dom = await loadWithCard();
  await openDropdown(dom);

  const originalGet = dom.browser.storage.local.get;
  dom.browser.storage.local.get = async (...args) => {
    const data = await originalGet.apply(dom.browser.storage.local, args);
    if (
      dom.store.youtubeHiddenChannels &&
      Object.keys(dom.store.youtubeHiddenChannels.channels).length > 0
    ) {
      throw new Error("fallo de lectura");
    }
    return data;
  };
  dom.document.querySelector(HIDE_BUTTON).click();
  await dom.flush();
  dom.browser.storage.local.get = originalGet;

  const toast = dom.document.querySelector(TOAST);
  assert.strictEqual(toast.hidden, false);
  assert.match(toast.textContent, /oculto en inicio/);
  assert.ok(toast.querySelector("button"));
});

test("el nombre del canal con <b> aparece literal en el aviso", async () => {
  const html = SUBSCRIPTION_CARD_HTML.replace(
    ">Canal</a>",
    "><span>&lt;b&gt;X&lt;/b&gt;</span></a>",
  );
  const dom = loadDom({ html, store: groupsStore([makeGroup("A")]) });
  await dom.flush();
  await openDropdown(dom);

  dom.document.querySelector(HIDE_BUTTON).click();
  await dom.flush();

  const toast = dom.document.querySelector(TOAST);
  assert.strictEqual(toast.querySelector("b"), null);
  assert.match(toast.textContent, /<b>X<\/b>/);
});
