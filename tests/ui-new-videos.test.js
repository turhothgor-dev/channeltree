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
const V3 = "ccccccccccc";
const DAY = 24 * 60 * 60 * 1000;
const TWO_HOURS = 2 * 60 * 60 * 1000;

const GROUPS = [
  makeGroup("A", { channels: [{ name: "Uno", url: `${YT}/@uno` }] }),
];

/** Tarjeta de suscripciones "hace 2 horas" de un canal. */
function cardHtml(videoId, handle) {
  return `
  <ytd-rich-item-renderer>
    <a id="thumbnail" href="/watch?v=${videoId}"><img src="x.jpg"></a>
    <a id="video-title" href="/watch?v=${videoId}">Vídeo</a>
    <ytd-channel-name><a href="/@${handle}">${handle}</a></ytd-channel-name>
    <div id="metadata"><span>hace 2 horas</span></div>
  </ytd-rich-item-renderer>`;
}

/**
 * Carga la página sin `content.js` y crea el recolector con las piezas reales.
 * @param {Object} [options] - html, url, store.
 * @returns {Object} dom y ctx.
 */
function setup({ html = "", url, store = {}, groups = GROUPS } = {}) {
  const scripts = manifestScripts().filter((file) => file !== "content.js");
  const dom = loadDom({
    html,
    url,
    scripts,
    store: { ...groupsStore(groups), ...store },
  });
  const ctx = {
    state: {
      avatars: {},
      watchedVideos: {},
      activeSelection: [],
      newVideoCounts: new Map(),
      newVideoIds: new Set(),
    },
    avatars: { noteCard() {} },
    dropdowns: {},
  };
  ctx.state.settings = dom.global("YouTubeGroupsSettings").DEFAULT_SETTINGS;
  ctx.newVideos = dom.global("YouTubeGroupsNewVideosUi").create(ctx);
  ctx.watched = dom.global("YouTubeGroupsWatchedUi").create(ctx);
  ctx.cards = dom.global("YouTubeGroupsCards").create(ctx);
  ctx.newVideos.setGroups(groups);
  return { dom, ctx };
}

async function process(dom, ctx) {
  ctx.cards.scanDocument();
  await dom.flush();
  await ctx.newVideos.flushPending();
  await dom.flush();
}

test("guarda solo el vídeo del canal agrupado, con publishedBefore", async () => {
  const { dom, ctx } = setup({
    html: cardHtml(V1, "uno") + cardHtml(V2, "otro"),
    store: sinceStore(),
  });

  await process(dom, ctx);

  const { videos } = dom.store.youtubeNewVideos;
  assert.deepStrictEqual(Object.keys(videos), [V1]);
  assert.strictEqual(videos[V1].channel, `${YT}/@uno`);
  assert.strictEqual(videos[V1].publishedBefore, videos[V1].seenAt - TWO_HOURS);
});

test("reprocesar la tarjeta no vuelve a escribir y no hay bucle", async () => {
  const { dom, ctx } = setup({ html: cardHtml(V1, "uno") });
  await process(dom, ctx);
  const writes = dom.calls.set;

  await process(dom, ctx);
  await process(dom, ctx);

  assert.strictEqual(dom.calls.set, writes);
});

test("en inicio también se anota el vídeo con publishedBefore", async () => {
  const { dom, ctx } = setup({
    url: `${YT}/`,
    html: cardHtml(V1, "uno"),
    store: sinceStore(),
  });

  await process(dom, ctx);

  const { videos } = dom.store.youtubeNewVideos;
  assert.strictEqual(videos[V1].publishedBefore, videos[V1].seenAt - TWO_HOURS);
});

test("una tarjeta sin antigüedad se completa al reprocesarla con ella, sin tocar seenAt", async () => {
  const { dom, ctx } = setup({
    html: cardHtml(V1, "uno").replace("hace 2 horas", ""),
  });
  await process(dom, ctx);
  const first = dom.store.youtubeNewVideos.videos[V1];
  assert.strictEqual(first.publishedBefore, null);

  // Reprocesar sin antigüedad no escribe
  const writes = dom.calls.set;
  await process(dom, ctx);
  assert.strictEqual(dom.calls.set, writes);

  dom.document.querySelector("#metadata span").textContent = "hace 2 horas";
  await process(dom, ctx);

  const after = dom.store.youtubeNewVideos.videos[V1];
  assert.strictEqual(typeof after.publishedBefore, "number");
  assert.strictEqual(after.seenAt, first.seenAt);
});

test("en /feed/channels no se anota nada", async () => {
  const { dom, ctx } = setup({
    url: `${YT}/feed/channels`,
    html: cardHtml(V1, "uno"),
  });

  await process(dom, ctx);

  assert.strictEqual(dom.store.youtubeNewVideos, undefined);
  assert.strictEqual(dom.calls.set, 0);
});

test("cuenta y, con el grupo seleccionado, el número sigue y no se escribe su visita", async () => {
  const { dom, ctx } = setup({
    html: cardHtml(V1, "uno"),
    store: {
      youtubeNewVideos: {
        version: 1,
        since: Date.now() - DAY,
        videos: {},
        visits: {},
      },
    },
  });
  ctx.newVideos.start();
  await dom.flush();

  await process(dom, ctx);
  assert.strictEqual(ctx.state.newVideoCounts.get("A"), 1);

  ctx.state.activeSelection = ["group:A"];
  ctx.state.activeSelectionUrls = new Set([`${YT}/@uno`]);

  dom.document.body.insertAdjacentHTML("beforeend", cardHtml(V3, "uno"));
  await process(dom, ctx);

  assert.strictEqual(dom.store.youtubeNewVideos.visits.A, undefined);
  assert.ok(Object.hasOwn(dom.store.youtubeNewVideos.videos, V3));
  assert.strictEqual(ctx.state.newVideoCounts.get("A"), 2);
});

const NESTED = [
  makeGroup("A", {
    subgroups: [
      makeGroup("A1", { channels: [{ name: "Uno", url: `${YT}/@uno` }] }),
    ],
  }),
];

/** Estado inicial con `since` de hace un día. */
function sinceStore() {
  return {
    youtubeNewVideos: {
      version: 1,
      since: Date.now() - DAY,
      videos: {},
      visits: {},
    },
  };
}

/** Prepara un recolector con el vídeo V1 contado en A y A1. */
async function setupNested() {
  const { dom, ctx } = setup({
    html: cardHtml(V1, "uno"),
    groups: NESTED,
    store: sinceStore(),
  });
  ctx.newVideos.start();
  await dom.flush();
  await process(dom, ctx);
  assert.strictEqual(ctx.state.newVideoCounts.get("A"), 1);
  assert.strictEqual(ctx.state.newVideoCounts.get("A1"), 1);
  return { dom, ctx };
}

test("salir del filtro de un grupo reconoce el grupo y sus descendientes con el mismo instante", async () => {
  for (const next of [[], ["group:B"], [`channel:${YT}/@uno`], ["ungrouped"]]) {
    const { dom, ctx } = await setupNested();
    ctx.state.activeSelection = ["group:A"];
    const previous = ctx.state.activeSelection;
    ctx.state.activeSelection = next;

    const ids = ctx.newVideos.acknowledgeExit(previous);

    assert.deepStrictEqual([...ids], ["A", "A1"]);
    // Al momento, antes del volcado
    assert.strictEqual(ctx.state.newVideoCounts.size, 0);
    await ctx.newVideos.flushPending();
    await dom.flush();
    const { visits } = dom.store.youtubeNewVideos;
    assert.deepStrictEqual(Object.keys(visits).sort(), ["A", "A1"]);
    assert.strictEqual(visits.A, visits.A1);
  }
});

test("newVideoIds contiene el vídeo tras el volcado, se vacía al salir del filtro y avisa solo si cambia", async () => {
  const { dom, ctx } = await setupNested();
  let calls = 0;
  ctx.cards = {
    applyNewVideoBadgesToAllCards: () => {
      calls += 1;
    },
  };
  assert.deepStrictEqual([...ctx.state.newVideoIds], [V1]);

  // Un recuento sin cambios no avisa
  ctx.newVideos.recount();
  assert.strictEqual(calls, 0);

  ctx.newVideos.acknowledgeExit(["group:A"]);
  assert.strictEqual(ctx.state.newVideoIds.size, 0);
  assert.strictEqual(calls, 1);
  ctx.newVideos.recount();
  assert.strictEqual(calls, 1);
  await ctx.newVideos.flushPending();
  await dom.flush();
});

test("newVideoIds se vacía al llegar youtubeWatched con el vídeo", async () => {
  const { dom, ctx } = await setupNested();
  assert.deepStrictEqual([...ctx.state.newVideoIds], [V1]);

  ctx.state.watchedVideos = { [V1]: { t: 1 } };
  ctx.newVideos.recount();
  await dom.flush();

  assert.strictEqual(ctx.state.newVideoIds.size, 0);
});

test("pasar de un grupo a su subgrupo no reconoce el subárbol de la nueva selección", async () => {
  const { dom, ctx } = await setupNested();
  const previous = ["group:A"];
  ctx.state.activeSelection = ["group:A1"];

  const ids = ctx.newVideos.acknowledgeExit(previous, Date.now(), ["group:A1"]);

  assert.deepStrictEqual([...ids], ["A"]);
  assert.strictEqual(ctx.state.newVideoCounts.get("A1"), 1);
  await ctx.newVideos.flushPending();
  await dom.flush();
  assert.deepStrictEqual(Object.keys(dom.store.youtubeNewVideos.visits), ["A"]);

  // Con un canal de A1 como nueva selección, A1 tampoco se reconoce
  const second = await setupNested();
  const channelKey = `channel:A1:${YT}/@uno`;
  const acked = second.ctx.newVideos.acknowledgeExit(["group:A"], Date.now(), [
    channelKey,
  ]);
  assert.deepStrictEqual([...acked], ["A"]);
});

test("salir del filtro de un subgrupo solo reconoce el subgrupo", async () => {
  const { dom, ctx } = await setupNested();

  ctx.newVideos.acknowledgeExit(["group:A1"]);
  await ctx.newVideos.flushPending();
  await dom.flush();

  assert.deepStrictEqual(Object.keys(dom.store.youtubeNewVideos.visits), [
    "A1",
  ]);
  assert.strictEqual(ctx.state.newVideoCounts.get("A"), 1);
  assert.strictEqual(ctx.state.newVideoCounts.has("A1"), false);
});

test("salir de un canal o de Sin grupo no cambia visits", async () => {
  const { dom, ctx } = await setupNested();
  const writes = dom.calls.set;

  assert.strictEqual(
    ctx.newVideos.acknowledgeExit([`channel:${YT}/@uno`]).length,
    0,
  );
  assert.strictEqual(ctx.newVideos.acknowledgeExit(["ungrouped"]).length, 0);
  await ctx.newVideos.flushPending();
  await dom.flush();

  assert.deepStrictEqual(dom.store.youtubeNewVideos.visits, {});
  assert.strictEqual(dom.calls.set, writes);
  assert.strictEqual(ctx.state.newVideoCounts.get("A"), 1);
});

test("un reconocimiento anterior al guardado no retrasa visits", async () => {
  const { dom, ctx } = setup({
    html: cardHtml(V1, "uno"),
    groups: NESTED,
    store: {
      youtubeNewVideos: {
        ...sinceStore().youtubeNewVideos,
        visits: { A: 5000 },
      },
    },
  });
  ctx.newVideos.start();
  await dom.flush();

  ctx.newVideos.acknowledgeExit(["group:A"], 1000);
  await ctx.newVideos.flushPending();
  await dom.flush();

  assert.strictEqual(dom.store.youtubeNewVideos.visits.A, 5000);
  assert.strictEqual(dom.store.youtubeNewVideos.visits.A1, 1000);
});

test("con un grupo seleccionado, un volcado en inicio no escribe su visita", async () => {
  const { dom, ctx } = setup({
    url: `${YT}/`,
    html: cardHtml(V1, "uno"),
    groups: NESTED,
    store: sinceStore(),
  });
  ctx.newVideos.start();
  await dom.flush();
  ctx.state.activeSelection = ["group:A"];
  ctx.state.activeSelectionUrls = new Set([`${YT}/@uno`]);

  await process(dom, ctx);

  assert.deepStrictEqual(dom.store.youtubeNewVideos.visits, {});
  assert.strictEqual(ctx.state.newVideoCounts.get("A"), 1);
});

test("sin selección, un volcado en inicio no escribe ninguna visita", async () => {
  const { dom, ctx } = setup({
    url: `${YT}/`,
    html: cardHtml(V1, "uno"),
    groups: NESTED,
    store: sinceStore(),
  });
  ctx.newVideos.start();
  await dom.flush();

  await process(dom, ctx);

  assert.ok(Object.hasOwn(dom.store.youtubeNewVideos.videos, V1));
  assert.deepStrictEqual(dom.store.youtubeNewVideos.visits, {});
});

test("navegar a inicio sin selección con content.js no cambia las visits", async () => {
  const dom = loadDom({
    url: `${YT}/`,
    html: cardHtml(V1, "uno"),
    store: {
      ...groupsStore(NESTED),
      ...sinceStore(),
    },
  });
  await dom.flush();

  dom.document.dispatchEvent(new dom.window.Event("yt-navigate-finish"));
  await dom.flush();
  // Espera real al volcado diferido (2 s) para comprobar algo observable.
  await new Promise((resolve) => setTimeout(resolve, 2300));
  await dom.flush();

  assert.ok(Object.hasOwn(dom.store.youtubeNewVideos.videos, V1));
  assert.deepStrictEqual(dom.store.youtubeNewVideos.visits, {});
});

const SUBS = `${YT}/feed/subscriptions`;
const PENDING_KEY = "youtubeGroupsPendingFilter";

function pendingGroupA() {
  return JSON.stringify({
    version: 3,
    selection: ["group:A"],
    createdAt: Date.now(),
  });
}

/** Carga con content.js y el filtro `group:A` aplicado por traspaso. */
async function loadSelected() {
  const dom = loadDom({
    url: SUBS,
    html: cardHtml(V1, "uno"),
    store: { ...groupsStore(NESTED), ...sinceStore() },
    sessionStorage: { [PENDING_KEY]: pendingGroupA() },
  });
  await dom.flush();
  return dom;
}

test("con content.js, navegar con el grupo seleccionado no escribe su visita", async () => {
  const dom = await loadSelected();

  dom.document.dispatchEvent(new dom.window.Event("yt-navigate-finish"));
  await dom.flush();
  // Espera real al volcado diferido (2 s)
  await new Promise((resolve) => setTimeout(resolve, 2300));
  await dom.flush();

  assert.ok(Object.hasOwn(dom.store.youtubeNewVideos.videos, V1));
  assert.deepStrictEqual(dom.store.youtubeNewVideos.visits, {});
});

test("pagehide con un grupo seleccionado deja el marcador y vuelca las visitas", async () => {
  const dom = await loadSelected();

  dom.window.dispatchEvent(new dom.window.Event("pagehide"));
  await dom.flush();

  const marker = JSON.parse(
    dom.sessionStorage.getItem("youtubeGroupsExitAcks"),
  );
  assert.deepStrictEqual(Object.keys(marker.acks).sort(), ["A", "A1"]);
  const { visits } = dom.store.youtubeNewVideos;
  assert.deepStrictEqual(Object.keys(visits).sort(), ["A", "A1"]);
  assert.strictEqual(visits.A, marker.acks.A);
});

test("clear-selection con un grupo seleccionado reconoce el grupo y sus descendientes", async () => {
  const dom = await loadSelected();

  dom.sendRuntimeMessage({ type: "youtube-groups:clear-selection" });
  await dom.flush();
  await new Promise((resolve) => setTimeout(resolve, 2300));
  await dom.flush();

  const { visits } = dom.store.youtubeNewVideos;
  assert.deepStrictEqual(Object.keys(visits).sort(), ["A", "A1"]);
  assert.strictEqual(visits.A, visits.A1);
});

test("pagehide con un traspaso caducado reconoce el grupo", async () => {
  const dom = await loadSelected();
  dom.sessionStorage.setItem(
    PENDING_KEY,
    JSON.stringify({
      version: 3,
      selection: ["group:A"],
      createdAt: Date.now() - 60 * 60 * 1000,
    }),
  );

  dom.window.dispatchEvent(new dom.window.Event("pagehide"));
  await dom.flush();

  assert.deepStrictEqual(
    Object.keys(dom.store.youtubeNewVideos.visits).sort(),
    ["A", "A1"],
  );
});

test("pagehide con un traspaso pendiente no reconoce el grupo", async () => {
  const dom = await loadSelected();
  dom.sessionStorage.setItem(PENDING_KEY, pendingGroupA());

  dom.window.dispatchEvent(new dom.window.Event("pagehide"));
  await dom.flush();

  assert.strictEqual(dom.sessionStorage.getItem("youtubeGroupsExitAcks"), null);
  assert.deepStrictEqual(dom.store.youtubeNewVideos.visits, {});
});

test("al cargar con el marcador de salida se aplican las visitas y se borra", async () => {
  const at = Date.now() - 1000;
  const dom = loadDom({
    url: `${YT}/`,
    html: cardHtml(V1, "uno"),
    store: { ...groupsStore(NESTED), ...sinceStore() },
    sessionStorage: {
      youtubeGroupsExitAcks: JSON.stringify({
        version: 1,
        acks: { A: at, A1: at },
      }),
    },
  });
  await dom.flush();
  await new Promise((resolve) => setTimeout(resolve, 2300));
  await dom.flush();

  assert.strictEqual(dom.store.youtubeNewVideos.visits.A, at);
  assert.strictEqual(dom.store.youtubeNewVideos.visits.A1, at);
  assert.strictEqual(dom.sessionStorage.getItem("youtubeGroupsExitAcks"), null);
});
