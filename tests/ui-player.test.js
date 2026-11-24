// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { loadDom, manifestScripts } = require("./helpers/load-dom");
const {
  VIDEO_ID,
  SHORT_ID_2,
  WATCH_PAGE_HTML,
  SHORTS_PAGE_HTML,
} = require("./helpers/youtube-fixtures");

const PLAYER_CONTROL = ".youtube-groups__player-actions";
const SHORTS_CONTROL = ".youtube-groups__shorts-actions";

/**
 * Carga /shorts/<VIDEO_ID> sin pantalla completa, con el reel activo
 * reproduciéndose (`video.paused` falso).
 * @param {Object} [options] - `html` y `store` opcionales.
 * @returns {Promise<Object>} El resultado de loadDom, ya estabilizado.
 */
async function loadShorts({ html = SHORTS_PAGE_HTML, store } = {}) {
  const dom = loadDom({
    url: `https://www.youtube.com/shorts/${VIDEO_ID}`,
    html,
    store,
  });
  Object.defineProperty(dom.document, "fullscreenElement", {
    value: null,
    configurable: true,
  });
  const video = dom.document.querySelector("video");
  if (video) {
    Object.defineProperty(video, "paused", { value: false });
  }
  dom.document.dispatchEvent(new dom.window.Event("fullscreenchange"));
  await dom.flush();
  return dom;
}

test("en /shorts hay un único control visible en el reel activo, también reproduciendo", async () => {
  const dom = await loadShorts();
  const reels = dom.document.querySelectorAll("ytd-reel-video-renderer");

  const controls = dom.document.querySelectorAll(SHORTS_CONTROL);
  assert.strictEqual(controls.length, 1);
  assert.strictEqual(
    controls[0].parentElement,
    reels[0].querySelector("#player-container"),
  );
  assert.strictEqual(controls[0].hidden, false);
  assert.strictEqual(reels[1].querySelector(SHORTS_CONTROL), null);
  assert.strictEqual(dom.document.querySelector(PLAYER_CONTROL), null);
});

test("sin #player-container el control de Shorts va dentro del reel", async () => {
  const dom = await loadShorts({
    html: `<ytd-reel-video-renderer is-active>
      <video></video><a href="/@canalshort">Canal Short</a>
    </ytd-reel-video-renderer>`,
  });
  const reel = dom.document.querySelector("ytd-reel-video-renderer");

  const control = dom.document.querySelector(SHORTS_CONTROL);
  assert.strictEqual(control.parentElement, reel);
});

test("+G de Shorts está habilitado y, sin enlace de canal, deshabilitado", async () => {
  const dom = await loadShorts();
  const addButton = dom.document.querySelector(
    `${SHORTS_CONTROL} .youtube-groups__subscription-add-button`,
  );
  assert.strictEqual(addButton.disabled, false);

  const none = await loadShorts({
    html: `<ytd-reel-video-renderer is-active>
      <div id="player-container"><video></video></div>
    </ytd-reel-video-renderer>`,
  });
  const noneButton = none.document.querySelector(
    `${SHORTS_CONTROL} .youtube-groups__subscription-add-button`,
  );
  assert.strictEqual(noneButton.disabled, true);
  assert.strictEqual(noneButton.title, "No se pudo identificar el canal");
});

test("+G de Shorts abre el desplegable de grupos con el canal y Ocultar canal", async () => {
  const dom = await loadShorts();

  dom.document
    .querySelector(`${SHORTS_CONTROL} .youtube-groups__subscription-add-button`)
    .click();
  await dom.flush();

  const form = dom.document.querySelector(
    ".youtube-groups__subscription-groups-form",
  );
  assert.strictEqual(
    form.dataset.channelUrl,
    "https://www.youtube.com/@canalshort",
  );
  assert.ok(form.querySelector(".youtube-groups__subscription-hide-button"));
});

test("visto de Shorts guarda el vídeo y queda pulsado", async () => {
  const dom = await loadShorts();
  const button = dom.document.querySelector(
    `${SHORTS_CONTROL} .youtube-groups__watched-button`,
  );

  button.click();
  await dom.flush();

  assert.ok(Object.hasOwn(dom.store.youtubeWatched.videos, VIDEO_ID));
  assert.strictEqual(button.getAttribute("aria-pressed"), "true");
});

test("Lista de Shorts abre el desplegable de listas", async () => {
  const dom = await loadShorts();

  dom.document
    .querySelector(`${SHORTS_CONTROL} .youtube-groups__playlist-button`)
    .click();
  await dom.flush();

  const form = dom.document.querySelector(
    ".youtube-groups__playlist-dropdown-form",
  );
  assert.strictEqual(form.hidden, false);
});

test("pantalla completa y anuncio ocultan el control de Shorts", async () => {
  const dom = await loadShorts();
  assert.strictEqual(dom.document.querySelector(SHORTS_CONTROL).hidden, false);

  Object.defineProperty(dom.document, "fullscreenElement", {
    value: dom.document.body,
    configurable: true,
  });
  dom.document.dispatchEvent(new dom.window.Event("fullscreenchange"));
  await dom.flush();
  assert.strictEqual(dom.document.querySelector(SHORTS_CONTROL).hidden, true);

  Object.defineProperty(dom.document, "fullscreenElement", {
    value: null,
    configurable: true,
  });
  dom.document.dispatchEvent(new dom.window.Event("fullscreenchange"));
  await dom.flush();
  assert.strictEqual(dom.document.querySelector(SHORTS_CONTROL).hidden, false);

  dom.document.querySelector("#shorts-player").classList.add("ad-showing");
  // El observer no vigila `class`: cualquier mutación observada recalcula
  dom.document
    .querySelector("ytd-reel-video-renderer")
    .setAttribute("is-active", "");
  await dom.flush();
  assert.strictEqual(dom.document.querySelector(SHORTS_CONTROL).hidden, true);
});

test("un anuncio en Shorts oculta el control con solo un evento de medios", async () => {
  const dom = await loadShorts();
  assert.strictEqual(dom.document.querySelector(SHORTS_CONTROL).hidden, false);

  dom.document.querySelector("#shorts-player").classList.add("ad-showing");
  dom.document
    .querySelector("ytd-reel-video-renderer[is-active] video")
    .dispatchEvent(new dom.window.Event("playing"));
  await dom.flush();

  assert.strictEqual(dom.document.querySelector(SHORTS_CONTROL).hidden, true);
});

test("el control de Shorts solo corta Espacio e Intro", async () => {
  const dom = await loadShorts();
  const received = [];
  dom.document.addEventListener("keydown", (event) => received.push(event.key));
  const button = dom.document.querySelector(
    `${SHORTS_CONTROL} .youtube-groups__watched-button`,
  );

  for (const key of [" ", "Enter", "ArrowDown"]) {
    button.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", { key, bubbles: true }),
    );
  }

  assert.deepStrictEqual(received, ["ArrowDown"]);
});

test("en /watch no se crea control de Shorts", async () => {
  const dom = await loadWatch();

  assert.strictEqual(dom.document.querySelector(SHORTS_CONTROL), null);
});

/**
 * Pasa al segundo reel: cambia la URL y mueve `is-active`.
 * @param {Object} dom - Resultado de loadShorts.
 * @returns {Promise<void>}
 */
async function swipeToSecondShort(dom) {
  const reels = dom.document.querySelectorAll("ytd-reel-video-renderer");
  dom.window.history.pushState({}, "", `/shorts/${SHORT_ID_2}`);
  reels[0].removeAttribute("is-active");
  reels[1].setAttribute("is-active", "");
  await dom.flush();
}

test("al deslizar, el control pasa al nuevo Short con su canal y su visto", async () => {
  const dom = await loadShorts({
    store: {
      youtubeWatched: {
        version: 1,
        videos: { [SHORT_ID_2]: { watchedAt: 1 } },
      },
    },
  });

  await swipeToSecondShort(dom);

  const reels = dom.document.querySelectorAll("ytd-reel-video-renderer");
  const controls = dom.document.querySelectorAll(SHORTS_CONTROL);
  assert.strictEqual(controls.length, 1);
  assert.strictEqual(
    controls[0].parentElement,
    reels[1].querySelector("#player-container"),
  );
  assert.strictEqual(controls[0].hidden, false);
  assert.strictEqual(
    controls[0]
      .querySelector(".youtube-groups__watched-button")
      .getAttribute("aria-pressed"),
    "true",
  );

  controls[0].querySelector(".youtube-groups__subscription-add-button").click();
  await dom.flush();
  const form = dom.document.querySelector(
    ".youtube-groups__subscription-groups-form",
  );
  assert.strictEqual(
    form.dataset.channelUrl,
    "https://www.youtube.com/@otrocanal",
  );
});

test("solo cambiar la URL en Shorts actualiza el botón de visto en la siguiente mutación", async () => {
  const dom = await loadShorts({
    store: {
      youtubeWatched: {
        version: 1,
        videos: { [SHORT_ID_2]: { watchedAt: 1 } },
      },
    },
  });
  const button = dom.document.querySelector(
    `${SHORTS_CONTROL} .youtube-groups__watched-button`,
  );
  assert.notStrictEqual(button.getAttribute("aria-pressed"), "true");

  dom.window.history.pushState({}, "", `/shorts/${SHORT_ID_2}`);
  dom.document.body.appendChild(dom.document.createElement("div"));
  await dom.flush();

  assert.strictEqual(button.getAttribute("aria-pressed"), "true");
});

test("pasar al siguiente Short cierra el desplegable de grupos", async () => {
  const dom = await loadShorts();
  dom.document
    .querySelector(`${SHORTS_CONTROL} .youtube-groups__subscription-add-button`)
    .click();
  await dom.flush();
  const form = dom.document.querySelector(
    ".youtube-groups__subscription-groups-form",
  );
  assert.ok(form && !form.closest("[hidden]"));

  await swipeToSecondShort(dom);

  const after = dom.document.querySelector(
    ".youtube-groups__subscription-groups-form",
  );
  assert.ok(!after || after.closest("[hidden]") || !after.isConnected);
});

test("yt-navigate-start oculta el control de Shorts y salir de /shorts lo deja oculto", async () => {
  const dom = await loadShorts();
  assert.strictEqual(dom.document.querySelector(SHORTS_CONTROL).hidden, false);

  dom.document.dispatchEvent(new dom.window.Event("yt-navigate-start"));
  assert.strictEqual(dom.document.querySelector(SHORTS_CONTROL).hidden, true);

  dom.window.history.pushState({}, "", "/");
  dom.document.dispatchEvent(new dom.window.Event("yt-navigate-finish"));
  await dom.flush();
  assert.strictEqual(dom.document.querySelector(SHORTS_CONTROL).hidden, true);
});

/**
 * Carga /watch con el vídeo pausado (el valor por defecto de jsdom).
 * @returns {Promise<Object>} El resultado de loadDom, ya estabilizado.
 */
async function loadWatch() {
  const dom = loadDom({
    url: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
    html: WATCH_PAGE_HTML,
  });
  // jsdom no tiene `document.fullscreenElement` (undefined, no null): sin
  // pantalla completa; `fullscreenchange` recalcula el control.
  Object.defineProperty(dom.document, "fullscreenElement", { value: null });
  dom.document.dispatchEvent(new dom.window.Event("fullscreenchange"));
  await dom.flush();
  return dom;
}

test("con el vídeo pausado hay un único control visible dentro del reproductor", async () => {
  const dom = await loadWatch();
  const player = dom.document.querySelector("#movie_player");

  const controls = dom.document.querySelectorAll(PLAYER_CONTROL);
  assert.strictEqual(controls.length, 1);
  assert.strictEqual(controls[0].parentElement, player);
  assert.strictEqual(controls[0].hidden, false);
});

test("un play oculta el control", async () => {
  const dom = await loadWatch();
  const video = dom.document.querySelector("video");
  // jsdom no implementa la reproducción: se fija `paused` a mano
  Object.defineProperty(video, "paused", { value: false });

  video.dispatchEvent(new dom.window.Event("play"));
  await dom.flush();

  assert.strictEqual(dom.document.querySelectorAll(PLAYER_CONTROL).length, 1);
  assert.strictEqual(dom.document.querySelector(PLAYER_CONTROL).hidden, true);
});

test("YouTubeGroupsPlayer.create es una función y crearlo no toca el DOM", () => {
  const scripts = manifestScripts().filter((file) => file !== "content.js");
  const dom = loadDom({
    url: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
    html: WATCH_PAGE_HTML,
    scripts,
  });
  const before = dom.document.body.innerHTML;
  const Player = dom.global("YouTubeGroupsPlayer");

  assert.strictEqual(typeof Player.create, "function");
  const player = Player.create({ state: {} });

  assert.strictEqual(dom.document.body.innerHTML, before);
  assert.strictEqual(typeof player.start, "function");
  assert.strictEqual(typeof player.noteMutations, "function");
});

test("añadir el propietario tras cargar habilita +G del reproductor", async () => {
  const dom = loadDom({
    url: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
    html: `<ytd-watch-flexy video-id="${VIDEO_ID}">
      <div id="movie_player"><video></video></div>
    </ytd-watch-flexy>`,
  });
  Object.defineProperty(dom.document, "fullscreenElement", { value: null });
  dom.document.dispatchEvent(new dom.window.Event("fullscreenchange"));
  await dom.flush();
  const addButton = dom.document.querySelector(
    ".youtube-groups__subscription-add-button",
  );
  assert.strictEqual(addButton.disabled, true);

  const owner = dom.document.createElement("ytd-video-owner-renderer");
  owner.innerHTML = '<a href="/@canal">Canal</a>';
  dom.document.querySelector("ytd-watch-flexy").append(owner);
  await dom.flush();

  assert.strictEqual(addButton.disabled, false);
});

test("yt-navigate-start oculta el control", async () => {
  const dom = await loadWatch();
  assert.strictEqual(dom.document.querySelector(PLAYER_CONTROL).hidden, false);

  dom.document.dispatchEvent(new dom.window.Event("yt-navigate-start"));

  assert.strictEqual(dom.document.querySelector(PLAYER_CONTROL).hidden, true);
});
