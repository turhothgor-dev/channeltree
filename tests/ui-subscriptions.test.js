// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { loadDom, manifestScripts } = require("./helpers/load-dom");

const GUIDE = `
  <ytd-guide-renderer><div id="sections">
    <ytd-guide-section-renderer id="you">
      <ytd-guide-entry-renderer><a href="/@propio" title="Mi canal"></a></ytd-guide-entry-renderer>
    </ytd-guide-section-renderer>
    <ytd-guide-section-renderer id="subs">
      <ytd-guide-entry-renderer><a href="/feed/channels" title="Todas las suscripciones"></a></ytd-guide-entry-renderer>
      <ytd-guide-entry-renderer><a href="/@uno" title="Uno"></a></ytd-guide-entry-renderer>
      <ytd-guide-entry-renderer><a href="/@dos"><span class="title">Dos</span></a></ytd-guide-entry-renderer>
    </ytd-guide-section-renderer>
    <div id="youtube-groups-guide"><span id="own">x</span></div>
  </div></ytd-guide-renderer>`;

const NO_SUBS_GUIDE = `
  <ytd-guide-renderer><div id="sections">
    <ytd-guide-section-renderer>
      <ytd-guide-entry-renderer><a href="/@propio" title="Mi canal"></a></ytd-guide-entry-renderer>
    </ytd-guide-section-renderer>
  </div></ytd-guide-renderer>`;

/**
 * Carga la página sin `content.js` y crea el recolector con un contexto mínimo.
 * @param {string} html - HTML de la página.
 * @returns {Object} dom y ctx.
 */
function setup(html) {
  const scripts = manifestScripts().filter((file) => file !== "content.js");
  const dom = loadDom({ html, scripts });
  const ctx = { state: { avatars: {} } };
  ctx.cards = dom.global("YouTubeGroupsCards").create({
    ...ctx,
    avatars: { noteCard() {} },
    watched: {},
    dropdowns: {},
  });
  ctx.subscriptions = dom.global("YouTubeGroupsSubscriptionsUi").create(ctx);
  return { dom, ctx };
}

test("lee solo la sección con /feed/channels y guarda los dos canales con nombre", async () => {
  const { dom, ctx } = setup(GUIDE);

  ctx.subscriptions.readGuide();
  await ctx.subscriptions.flushPending();

  const channels = dom.store.youtubeSubscriptions.channels;
  assert.deepStrictEqual(Object.keys(channels).sort(), [
    "https://www.youtube.com/@dos",
    "https://www.youtube.com/@uno",
  ]);
  assert.strictEqual(channels["https://www.youtube.com/@uno"].name, "Uno");
  assert.strictEqual(channels["https://www.youtube.com/@dos"].name, "Dos");
});

test("sin sección con /feed/channels no se escribe", async () => {
  const { dom, ctx } = setup(NO_SUBS_GUIDE);

  ctx.subscriptions.readGuide();
  await ctx.subscriptions.flushPending();

  assert.strictEqual(dom.calls.set, 0);
});

test("una mutación en #youtube-groups-guide no programa lectura; en otra sección sí", () => {
  const { dom, ctx } = setup(GUIDE);
  const own = dom.document.getElementById("own");
  const other = dom.document.getElementById("subs");

  assert.strictEqual(
    ctx.subscriptions.noteMutations([{ target: own, addedNodes: [] }]),
    false,
  );
  assert.strictEqual(
    ctx.subscriptions.noteMutations([{ target: other, addedNodes: [] }]),
    true,
  );
});

const CHANNELS_URL = "https://www.youtube.com/feed/channels";
const YT = "https://www.youtube.com";

/**
 * Renderer de canal de /feed/channels.
 * @param {string} handle - Handle sin arroba; vacío = sin enlace.
 * @param {string} name - Nombre visible.
 * @param {string|null} [description] - Contenido de `#description`; `null` = sin elemento.
 * @returns {string} HTML.
 */
function renderer(handle, name, description = null) {
  const link = handle ? `<a href="/@${handle}"></a>` : "";
  const desc =
    description === null ? "" : `<div id="description">${description}</div>`;
  return `<ytd-channel-renderer>${link}<ytd-channel-name><div id="text">${name}</div></ytd-channel-name>${desc}</ytd-channel-renderer>`;
}

const CONTINUATION =
  "<ytd-continuation-item-renderer></ytd-continuation-item-renderer>";

/**
 * Prepara la página de canales con un reloj falso.
 * @param {string} body - HTML dentro de `ytd-browse`.
 * @param {Object} [options] - `url` y `store`.
 * @returns {Object} dom, ctx y el reloj (`advance`).
 */
function setupChannels(body, { url = CHANNELS_URL, store } = {}) {
  const scripts = manifestScripts().filter((file) => file !== "content.js");
  const dom = loadDom({
    url,
    html: `<ytd-browse>${body}</ytd-browse>`,
    scripts,
    store,
  });
  const timers = [];
  let now = 0;
  let nextId = 1;
  dom.window.setTimeout = (fn, delay) => {
    const id = nextId++;
    timers.push({ id, fn, at: now + delay });
    return id;
  };
  dom.window.clearTimeout = (id) => {
    const index = timers.findIndex((timer) => timer.id === id);
    if (index !== -1) {
      timers.splice(index, 1);
    }
  };
  const ctx = { state: { avatars: {} } };
  ctx.avatars = { noteCard() {} };
  ctx.watched = {};
  ctx.dropdowns = {};
  ctx.cards = dom.global("YouTubeGroupsCards").create(ctx);
  ctx.subscriptions = dom.global("YouTubeGroupsSubscriptionsUi").create(ctx);
  const clock = {
    advance(ms) {
      now += ms;
      for (const timer of timers.filter((item) => item.at <= now)) {
        timers.splice(timers.indexOf(timer), 1);
        timer.fn();
      }
    },
  };
  return { dom, ctx, clock };
}

/**
 * Procesa las tarjetas pendientes y la comprobación de la lista.
 * @param {Object} dom - Resultado de `loadDom`.
 * @param {Object} ctx - Contexto.
 * @returns {Promise<void>}
 */
async function scan(dom, ctx, { mutated = true } = {}) {
  ctx.cards.scanDocument();
  if (mutated) {
    // YouTube pinta la lista con mutaciones; aquí se simula una.
    const browse = dom.document.querySelector("ytd-browse");
    ctx.subscriptions.noteMutations([
      {
        target: browse,
        addedNodes: [...browse.children],
        removedNodes: [],
      },
    ]);
  }
  ctx.subscriptions.scheduleChannelsCheck();
  await dom.flush();
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

const THIRD = {
  name: "Tres",
  url: `${YT}/@tres`,
  firstSeen: 1,
};

test("en /feed/channels anota y guarda los canales sin borrar con continuación", async () => {
  const { dom, ctx, clock } = setupChannels(
    renderer("uno", "Uno") + renderer("dos", "Dos") + CONTINUATION,
    {
      store: {
        youtubeSubscriptions: {
          version: 1,
          channels: { [`${YT}/@tres`]: THIRD },
        },
      },
    },
  );

  await scan(dom, ctx);
  clock.advance(10000);
  await settle();
  await ctx.subscriptions.flushPending();

  const channels = dom.store.youtubeSubscriptions.channels;
  assert.deepStrictEqual(Object.keys(channels).sort(), [
    `${YT}/@dos`,
    `${YT}/@tres`,
    `${YT}/@uno`,
  ]);
  assert.strictEqual(channels[`${YT}/@uno`].name, "Uno");
});

test("con la lista completa, a los 3 s se borra lo no visto", async () => {
  const { dom, ctx, clock } = setupChannels(
    renderer("uno", "Uno") + renderer("dos", "Dos") + CONTINUATION,
    {
      store: {
        youtubeSubscriptions: {
          version: 1,
          channels: { [`${YT}/@tres`]: THIRD },
        },
      },
    },
  );
  await scan(dom, ctx);
  dom.document.querySelector("ytd-continuation-item-renderer").remove();

  await scan(dom, ctx);
  clock.advance(2999);
  await settle();
  assert.ok(`${YT}/@tres` in dom.store.youtubeSubscriptions.channels);

  clock.advance(1);
  await settle();
  await settle();

  assert.deepStrictEqual(
    Object.keys(dom.store.youtubeSubscriptions.channels).sort(),
    [`${YT}/@dos`, `${YT}/@uno`],
  );
});

test("si aparece otro canal antes de 3 s, el plazo vuelve a empezar", async () => {
  const { dom, ctx, clock } = setupChannels(renderer("uno", "Uno"), {
    store: {
      youtubeSubscriptions: {
        version: 1,
        channels: { [`${YT}/@tres`]: THIRD },
      },
    },
  });
  await scan(dom, ctx);
  clock.advance(2000);
  dom.document
    .querySelector("ytd-browse")
    .insertAdjacentHTML("beforeend", renderer("dos", "Dos"));
  await scan(dom, ctx);

  clock.advance(2000);
  await settle();
  await settle();
  assert.ok(`${YT}/@tres` in dom.store.youtubeSubscriptions.channels);

  clock.advance(1000);
  await settle();
  await settle();
  assert.strictEqual(
    `${YT}/@tres` in dom.store.youtubeSubscriptions.channels,
    false,
  );
});

test("con un renderer sin URL no se reconcilia", async () => {
  const { dom, ctx, clock } = setupChannels(
    renderer("uno", "Uno") + renderer("", "Sin enlace"),
    {
      store: {
        youtubeSubscriptions: {
          version: 1,
          channels: { [`${YT}/@tres`]: THIRD },
        },
      },
    },
  );
  await scan(dom, ctx);
  clock.advance(10000);
  await settle();
  await settle();

  assert.ok(`${YT}/@tres` in dom.store.youtubeSubscriptions.channels);
});

test("en otra página no se reconcilia nunca", async () => {
  const { dom, ctx, clock } = setupChannels(renderer("uno", "Uno"), {
    url: "https://www.youtube.com/feed/subscriptions",
    store: {
      youtubeSubscriptions: {
        version: 1,
        channels: { [`${YT}/@tres`]: THIRD },
      },
    },
  });
  await scan(dom, ctx);
  clock.advance(10000);
  await settle();
  await settle();
  await ctx.subscriptions.flushPending();

  assert.deepStrictEqual(Object.keys(dom.store.youtubeSubscriptions.channels), [
    `${YT}/@tres`,
  ]);
});

test("reconciliar dos veces en la misma visita no vuelve a escribir", async () => {
  const { dom, ctx, clock } = setupChannels(renderer("uno", "Uno"));
  await scan(dom, ctx);
  clock.advance(3000);
  await settle();
  await settle();
  await ctx.subscriptions.flushPending();
  const writes = dom.calls.set;
  assert.ok(writes >= 1);

  await scan(dom, ctx);
  clock.advance(10000);
  await settle();
  await settle();

  assert.strictEqual(dom.calls.set, writes);
});

test("volver a leer lo mismo no escribe", async () => {
  const { dom, ctx } = setup(GUIDE);

  ctx.subscriptions.readGuide();
  await ctx.subscriptions.flushPending();
  const writes = dom.calls.set;
  assert.strictEqual(writes, 1);

  ctx.subscriptions.readGuide();
  await ctx.subscriptions.flushPending();
  assert.strictEqual(dom.calls.set, writes);
});

test("una tarjeta de una página oculta de ytd-browse no se anota", async () => {
  const { dom, ctx } = setupChannels(renderer("uno", "Uno"));
  dom.document.body.insertAdjacentHTML(
    "beforeend",
    `<ytd-browse hidden>${renderer("oculto", "Oculto")}</ytd-browse>`,
  );
  ctx.subscriptions.noteChannelCard(
    dom.document.querySelector("ytd-browse[hidden] ytd-channel-renderer"),
    `${YT}/@oculto`,
  );
  await ctx.subscriptions.flushPending();

  assert.strictEqual(dom.store.youtubeSubscriptions, undefined);
});

const STORE_TRES = {
  youtubeSubscriptions: {
    version: 1,
    channels: { [`${YT}/@tres`]: THIRD },
  },
};

test("carga completa con la lista ya en el DOM y sin mutaciones reconcilia", async () => {
  const { dom, ctx, clock } = setupChannels(renderer("uno", "Uno"), {
    store: STORE_TRES,
  });
  await scan(dom, ctx, { mutated: false });
  clock.advance(3000);
  await settle();
  await settle();

  assert.strictEqual(
    `${YT}/@tres` in dom.store.youtubeSubscriptions.channels,
    false,
  );
});

test("la lista pintada antes de yt-navigate-finish se reconcilia", async () => {
  const { dom, ctx, clock } = setupChannels("", { store: STORE_TRES });
  ctx.subscriptions.beginNavigation();
  dom.document
    .querySelector("ytd-browse")
    .insertAdjacentHTML("beforeend", renderer("uno", "Uno"));
  await scan(dom, ctx);

  ctx.subscriptions.startVisit();
  await scan(dom, ctx, { mutated: false });
  clock.advance(3000);
  await settle();
  await settle();

  assert.strictEqual(
    `${YT}/@tres` in dom.store.youtubeSubscriptions.channels,
    false,
  );
});

test("navegación SPA sin mutación de la lista no se reconcilia", async () => {
  const { dom, ctx, clock } = setupChannels(renderer("uno", "Uno"), {
    store: STORE_TRES,
  });
  ctx.subscriptions.beginNavigation();
  ctx.subscriptions.startVisit();
  await scan(dom, ctx, { mutated: false });
  clock.advance(10000);
  await settle();
  await settle();

  assert.ok(`${YT}/@tres` in dom.store.youtubeSubscriptions.channels);
});

const GUIDE_WITH_TRES = `
  <ytd-guide-renderer><div id="sections">
    <ytd-guide-section-renderer>
      <ytd-guide-entry-renderer><a href="/feed/channels" title="Todas"></a></ytd-guide-entry-renderer>
      <ytd-guide-entry-renderer><a href="/@tres" title="Tres"></a></ytd-guide-entry-renderer>
    </ytd-guide-section-renderer>
  </div></ytd-guide-renderer>`;

/**
 * Reconcilia una visita que solo ve @uno, con @tres guardado y en la guía.
 * @returns {Promise<Object>} dom, ctx y el reloj.
 */
async function reconcileWithoutTres() {
  const env = setupChannels(renderer("uno", "Uno"), { store: STORE_TRES });
  env.dom.document.body.insertAdjacentHTML("beforeend", GUIDE_WITH_TRES);
  await scan(env.dom, env.ctx);
  env.clock.advance(3000);
  await settle();
  await settle();
  return env;
}

test("la guía no vuelve a dar de alta una baja", async () => {
  const { dom, ctx, clock } = await reconcileWithoutTres();
  assert.strictEqual(
    `${YT}/@tres` in dom.store.youtubeSubscriptions.channels,
    false,
  );

  ctx.subscriptions.readGuide();
  clock.advance(2000);
  await ctx.subscriptions.flushPending();
  await settle();

  assert.strictEqual(
    `${YT}/@tres` in dom.store.youtubeSubscriptions.channels,
    false,
  );
});

test("si /feed/channels vuelve a mostrar la baja, se guarda de nuevo", async () => {
  const { dom, ctx } = await reconcileWithoutTres();

  dom.document
    .querySelector("ytd-browse")
    .insertAdjacentHTML("beforeend", renderer("tres", "Tres"));
  await scan(dom, ctx);
  await ctx.subscriptions.flushPending();

  assert.ok(`${YT}/@tres` in dom.store.youtubeSubscriptions.channels);
});

test("un canal anotado desde la guía y pendiente no sobrevive a la reconciliación", async () => {
  const env = setupChannels(renderer("uno", "Uno"));
  env.dom.document.body.insertAdjacentHTML("beforeend", GUIDE_WITH_TRES);
  env.ctx.subscriptions.readGuide();
  await scan(env.dom, env.ctx);
  env.clock.advance(3000);
  await settle();
  await settle();
  await env.ctx.subscriptions.flushPending();

  assert.deepStrictEqual(
    Object.keys(env.dom.store.youtubeSubscriptions.channels),
    [`${YT}/@uno`],
  );
});

test("una baja guardada por otra pestaña no se vuelve a dar de alta desde la guía", async () => {
  const env = setupChannels(renderer("uno", "Uno"));
  env.dom.document.body.insertAdjacentHTML("beforeend", GUIDE_WITH_TRES);
  const entry = (key) => ({ name: key, url: key, firstSeen: 1 });
  const tres = `${YT}/@tres`;

  env.ctx.subscriptions.noteStoredSubscriptionsChange(
    { version: 1, channels: { [tres]: entry(tres) } },
    { version: 1, channels: {} },
  );
  env.ctx.subscriptions.readGuide();
  env.clock.advance(2000);
  await env.ctx.subscriptions.flushPending();
  await settle();

  assert.ok(!(tres in (env.dom.store.youtubeSubscriptions?.channels ?? {})));
});

/**
 * Siembra @uno (visto) y @tres (baja) en grupos, suscripciones, actividad,
 * vídeos nuevos y avatares, más @oculto en ocultos.
 * @param {number} [extra] - Suscripciones de relleno (para forzar baja masiva).
 * @returns {Object} Almacén inicial.
 */
function seedAll(extra = 0) {
  const channels = {
    [`${YT}/@uno`]: { name: "Uno", url: `${YT}/@uno`, firstSeen: 1 },
    [`${YT}/@tres`]: THIRD,
  };
  for (let i = 0; i < extra; i += 1) {
    const url = `${YT}/@relleno${i}`;
    channels[url] = { name: `R${i}`, url, firstSeen: 1 };
  }
  return {
    youtubeSubscriptions: { version: 1, channels },
    youtubeGroups: {
      version: 1,
      groups: [
        {
          id: "g1",
          name: "A",
          channels: [
            { name: "Uno", url: `${YT}/@uno` },
            { name: "Tres", url: `${YT}/@tres` },
          ],
        },
      ],
    },
    youtubeChannelActivity: {
      version: 1,
      lastFeedAt: 5,
      channels: {
        [`${YT}/@uno`]: { trackedSince: 1, lastPublished: null },
        [`${YT}/@tres`]: { trackedSince: 1, lastPublished: null },
      },
    },
    youtubeNewVideos: {
      version: 1,
      since: 1,
      videos: {
        aaaaaaaaaaa: {
          channel: `${YT}/@uno`,
          seenAt: 2,
          publishedBefore: null,
        },
        bbbbbbbbbbb: {
          channel: `${YT}/@tres`,
          seenAt: 2,
          publishedBefore: null,
        },
      },
      visits: {},
    },
    youtubeAvatars: {
      version: 1,
      avatars: { [`${YT}/@uno`]: "a.png", [`${YT}/@tres`]: "b.png" },
    },
    youtubeHiddenChannels: {
      version: 1,
      channels: {
        [`${YT}/@oculto`]: {
          name: "Oculto",
          url: `${YT}/@oculto`,
          hiddenAt: 1,
        },
      },
    },
  };
}

test("una visita completa sin la baja la quita de todas las claves, sin interfaz", async () => {
  const { dom, ctx, clock } = setupChannels(renderer("uno", "Uno"), {
    store: seedAll(),
  });
  await scan(dom, ctx);
  clock.advance(3000);
  await settle();
  await settle();
  await settle();

  const store = dom.store;
  const tres = `${YT}/@tres`;
  assert.ok(!(tres in store.youtubeSubscriptions.channels));
  assert.deepStrictEqual(
    store.youtubeGroups.groups[0].channels.map((c) => c.url),
    [`${YT}/@uno`],
  );
  assert.ok(!(tres in store.youtubeChannelActivity.channels));
  assert.deepStrictEqual(Object.keys(store.youtubeNewVideos.videos), [
    "aaaaaaaaaaa",
  ]);
  assert.ok(!(tres in store.youtubeAvatars.avatars));
  assert.ok(`${YT}/@oculto` in store.youtubeHiddenChannels.channels);
  assert.strictEqual(dom.document.querySelector("#youtube-groups-toast"), null);
});

test("una visita con lectura masiva no cambia los grupos", async () => {
  const { dom, ctx, clock } = setupChannels(renderer("uno", "Uno"), {
    store: seedAll(20),
  });
  const warn = console.warn;
  console.warn = () => {};
  try {
    await scan(dom, ctx);
    clock.advance(3000);
    await settle();
    await settle();
    await settle();
  } finally {
    console.warn = warn;
  }

  assert.strictEqual(dom.store.youtubeGroups.groups[0].channels.length, 2);
  assert.ok(`${YT}/@tres` in dom.store.youtubeSubscriptions.channels);
  assert.ok("youtubePendingUnsubscribes" in dom.store);
});

test("una mutación ajena a la lista no programa la comprobación", () => {
  const { dom, ctx } = setupChannels(renderer("uno", "Uno"));
  dom.document.body.insertAdjacentHTML("beforeend", "<div id='otro'></div>");
  const other = dom.document.querySelector("#otro");

  ctx.subscriptions.noteMutations([
    { target: other, addedNodes: [], removedNodes: [] },
  ]);
  ctx.subscriptions.noteMutations([
    { target: other, addedNodes: [other], removedNodes: [] },
  ]);

  // Sin comprobación programada no hay nada en la cola de frames.
  return dom.flush().then(() => {
    assert.strictEqual(dom.store.youtubeSubscriptions, undefined);
  });
});

test("en /feed/channels guarda la descripción normalizada del renderer", async () => {
  const { dom, ctx } = setupChannels(
    renderer("uno", "Uno", "  Hola\n   mundo  "),
  );

  await scan(dom, ctx);
  await ctx.subscriptions.flushPending();

  const channel = dom.store.youtubeSubscriptions.channels[`${YT}/@uno`];
  assert.strictEqual(channel.description, "Hola mundo");
});

test("sin #description o vacío guarda la suscripción sin descripción", async () => {
  const { dom, ctx } = setupChannels(
    renderer("uno", "Uno") + renderer("dos", "Dos", "   "),
  );

  await scan(dom, ctx);
  await ctx.subscriptions.flushPending();

  const channels = dom.store.youtubeSubscriptions.channels;
  assert.ok(!("description" in channels[`${YT}/@uno`]));
  assert.ok(!("description" in channels[`${YT}/@dos`]));
});

test("sin descripción no borra una guardada", async () => {
  const { dom, ctx } = setupChannels(renderer("uno", "Uno"), {
    store: {
      youtubeSubscriptions: {
        version: 1,
        channels: {
          [`${YT}/@uno`]: {
            name: "Uno",
            url: `${YT}/@uno`,
            firstSeen: 1,
            description: "Guardada",
          },
        },
      },
    },
  });

  await scan(dom, ctx);
  await ctx.subscriptions.flushPending();

  const channel = dom.store.youtubeSubscriptions.channels[`${YT}/@uno`];
  assert.strictEqual(channel.description, "Guardada");
});

test("si #description se rellena después, se guarda", async () => {
  const { dom, ctx } = setupChannels(renderer("uno", "Uno"));
  await scan(dom, ctx);
  await ctx.subscriptions.flushPending();
  assert.ok(
    !("description" in dom.store.youtubeSubscriptions.channels[`${YT}/@uno`]),
  );

  const card = dom.document.querySelector("ytd-channel-renderer");
  card.insertAdjacentHTML("beforeend", '<div id="description">Ya llega</div>');
  ctx.subscriptions.noteChannelCard(card, `${YT}/@uno`);
  await ctx.subscriptions.flushPending();

  assert.strictEqual(
    dom.store.youtubeSubscriptions.channels[`${YT}/@uno`].description,
    "Ya llega",
  );
});

test("la lectura de la guía después del renderer no borra la descripción", async () => {
  const { dom, ctx } = setupChannels(renderer("uno", "Uno", "Mi descripción"));
  await scan(dom, ctx);
  await ctx.subscriptions.flushPending();

  dom.document.body.insertAdjacentHTML("beforeend", GUIDE);
  ctx.subscriptions.readGuide();
  await ctx.subscriptions.flushPending();

  const channel = dom.store.youtubeSubscriptions.channels[`${YT}/@uno`];
  assert.strictEqual(channel.description, "Mi descripción");
});

test("fuera de /feed/channels no se guarda la descripción", async () => {
  const { dom, ctx } = setupChannels(renderer("uno", "Uno", "Texto"), {
    url: "https://www.youtube.com/results?search_query=uno",
  });

  await scan(dom, ctx);
  await ctx.subscriptions.flushPending();

  assert.strictEqual(dom.store.youtubeSubscriptions, undefined);
});

test("varias anotaciones con descripción en 2 s hacen una sola escritura", async () => {
  const { dom, ctx, clock } = setupChannels(
    renderer("uno", "Uno", "A") + renderer("dos", "Dos", "B"),
  );

  await scan(dom, ctx);
  const card = dom.document.querySelector("ytd-channel-renderer");
  card.querySelector("#description").textContent = "A2";
  ctx.subscriptions.noteChannelCard(card, `${YT}/@uno`);
  clock.advance(2000);
  await settle();
  await settle();

  assert.strictEqual(dom.calls.set, 1);
  const channels = dom.store.youtubeSubscriptions.channels;
  assert.strictEqual(channels[`${YT}/@uno`].description, "A2");
  assert.strictEqual(channels[`${YT}/@dos`].description, "B");
});

test("si falla el guardado, la suscripción se reintenta", async () => {
  const { dom, ctx } = setup(GUIDE);
  const set = dom.browser.storage.local.set;
  let fail = true;
  dom.browser.storage.local.set = async (items) => {
    if (fail) {
      throw new Error("fallo");
    }
    return set(items);
  };
  const log = console.error;
  console.error = () => {};
  try {
    ctx.subscriptions.readGuide();
    await ctx.subscriptions.flushPending();
  } finally {
    console.error = log;
  }
  assert.strictEqual(dom.store.youtubeSubscriptions, undefined);

  fail = false;
  ctx.subscriptions.readGuide();
  await ctx.subscriptions.flushPending();
  assert.strictEqual(
    Object.keys(dom.store.youtubeSubscriptions.channels).length,
    2,
  );
});

test("un cambio de youtubeSubscriptions repinta el panel de grupos", async () => {
  const dom = loadDom({ html: "<ytd-browse></ytd-browse>" });
  await dom.flush();
  const before = dom.calls.get;

  await dom.browser.storage.local.set({
    youtubeSubscriptions: { version: 1, channels: {} },
  });
  await dom.flush();
  await settle();

  assert.ok(dom.calls.get > before);
});
