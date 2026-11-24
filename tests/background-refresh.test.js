// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { loadModules, plain } = require("./helpers/load-modules");

const NOW = 1_800_000_000_000;
const noSleep = () => Promise.resolve();

function state(overrides = {}) {
  return {
    version: 1,
    lease: null,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastResult: null,
    lastError: null,
    accountHash: null,
    ...overrides,
  };
}

test("normalizeRefreshState descarta valores no válidos", () => {
  const { YouTubeGroupsBackgroundRefresh: R } = loadModules();

  assert.deepStrictEqual(plain(R.normalizeRefreshState("x")), state());
  assert.deepStrictEqual(
    plain(
      R.normalizeRefreshState({
        lease: { owner: 3, until: 1 },
        lastResult: "otro",
        lastError: "otro",
        lastAttemptAt: NaN,
      }),
    ),
    state(),
  );
});

test("isDue: sin intento previo, con intento reciente o antiguo y con lease", () => {
  const { YouTubeGroupsBackgroundRefresh: R } = loadModules();

  assert.strictEqual(R.isDue(state(), NOW), true);
  assert.strictEqual(
    R.isDue(state({ lastAttemptAt: NOW - R.INTERVAL_MS + 1 }), NOW),
    false,
  );
  assert.strictEqual(
    R.isDue(state({ lastAttemptAt: NOW - R.INTERVAL_MS }), NOW),
    true,
  );
  const old = NOW - 2 * R.INTERVAL_MS;
  assert.strictEqual(
    R.isDue(
      state({ lastAttemptAt: old, lease: { owner: "a", until: NOW + 1 } }),
      NOW,
    ),
    false,
  );
  assert.strictEqual(
    R.isDue(
      state({ lastAttemptAt: old, lease: { owner: "a", until: NOW } }),
      NOW,
    ),
    true,
  );
});

test("isDue: tras un error reintenta a los 10 min; tras éxito o account-mismatch, a la hora", () => {
  const { YouTubeGroupsBackgroundRefresh: R } = loadModules();

  assert.strictEqual(R.RETRY_INTERVAL_MS, 10 * 60 * 1000);
  const attempt = (lastResult, ago) =>
    R.isDue(state({ lastResult, lastAttemptAt: NOW - ago }), NOW);

  assert.strictEqual(attempt("error", R.RETRY_INTERVAL_MS - 1), false);
  assert.strictEqual(attempt("error", R.RETRY_INTERVAL_MS), true);
  assert.strictEqual(attempt("ok", R.RETRY_INTERVAL_MS), false);
  assert.strictEqual(attempt("ok", R.INTERVAL_MS), true);
  assert.strictEqual(attempt("account-mismatch", R.RETRY_INTERVAL_MS), false);
  assert.strictEqual(attempt("account-mismatch", R.INTERVAL_MS), true);
});

test("isDue con force ignora el intervalo pero no el lease", () => {
  const { YouTubeGroupsBackgroundRefresh: R } = loadModules();
  const recent = state({ lastResult: "ok", lastAttemptAt: NOW - 1000 });

  assert.strictEqual(R.isDue(recent, NOW), false);
  assert.strictEqual(R.isDue(recent, NOW, { force: true }), true);
  assert.strictEqual(
    R.isDue({ ...recent, lease: { owner: "a", until: NOW + 1 } }, NOW, {
      force: true,
    }),
    false,
  );
});

test("dos pestañas con el mismo almacén: solo una obtiene el lease", async () => {
  const first = loadModules();
  const second = loadModules({}, { store: first.store });

  const results = await Promise.all([
    first.YouTubeGroupsBackgroundRefresh.acquireLease("a", {
      now: NOW,
      sleep: noSleep,
    }),
    second.YouTubeGroupsBackgroundRefresh.acquireLease("b", {
      now: NOW,
      sleep: noSleep,
    }),
  ]);

  assert.strictEqual(results.filter(Boolean).length, 1);
  const owner = results[0] ? "a" : "b";
  assert.strictEqual(first.store.youtubeBackgroundRefresh.lease.owner, owner);
  assert.strictEqual(first.store.youtubeBackgroundRefresh.lastAttemptAt, NOW);
});

test("un lease caducado se puede tomar y uno vigente no", async () => {
  const { YouTubeGroupsBackgroundRefresh: R, store } = loadModules({
    youtubeBackgroundRefresh: state({
      lease: { owner: "viejo", until: NOW - 1 },
      lastAttemptAt: NOW - 2 * 60 * 60 * 1000,
    }),
  });

  assert.strictEqual(
    await R.acquireLease("nuevo", { now: NOW, sleep: noSleep }),
    true,
  );
  assert.strictEqual(store.youtubeBackgroundRefresh.lease.owner, "nuevo");
  assert.strictEqual(
    store.youtubeBackgroundRefresh.lease.until,
    NOW + R.LEASE_MS,
  );

  const later = NOW + R.INTERVAL_MS + 1;
  store.youtubeBackgroundRefresh.lease.until = later + 5;
  assert.strictEqual(
    await R.acquireLease("otro", { now: later, sleep: noSleep }),
    false,
  );
  assert.strictEqual(store.youtubeBackgroundRefresh.lease.owner, "nuevo");
});

test("finishRun libera el lease y guarda el resultado; el de otro owner no toca nada", async () => {
  const { YouTubeGroupsBackgroundRefresh: R, store } = loadModules();

  await R.acquireLease("a", { now: NOW, sleep: noSleep });
  const before = structuredClone(store.youtubeBackgroundRefresh);

  assert.strictEqual(
    await R.finishRun("b", { result: "ok", now: NOW + 5 }),
    false,
  );
  assert.deepStrictEqual(store.youtubeBackgroundRefresh, before);

  assert.strictEqual(
    await R.finishRun("a", {
      result: "ok",
      accountHash: "hash",
      now: NOW + 5,
    }),
    true,
  );
  assert.deepStrictEqual(
    plain(store.youtubeBackgroundRefresh),
    state({
      lastAttemptAt: NOW,
      lastSuccessAt: NOW + 5,
      lastResult: "ok",
      accountHash: "hash",
    }),
  );
});

test("finishRun con error guarda el motivo y no toca lastSuccessAt", async () => {
  const { YouTubeGroupsBackgroundRefresh: R, store } = loadModules({
    youtubeBackgroundRefresh: state({ lastSuccessAt: 42 }),
  });

  await R.acquireLease("a", { now: NOW, sleep: noSleep });
  await R.finishRun("a", { result: "error", error: "http", now: NOW + 1 });

  assert.strictEqual(store.youtubeBackgroundRefresh.lastResult, "error");
  assert.strictEqual(store.youtubeBackgroundRefresh.lastError, "http");
  assert.strictEqual(store.youtubeBackgroundRefresh.lastSuccessAt, 42);
  assert.strictEqual(store.youtubeBackgroundRefresh.lease, null);
});

test("resetAccount borra accountHash y deja isDue en true", async () => {
  const { YouTubeGroupsBackgroundRefresh: R, store } = loadModules({
    youtubeBackgroundRefresh: state({
      accountHash: "hash",
      lastAttemptAt: NOW,
      lastResult: "account-mismatch",
    }),
  });

  await R.resetAccount();

  assert.strictEqual(store.youtubeBackgroundRefresh.accountHash, null);
  assert.strictEqual(
    R.isDue(R.normalizeRefreshState(store.youtubeBackgroundRefresh), NOW),
    true,
  );
});

// --- runRefresh: comprobaciones previas y fuente a ---

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const FIXTURES = path.join(__dirname, "fixtures", "yt-data");
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), "utf8");
const YT = "https://www.youtube.com";
const COOKIE = "SAPISID=sapisid-secreto; __Secure-3PAPISID=tres-secreto";
const TOKEN_ITEM =
  '{"continuationItemRenderer":{"continuationEndpoint":{"continuationCommand":{"token":"TOKEN-INICIAL"}}}}';

/** Página de canales con un token de continuación inicial. */
const pageWithToken = () =>
  read("channels-page.html").replace(
    '"contents":[',
    `"contents":[${TOKEN_ITEM},`,
  );

/** Respuesta de continuación; sin el token siguiente es la última página. */
function continuationJson({ last }) {
  const json = JSON.parse(read("channels-continuation.json"));
  const items =
    json.onResponseReceivedActions[0].appendContinuationItemsAction
      .continuationItems;

  if (last) {
    items.pop();
  }

  return JSON.stringify(json);
}

/**
 * `fetch` simulado: sirve `page` para GET y, para cada POST, la siguiente de `posts`
 * (la última se repite). Cada elemento puede ser un texto, `{ status }` o una función que lanza.
 */
function makeFetch({
  page,
  posts = [],
  feed = read("subscriptions-page.html"),
}) {
  const calls = [];
  let post = 0;
  const respond = (item) => {
    if (typeof item === "function") {
      return item();
    }
    if (item && typeof item === "object") {
      return { ok: false, status: item.status, text: async () => "" };
    }

    return { ok: true, status: 200, text: async () => item };
  };
  const fetch = async (url, init) => {
    calls.push({ url, init });
    if (init.method === "POST") {
      const item = posts[Math.min(post, posts.length - 1)];

      post += 1;

      return respond(item);
    }

    return respond(url === `${YT}/feed/subscriptions` ? feed : page);
  };

  return { fetch, calls };
}

function run(env, options) {
  return env.YouTubeGroupsBackgroundRefresh.runRefresh({
    cookie: COOKIE,
    now: NOW,
    sleep: noSleep,
    ...options,
  });
}

const channelKey = (env, url) => env.YouTubeGroups.getChannelKey(url);
const TRES = `${YT}/@canal-tres`;

function seedStore(extra = {}) {
  return {
    youtubeGroups: {
      version: 1,
      groups: [
        {
          id: "g1",
          name: "A",
          channels: [
            { name: "Canal de Prueba Tres", url: TRES },
            { name: "Baja", url: `${YT}/@baja` },
          ],
          subgroups: [],
        },
      ],
    },
    youtubeSubscriptions: {
      version: 1,
      channels: {
        [`${YT}/@baja`]: { name: "Baja", url: `${YT}/@baja`, firstSeen: 1 },
      },
    },
    ...extra,
  };
}

test("runRefresh con sesión escribe suscripciones, descripción, avatares y bajas", async () => {
  const env = loadModules(seedStore());
  const { fetch, calls } = makeFetch({
    page: pageWithToken(),
    posts: [continuationJson({ last: true })],
  });

  const outcome = await run(env, { fetch });
  const store = plain(env.store);
  const subs = store.youtubeSubscriptions.channels;

  assert.strictEqual(outcome.result, "ok");
  assert.strictEqual(outcome.error, null);
  assert.deepStrictEqual(
    Object.values(subs)
      .map((c) => c.name)
      .sort(),
    [
      "Canal de Prueba Cuatro",
      "Canal de Prueba Dos",
      "Canal de Prueba Tres",
      "Canal de Prueba Uno",
    ],
  );
  assert.strictEqual(
    subs[channelKey(env, TRES)].description,
    "Descripción de tres",
  );
  assert.ok(
    store.youtubeAvatars.avatars[channelKey(env, TRES)].startsWith(
      "https://yt3.ggpht.com/avatar-tres",
    ),
  );
  assert.deepStrictEqual(store.youtubeGroups.groups[0].channels, [
    { name: "Canal de Prueba Tres", url: TRES },
  ]);
  assert.ok(!(`${YT}/@baja` in subs));

  assert.strictEqual(calls.length, 3);
  assert.strictEqual(calls[2].url, `${YT}/feed/subscriptions`);
  assert.strictEqual(calls[0].url, `${YT}/feed/channels`);
  assert.strictEqual(calls[0].init.credentials, "include");
  assert.strictEqual(calls[1].init.method, "POST");
  assert.match(
    calls[1].init.headers.Authorization,
    /^SAPISIDHASH \d+_[0-9a-f]+/,
  );
  assert.strictEqual(
    JSON.parse(calls[1].init.body).continuation,
    "TOKEN-INICIAL",
  );
});

test("runRefresh: una baja masiva se aplaza y una segunda ejecución la aplica", async () => {
  const many = Array.from({ length: 12 }, (_, i) => `${YT}/@c${i}`);
  const make = () =>
    makeFetch({
      page: pageWithToken(),
      posts: [continuationJson({ last: true })],
    });
  const env = loadModules({
    youtubeGroups: {
      version: 1,
      groups: [
        {
          id: "g1",
          name: "A",
          channels: [{ name: "C0", url: many[0] }],
          subgroups: [],
        },
      ],
    },
    youtubeSubscriptions: {
      version: 1,
      channels: Object.fromEntries(
        many.map((url, i) => [url, { name: `C${i}`, url, firstSeen: 1 }]),
      ),
    },
  });

  await run(env, { fetch: make().fetch });

  assert.strictEqual(env.store.youtubeGroups.groups[0].channels.length, 1);
  assert.strictEqual(env.store.youtubePendingUnsubscribes.keys.length, 12);

  await run(env, { fetch: make().fetch });

  assert.strictEqual(env.store.youtubeGroups.groups[0].channels.length, 0);
  assert.ok(!("youtubePendingUnsubscribes" in env.store));
});

test("runRefresh: un cambio de @handle con el mismo nombre no saca el canal de los grupos", async () => {
  const old = `${YT}/@viejo`;
  const env = loadModules({
    youtubeGroups: {
      version: 1,
      groups: [
        {
          id: "g1",
          name: "A",
          channels: [{ name: "Canal de Prueba Tres", url: old }],
          subgroups: [],
        },
      ],
    },
    youtubeSubscriptions: {
      version: 1,
      channels: {
        [old]: { name: "Canal de Prueba Tres", url: old, firstSeen: 1 },
      },
    },
  });
  const { fetch } = makeFetch({
    page: pageWithToken(),
    posts: [continuationJson({ last: true })],
  });

  assert.strictEqual((await run(env, { fetch })).result, "ok");
  assert.strictEqual(env.store.youtubeGroups.groups[0].channels.length, 1);
});

test("runRefresh con el tope de páginas alcanzado: altas sí, bajas no", async () => {
  const env = loadModules(seedStore());
  // Cada continuación trae un canal distinto y otro token
  let n = 0;
  const distinct = () => {
    n += 1;

    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          onResponseReceivedActions: [
            {
              appendContinuationItemsAction: {
                continuationItems: [
                  {
                    channelRenderer: {
                      title: { simpleText: `Canal ${n}` },
                      navigationEndpoint: {
                        browseEndpoint: { canonicalBaseUrl: `/@relleno-${n}` },
                      },
                    },
                  },
                  TOKEN_ONLY,
                ],
              },
            },
          ],
        }),
    };
  };
  const { fetch, calls } = makeFetch({
    page: pageWithToken(),
    posts: [distinct],
  });

  const outcome = await run(env, { fetch });
  const store = plain(env.store);

  assert.strictEqual(outcome.result, "ok");
  // MAX_CHANNEL_PAGES de la fuente a más la primera página del feed
  assert.strictEqual(
    calls.length,
    env.YouTubeGroupsBackgroundRefresh.MAX_CHANNEL_PAGES + 1,
  );
  assert.ok(`${YT}/@canal-uno` in store.youtubeSubscriptions.channels);
  assert.ok(`${YT}/@relleno-1` in store.youtubeSubscriptions.channels);
  assert.ok(`${YT}/@baja` in store.youtubeSubscriptions.channels);
  assert.strictEqual(store.youtubeGroups.groups[0].channels.length, 2);
});

for (const [label, failure, error] of [
  [
    "red",
    () => {
      throw new Error("sin red");
    },
    "network",
  ],
  ["HTTP 403", { status: 403 }, "http"],
  ["JSON roto", "{no es json", "unrecognized"],
]) {
  test(`runRefresh: fallo de ${label} en la continuación no cambia ningún dato`, async () => {
    const env = loadModules(seedStore());
    const before = structuredClone(env.store);
    const { fetch } = makeFetch({ page: pageWithToken(), posts: [failure] });

    const outcome = await run(env, { fetch });

    assert.strictEqual(outcome.result, "error");
    assert.strictEqual(outcome.error, error);
    assert.deepStrictEqual(env.store, before);
  });
}

const continuationOnly = (item) =>
  JSON.stringify({
    onResponseReceivedActions: [
      { appendContinuationItemsAction: { continuationItems: [item] } },
    ],
  });
const TOKEN_ONLY = {
  continuationItemRenderer: {
    continuationEndpoint: { continuationCommand: { token: "OTRO" } },
  },
};
// Hay marcador de continuación pero sin token que se reconozca
const BROKEN_ITEM = { continuationItemRenderer: { formaNueva: {} } };

test("runRefresh: una continuación sin canales nuevos es error/unrecognized y no cambia nada", async () => {
  const env = loadModules(seedStore());
  const before = structuredClone(env.store);
  const { fetch } = makeFetch({
    page: pageWithToken(),
    posts: [continuationOnly(TOKEN_ONLY)],
  });

  const outcome = await run(env, { fetch });

  assert.strictEqual(outcome.result, "error");
  assert.strictEqual(outcome.error, "unrecognized");
  assert.deepStrictEqual(env.store, before);
});

test("runRefresh: un continuationItemRenderer sin token reconocido no da bajas", async () => {
  for (const [label, page, posts] of [
    [
      "en la última continuación",
      pageWithToken(),
      [
        JSON.stringify({
          onResponseReceivedActions: [
            {
              appendContinuationItemsAction: {
                continuationItems: [
                  ...JSON.parse(continuationJson({ last: true }))
                    .onResponseReceivedActions[0].appendContinuationItemsAction
                    .continuationItems,
                  BROKEN_ITEM,
                ],
              },
            },
          ],
        }),
      ],
    ],
    [
      "en la primera página",
      read("channels-page.html").replace(
        '"contents":[',
        `"contents":[${JSON.stringify(BROKEN_ITEM)},`,
      ),
      [],
    ],
  ]) {
    const env = loadModules(seedStore());
    const before = structuredClone(env.store);
    const { fetch } = makeFetch({ page, posts });

    const outcome = await run(env, { fetch });

    assert.strictEqual(outcome.result, "error", label);
    assert.strictEqual(outcome.error, "unrecognized", label);
    assert.deepStrictEqual(env.store, before, label);
  }
});

test("runRefresh: una cuenta sin suscripciones es lectura correcta sin canales y sin bajas", async () => {
  const env = loadModules(seedStore());
  const before = structuredClone(env.store);
  const empty = read("channels-page.html").replace(
    /"contents":\[.*?\}\}\}\],"fin"/s,
    '"contents":{"sectionListRenderer":{"contents":[{"itemSectionRenderer":{"contents":[]}}]}},"fin"',
  );
  const { fetch, calls } = makeFetch({ page: empty });

  const outcome = await run(env, { fetch });

  assert.strictEqual(outcome.result, "ok");
  assert.strictEqual(typeof outcome.accountHash, "string");
  assert.strictEqual(calls.length, 1);
  assert.deepStrictEqual(env.store, before);
});

test("runRefresh: si la fuente b falla tras escribir la a, devuelve accountHash y la otra cuenta queda en pausa", async () => {
  const env = loadModules(seedFeed());
  const R = env.YouTubeGroupsBackgroundRefresh;
  const { fetch } = makeFetch({
    page: pageWithToken(),
    posts: [continuationJson({ last: true })],
    feed: { status: 403 },
  });

  const outcome = await run(env, { fetch });

  assert.strictEqual(outcome.result, "error");
  assert.strictEqual(typeof outcome.accountHash, "string");

  await R.acquireLease("a", { now: NOW, sleep: noSleep });
  await R.finishRun("a", { ...outcome, now: NOW });
  assert.strictEqual(
    env.store.youtubeBackgroundRefresh.accountHash,
    outcome.accountHash,
  );

  const before = structuredClone(env.store);
  const other = await run(env, {
    fetch: makeFetch({
      page: pageWithToken().replace("cuenta-inventada", "otra-cuenta"),
      posts: [continuationJson({ last: true })],
    }).fetch,
    state: R.normalizeRefreshState(env.store.youtubeBackgroundRefresh),
  });

  assert.strictEqual(other.result, "account-mismatch");
  assert.deepStrictEqual(env.store, before);
});

test("runRefresh: una petición que no responde a tiempo es error de red", async () => {
  const env = loadModules(seedStore());
  const before = structuredClone(env.store);
  const outcome = await run(env, {
    fetch: () => new Promise(() => {}),
    timeoutMs: 10,
  });

  assert.strictEqual(outcome.result, "error");
  assert.strictEqual(outcome.error, "network");
  assert.deepStrictEqual(env.store, before);
});

test("runRefresh: página sin respuesta válida da error sin escribir", async () => {
  const env = loadModules(seedStore());
  const before = structuredClone(env.store);

  for (const [page, error] of [
    [read("unknown-page.html"), "unrecognized"],
    [{ status: 500 }, "http"],
  ]) {
    const { fetch } = makeFetch({ page });
    const outcome = await run(env, { fetch });

    assert.strictEqual(outcome.result, "error");
    assert.strictEqual(outcome.error, error);
  }
  assert.deepStrictEqual(env.store, before);
});

test("runRefresh sin sesión: no-session, una sola petición y sin escribir", async () => {
  const env = loadModules(seedStore());
  const before = structuredClone(env.store);
  const { fetch, calls } = makeFetch({ page: pageWithToken() });

  const outcome = await run(env, { fetch, cookie: "" });

  assert.strictEqual(outcome.result, "no-session");
  assert.strictEqual(calls.length, 1);
  assert.deepStrictEqual(env.store, before);
});

test("runRefresh con otra cuenta: account-mismatch sin escribir", async () => {
  const env = loadModules(seedStore());
  const before = structuredClone(env.store);
  const { fetch, calls } = makeFetch({ page: pageWithToken() });

  const outcome = await run(env, {
    fetch,
    state: state({ accountHash: "otra-cuenta" }),
  });

  assert.strictEqual(outcome.result, "account-mismatch");
  assert.strictEqual(calls.length, 1);
  assert.deepStrictEqual(env.store, before);
});

test("runRefresh adopta el hash de la cuenta, no el identificador en claro", async () => {
  const env = loadModules(seedStore());
  const { fetch } = makeFetch({
    page: pageWithToken(),
    posts: [continuationJson({ last: true })],
  });

  const outcome = await run(env, { fetch });
  const expected = crypto
    .createHash("sha256")
    .update("cuenta-inventada||")
    .digest("hex");

  assert.strictEqual(outcome.accountHash, expected);
  assert.notStrictEqual(outcome.accountHash, "cuenta-inventada||");

  const again = await run(env, {
    fetch: makeFetch({
      page: pageWithToken(),
      posts: [continuationJson({ last: true })],
    }).fetch,
    state: state({ accountHash: expected }),
  });

  assert.strictEqual(again.result, "ok");
});

test("runRefresh con isEnabled a false tras la primera petición no pide ni escribe más", async () => {
  const env = loadModules(seedStore());
  const before = structuredClone(env.store);
  const { fetch, calls } = makeFetch({
    page: pageWithToken(),
    posts: [continuationJson({ last: true })],
  });

  const outcome = await run(env, {
    fetch,
    isEnabled: () => calls.length === 0,
  });

  assert.strictEqual(outcome.result, null);
  assert.strictEqual(calls.length, 1);
  assert.deepStrictEqual(env.store, before);
});

test("runRefresh pausa entre peticiones, solo pide a www.youtube.com y no guarda secretos", async () => {
  const env = loadModules(seedStore());
  const sleeps = [];
  const { fetch, calls } = makeFetch({
    page: pageWithToken(),
    posts: [continuationJson({ last: true })],
  });

  await run(env, { fetch, sleep: async (ms) => sleeps.push(ms) });

  const pause = env.YouTubeGroupsBackgroundRefresh.REQUEST_PAUSE_MS;

  assert.deepStrictEqual(sleeps, [pause, pause]);
  for (const call of calls) {
    assert.strictEqual(new URL(call.url).origin, YT);
  }
  const stored = JSON.stringify(env.store);

  assert.ok(!stored.includes("sapisid-secreto"));
  assert.ok(!stored.includes("tres-secreto"));
  assert.ok(!stored.includes("cuenta-inventada"));
});

// --- runRefresh: fuente b (feed de suscripciones) ---

const UNO = `${YT}/@canal-uno`;
const TRES_UC = `${YT}/channel/UCinventado0000000000003`;
const DAY = 24 * 60 * 60 * 1000;

function seedFeed(extra = {}) {
  return {
    youtubeGroups: {
      version: 1,
      groups: [
        {
          id: "g1",
          name: "A",
          channels: [
            { name: "Canal de Prueba Uno", url: UNO },
            { name: "Canal de Prueba Tres", url: TRES_UC },
          ],
          subgroups: [],
        },
      ],
    },
    youtubeNewVideos: { since: 1, videos: {}, visits: { g1: 5 } },
    ...extra,
  };
}

const FEED_KEYS = ["youtubeNewVideos", "youtubeChannelActivity"];

test("runRefresh escribe vídeos nuevos de canales agrupados y la actividad sin reconocer grupos", async () => {
  const env = loadModules(seedFeed());
  const { fetch } = makeFetch({
    page: pageWithToken(),
    posts: [continuationJson({ last: true })],
  });

  // El almacén de actividad usa el reloj real: se ejecuta con la hora real
  const now = Date.now();
  const outcome = await run(env, { fetch, now });
  const store = plain(env.store);
  const videos = store.youtubeNewVideos.videos;

  assert.strictEqual(outcome.result, "ok");
  // Solo canales agrupados (el de vidDos0000B no lo está); sin edad se guarda pero no cuenta
  assert.deepStrictEqual(Object.keys(videos).sort(), [
    "vidSinEdad0",
    "vidTres000C",
    "vidUno0000A",
  ]);
  assert.strictEqual(videos.vidSinEdad0.publishedBefore, null);
  assert.strictEqual(videos.vidUno0000A.publishedBefore, now - 3 * DAY);
  assert.strictEqual(videos.vidTres000C.publishedBefore, now - 5 * 3600 * 1000);
  assert.deepStrictEqual(store.youtubeNewVideos.visits, { g1: 5 });

  const activity = store.youtubeChannelActivity;

  assert.strictEqual(typeof activity.lastFeedAt, "number");
  assert.strictEqual(
    activity.channels[channelKey(env, UNO)].lastPublished,
    now - 3 * DAY,
  );
  assert.strictEqual(
    activity.channels[channelKey(env, TRES_UC)].lastPublished,
    now - 5 * 3600 * 1000,
  );
});

test("runRefresh no devuelve stats y finishRun no guarda lastStats ni secretos", async () => {
  const env = loadModules(seedFeed());
  const { fetch } = makeFetch({
    page: pageWithToken(),
    posts: [continuationJson({ last: true })],
  });
  const outcome = await run(env, { fetch, now: Date.now() });

  assert.strictEqual(outcome.result, "ok");
  assert.ok(!("stats" in outcome));

  const R = env.YouTubeGroupsBackgroundRefresh;
  const owner = "o1";

  await env.YouTubeGroupsStorage.saveBackgroundRefresh({
    lease: { owner, until: Date.now() + 60000 },
  });
  assert.strictEqual(await R.finishRun(owner, outcome), true);

  const saved = plain(env.store.youtubeBackgroundRefresh);
  const text = JSON.stringify(env.store);

  assert.ok(!("lastStats" in saved));
  assert.ok(!text.includes("SAPISID"));
  assert.ok(!text.includes("DATASYNC_ID"));
});

test("runRefresh sin lastSuccessAt pide una sola página del feed", async () => {
  const env = loadModules(seedFeed());
  const { fetch, calls } = makeFetch({
    page: pageWithToken(),
    posts: [continuationJson({ last: true })],
  });

  await run(env, { fetch });

  const feedCalls = calls.filter((c) => c.url.includes("/feed/subscriptions"));

  assert.strictEqual(feedCalls.length, 1);
  // Fuente a: GET y un POST; feed: un GET
  assert.strictEqual(calls.length, 3);
});

test("runRefresh con lastSuccessAt antiguo sigue por el feed hasta MAX_FEED_PAGES", async () => {
  const env = loadModules(seedFeed());
  const R = env.YouTubeGroupsBackgroundRefresh;
  // Cada continuación trae un vídeo de hace 3 días y otro token
  const feedPost = JSON.stringify({
    onResponseReceivedActions: [
      {
        appendContinuationItemsAction: {
          continuationItems: [
            {
              videoRenderer: {
                videoId: "vidMasPagina",
                publishedTimeText: { simpleText: "hace 3 días" },
                ownerText: {
                  runs: [
                    {
                      navigationEndpoint: {
                        browseEndpoint: { canonicalBaseUrl: "/@canal-uno" },
                      },
                    },
                  ],
                },
              },
            },
            {
              continuationItemRenderer: {
                continuationEndpoint: {
                  continuationCommand: { token: "TOKEN-SIGUE" },
                },
              },
            },
          ],
        },
      },
    ],
  });
  const { fetch, calls } = makeFetch({
    page: pageWithToken(),
    posts: [continuationJson({ last: true }), feedPost],
  });

  await run(env, {
    fetch,
    state: { ...R.normalizeRefreshState(null), lastSuccessAt: NOW - 30 * DAY },
  });

  // La primera página del feed ya trae continuación: siguen MAX_FEED_PAGES - 1 más
  assert.strictEqual(calls.length, 2 + R.MAX_FEED_PAGES);
});

test("runRefresh con lastSuccessAt reciente no sigue si la página ya llega a vídeos anteriores", async () => {
  const env = loadModules(seedFeed());
  const R = env.YouTubeGroupsBackgroundRefresh;
  const { fetch, calls } = makeFetch({
    page: pageWithToken(),
    posts: [continuationJson({ last: true })],
  });

  await run(env, {
    fetch,
    // Lo más antiguo de la primera página (2 semanas) es anterior a la última lectura
    state: { ...R.normalizeRefreshState(null), lastSuccessAt: NOW - DAY },
  });

  assert.strictEqual(calls.length, 3);
});

test("runRefresh: un fallo en el feed conserva la fuente a y no cambia las claves de la b", async () => {
  const env = loadModules(seedFeed());
  const before = plain(env.store);
  const R = env.YouTubeGroupsBackgroundRefresh;
  const { fetch } = makeFetch({
    page: pageWithToken(),
    posts: [continuationJson({ last: true }), { status: 403 }],
  });

  const outcome = await run(env, {
    fetch,
    state: { ...R.normalizeRefreshState(null), lastSuccessAt: NOW - 30 * DAY },
  });
  const store = plain(env.store);

  assert.strictEqual(outcome.result, "error");
  assert.strictEqual(outcome.error, "http");
  assert.ok(channelKey(env, TRES) in store.youtubeSubscriptions.channels);
  for (const key of FEED_KEYS) {
    assert.deepStrictEqual(store[key], before[key]);
  }
});

test("runRefresh: un feed sin vídeos reconocibles da error/unrecognized y conserva la fuente a", async () => {
  const env = loadModules(seedFeed());
  const before = plain(env.store);
  const { fetch } = makeFetch({
    page: pageWithToken(),
    posts: [continuationJson({ last: true })],
    feed: read("unknown-page.html"),
  });

  const outcome = await run(env, { fetch });
  const store = plain(env.store);

  assert.strictEqual(outcome.result, "error");
  assert.strictEqual(outcome.error, "unrecognized");
  assert.ok(channelKey(env, TRES) in store.youtubeSubscriptions.channels);
  for (const key of FEED_KEYS) {
    assert.deepStrictEqual(store[key], before[key]);
  }
});
