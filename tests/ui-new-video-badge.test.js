// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { loadDom } = require("./helpers/load-dom");
const {
  makeGroup,
  groupsStore,
  GUIDE_HTML,
} = require("./helpers/youtube-fixtures");

const YT = "https://www.youtube.com";
const SUBS = `${YT}/feed/subscriptions`;
const V1 = "aaaaaaaaaaa";
const V2 = "bbbbbbbbbbb";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const BADGE = ".youtube-groups__new-badge";
const OVERLAY = "youtube-groups__card-actions--overlay";

const GROUPS = [
  makeGroup("A", { channels: [{ name: "Uno", url: `${YT}/@uno` }] }),
];

/** Tarjeta con miniatura `ytd-thumbnail` o `yt-thumbnail-view-model`. */
function cardHtml(videoId, handle, thumb = "ytd-thumbnail") {
  return `
  <ytd-rich-item-renderer>
    <${thumb}><a id="thumbnail" href="/watch?v=${videoId}"><img src="x.jpg"></a></${thumb}>
    <a id="video-title" href="/watch?v=${videoId}">Vídeo</a>
    <ytd-channel-name><a href="/@${handle}">${handle}</a></ytd-channel-name>
    <div id="metadata"><span>hace 2 horas</span></div>
  </ytd-rich-item-renderer>`;
}

/** Almacén con los vídeos dados como nuevos (vistos hace 3 horas). */
function newStore(entries, extra = {}) {
  const seenAt = Date.now() - 3 * HOUR;
  const videos = {};
  for (const [id, channel] of entries) {
    videos[id] = { channel, seenAt, publishedBefore: seenAt - 2 * HOUR };
  }
  return {
    ...groupsStore(GROUPS),
    youtubeNewVideos: {
      version: 1,
      since: Date.now() - DAY,
      videos,
      visits: {},
    },
    ...extra,
  };
}

function load({ url = SUBS, html, store, sessionStorage } = {}) {
  return loadDom({
    url,
    html: html ?? cardHtml(V1, "uno"),
    store: store ?? newStore([[V1, `${YT}/@uno`]]),
    sessionStorage,
  });
}

function selectA() {
  return {
    youtubeGroupsPendingFilter: JSON.stringify({
      version: 3,
      selection: ["group:A"],
      createdAt: Date.now(),
    }),
  };
}

test("un vídeo nuevo pinta una sola marca dentro de la miniatura y no se reescribe", async () => {
  for (const thumb of ["ytd-thumbnail", "yt-thumbnail-view-model"]) {
    const dom = load({ html: cardHtml(V1, "uno", thumb) });
    await dom.flush();

    const badges = dom.document.querySelectorAll(BADGE);
    assert.strictEqual(badges.length, 1);
    const badge = badges[0];
    const host = dom.document.querySelector(thumb);
    assert.strictEqual(badge.textContent, "Nuevo");
    assert.strictEqual(badge.parentElement, host);
    assert.strictEqual(badge.closest(`.${OVERLAY}`), null);
    assert.notStrictEqual(badge.tagName, "BUTTON");
    assert.ok(host.classList.contains("youtube-groups__new-host"));

    dom.document.dispatchEvent(new dom.window.Event("yt-navigate-finish"));
    await dom.flush();
    assert.strictEqual(dom.document.querySelectorAll(BADGE).length, 1);
    assert.strictEqual(dom.document.querySelector(BADGE), badge);
  }
});

test("los botones de la columna conservan sus clases y su orden", async () => {
  const dom = load();
  await dom.flush();

  const column = dom.document.querySelector(`.${OVERLAY}`);
  assert.ok(column);
  assert.ok(column.classList.contains("youtube-groups__subscription-control"));
  for (const child of column.children) {
    assert.ok(child.matches("button"));
    assert.ok(!child.classList.contains("youtube-groups__new-badge"));
  }
  assert.strictEqual(column.querySelector(BADGE), null);
});

test("un vídeo no nuevo, visto o de un canal sin grupo no lleva marca", async () => {
  const html = cardHtml(V1, "uno") + cardHtml(V2, "otro");
  const store = newStore([
    [V1, `${YT}/@uno`],
    [V2, `${YT}/@otro`],
  ]);
  const dom = load({ html, store });
  await dom.flush();
  const marked = [...dom.document.querySelectorAll(BADGE)].map(
    (badge) => badge.dataset.videoId,
  );
  assert.deepStrictEqual(marked, [V1]);

  const watched = load({
    store: newStore([[V1, `${YT}/@uno`]], {
      youtubeWatched: { version: 1, videos: { [V1]: { watchedAt: 1 } } },
    }),
  });
  await watched.flush();
  assert.strictEqual(watched.document.querySelector(BADGE), null);

  const old = newStore([[V1, `${YT}/@uno`]]);
  old.youtubeNewVideos.videos[V1].publishedBefore = null;
  const noAge = load({ store: old });
  await noAge.flush();
  assert.strictEqual(noAge.document.querySelector(BADGE), null);
});

test("al seleccionar el grupo la marca sigue y al quitar la selección desaparece", async () => {
  const dom = load({ sessionStorage: selectA() });
  await dom.flush();
  assert.strictEqual(dom.document.querySelectorAll(BADGE).length, 1);

  dom.document.dispatchEvent(new dom.window.Event("yt-navigate-finish"));
  await dom.flush();
  assert.strictEqual(dom.document.querySelectorAll(BADGE).length, 1);

  dom.sendRuntimeMessage({ type: "youtube-groups:clear-selection" });
  await dom.flush();
  assert.strictEqual(dom.document.querySelector(BADGE), null);
});

test("al marcar el vídeo como visto la marca desaparece", async () => {
  const dom = load();
  await dom.flush();
  assert.ok(dom.document.querySelector(BADGE));

  await dom.browser.storage.local.set({
    youtubeWatched: { version: 1, videos: { [V1]: { watchedAt: 1 } } },
  });
  await dom.flush();

  assert.strictEqual(dom.document.querySelector(BADGE), null);
});

test("otra escritura de youtubeNewVideos que añade el vídeo pinta la marca", async () => {
  const dom = load({ store: newStore([]) });
  await dom.flush();
  assert.strictEqual(dom.document.querySelector(BADGE), null);

  await dom.browser.storage.local.set({
    youtubeNewVideos: newStore([[V1, `${YT}/@uno`]]).youtubeNewVideos,
  });
  await dom.flush();

  assert.strictEqual(dom.document.querySelectorAll(BADGE).length, 1);
});

test("aparece en páginas de canal; no en Shorts ni en /feed/channels", async () => {
  const channel = load({ url: `${YT}/@uno/videos` });
  await channel.flush();
  assert.strictEqual(channel.document.querySelectorAll(BADGE).length, 1);

  const shorts = load({
    html: `
    <ytm-shorts-lockup-view-model>
      <yt-thumbnail-view-model><a href="/watch?v=${V1}"><img src="x.jpg"></a></yt-thumbnail-view-model>
      <a href="/@uno">uno</a>
    </ytm-shorts-lockup-view-model>`,
  });
  await shorts.flush();
  assert.strictEqual(shorts.document.querySelector(BADGE), null);

  const wrapped = load({
    html: `
    <ytd-item-section-renderer>
      <ytd-rich-item-renderer>
        <ytd-thumbnail><a href="/watch?v=${V1}"><img src="x.jpg"></a></ytd-thumbnail>
        <a href="/@uno">uno</a>
        <ytm-shorts-lockup-view-model></ytm-shorts-lockup-view-model>
      </ytd-rich-item-renderer>
    </ytd-item-section-renderer>`,
  });
  await wrapped.flush();
  assert.strictEqual(wrapped.document.querySelector(BADGE), null);

  const channels = load({ url: `${YT}/feed/channels` });
  await channels.flush();
  assert.strictEqual(channels.document.querySelector(BADGE), null);
});

const SETTINGS_OFF = {
  youtubeSettings: { version: 1, settings: { showNewBadge: false } },
};

/** Texto del número del bullet del grupo A en la guía (o null si no hay). */
function bulletCount(dom) {
  const bullet = dom.document.querySelector(
    "#youtube-groups-guide .youtube-groups__group-bullet--count",
  );
  return bullet ? bullet.textContent : null;
}

test("con showNewBadge desactivado no hay marca y el bullet cuenta igual", async () => {
  const html = GUIDE_HTML + cardHtml(V1, "uno");
  const on = load({ html });
  await on.flush();
  assert.strictEqual(on.document.querySelectorAll(BADGE).length, 1);
  const expected = bulletCount(on);
  assert.ok(expected);

  const off = load({
    html,
    store: newStore([[V1, `${YT}/@uno`]], SETTINGS_OFF),
  });
  await off.flush();
  assert.strictEqual(off.document.querySelectorAll(BADGE).length, 0);
  assert.strictEqual(bulletCount(off), expected);
});

test("cambiar showNewBadge en el almacén quita y repone la marca sin recargar", async () => {
  const dom = load();
  await dom.flush();
  assert.strictEqual(dom.document.querySelectorAll(BADGE).length, 1);

  await dom.browser.storage.local.set(SETTINGS_OFF);
  await dom.flush();
  assert.strictEqual(dom.document.querySelectorAll(BADGE).length, 0);

  await dom.browser.storage.local.set({
    youtubeSettings: { version: 1, settings: { showNewBadge: true } },
  });
  await dom.flush();
  assert.strictEqual(dom.document.querySelectorAll(BADGE).length, 1);
});

test("CSS: reglas de la marca, movimiento reducido y tema oscuro", () => {
  const css = fs.readFileSync(
    path.join(__dirname, "..", "ui", "cards.css"),
    "utf8",
  );
  const rule = /\.youtube-groups__new-badge\s*\{([^}]*)\}/.exec(css);
  assert.ok(rule);
  assert.match(rule[1], /var\(--yg-accent/);
  assert.match(rule[1], /pointer-events:\s*none/);
  assert.match(css, /html\[dark\]\s+\.youtube-groups__new-badge/);
  const media =
    /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?\n)\}/.exec(css);
  assert.ok(media);
  assert.match(media[1], /\.youtube-groups__new-badge/);
  assert.match(media[1], /animation:\s*none/);

  // Ningún selector de la marca usa clases de la columna de botones
  const selectors = [...css.matchAll(/([^{}]+)\{/g)]
    .map((match) => match[1].trim())
    .filter((selector) => selector.includes("new-badge"));
  assert.ok(selectors.length > 0);
  for (const selector of selectors) {
    assert.ok(!selector.includes("card-actions"), selector);
    assert.ok(!selector.includes("data-youtube-groups-thumb-host"), selector);
  }
});
