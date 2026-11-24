// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { loadDom, manifestScripts } = require("./helpers/load-dom");
const { makeGroup, groupsStore } = require("./helpers/youtube-fixtures");

const YT = "https://www.youtube.com";
const V1 = "aaaaaaaaaaa";
const V2 = "bbbbbbbbbbb";
const KEY_UNO = `${YT}/@uno`;
const TWO_HOURS = 2 * 60 * 60 * 1000;
const TOLERANCE = 60 * 1000;

const GROUPS = [makeGroup("A", { channels: [{ name: "Uno", url: KEY_UNO }] })];

/** Tarjeta de vídeo de un canal, con o sin edad ("hace 2 horas"). */
function cardHtml(videoId, handle, { age = true } = {}) {
  return `
  <ytd-rich-item-renderer>
    <a id="thumbnail" href="/watch?v=${videoId}"><img src="x.jpg"></a>
    <a id="video-title" href="/watch?v=${videoId}">Vídeo</a>
    <ytd-channel-name><a href="/@${handle}">${handle}</a></ytd-channel-name>
    <div id="metadata"><span>${age ? "hace 2 horas" : ""}</span></div>
  </ytd-rich-item-renderer>`;
}

/**
 * Carga la página sin `content.js` y crea el recolector con las piezas reales.
 * @param {Object} [options] - html, url.
 * @returns {Object} dom y ctx.
 */
function setup({ html = "", url } = {}) {
  const scripts = manifestScripts().filter((file) => file !== "content.js");
  const dom = loadDom({ html, url, scripts, store: groupsStore(GROUPS) });
  const ctx = {
    state: {
      avatars: {},
      watchedVideos: {},
      activeSelection: [],
      newVideoCounts: new Map(),
    },
    avatars: { noteCard() {} },
    dropdowns: {},
  };
  ctx.state.settings = dom.global("YouTubeGroupsSettings").DEFAULT_SETTINGS;
  ctx.newVideos = dom.global("YouTubeGroupsNewVideosUi").create(ctx);
  ctx.activity = dom.global("YouTubeGroupsChannelActivityUi").create(ctx);
  ctx.watched = dom.global("YouTubeGroupsWatchedUi").create(ctx);
  ctx.cards = dom.global("YouTubeGroupsCards").create(ctx);
  ctx.activity.setChannels(GROUPS, {});
  return { dom, ctx };
}

async function process(dom, ctx) {
  ctx.cards.scanDocument();
  await dom.flush();
  await ctx.activity.flushPending();
  await dom.flush();
}

test("en suscripciones guarda lastPublished del canal agrupado y lastFeedAt", async () => {
  const { dom, ctx } = setup({
    url: `${YT}/feed/subscriptions`,
    html: cardHtml(V1, "uno") + cardHtml(V2, "otro"),
  });
  const before = Date.now();

  await process(dom, ctx);

  const stored = dom.store.youtubeChannelActivity;
  assert.deepStrictEqual(Object.keys(stored.channels), [KEY_UNO]);
  const { lastPublished } = stored.channels[KEY_UNO];
  assert.ok(Math.abs(lastPublished - (before - TWO_HOURS)) < TOLERANCE);
  assert.ok(Math.abs(stored.lastFeedAt - before) < TOLERANCE);
});

test("en inicio guarda lastPublished y no lastFeedAt", async () => {
  const { dom, ctx } = setup({ url: `${YT}/`, html: cardHtml(V1, "uno") });

  await process(dom, ctx);

  const stored = dom.store.youtubeChannelActivity;
  assert.ok(Number.isFinite(stored.channels[KEY_UNO].lastPublished));
  assert.strictEqual(stored.lastFeedAt, null);
});

test("procesar otra vez sin cambios no escribe", async () => {
  const { dom, ctx } = setup({
    url: `${YT}/feed/subscriptions`,
    html: cardHtml(V1, "uno"),
  });
  await process(dom, ctx);
  const writes = dom.calls.set;

  await process(dom, ctx);
  await process(dom, ctx);

  assert.strictEqual(dom.calls.set, writes);
});

test("una tarjeta sin edad no guarda lastPublished; con edad después, sí", async () => {
  const { dom, ctx } = setup({
    url: `${YT}/`,
    html: cardHtml(V1, "uno", { age: false }),
  });

  await process(dom, ctx);
  const channels = dom.store.youtubeChannelActivity?.channels ?? {};
  assert.strictEqual(channels[KEY_UNO]?.lastPublished ?? null, null);

  dom.document.querySelector("#metadata span").textContent = "hace 2 horas";
  await process(dom, ctx);

  const { lastPublished } = dom.store.youtubeChannelActivity.channels[KEY_UNO];
  assert.ok(Number.isFinite(lastPublished));
});
