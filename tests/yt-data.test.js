// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { loadModules, plain } = require("./helpers/load-modules");

const { YouTubeGroupsYtData: yt } = loadModules();

const page = fs.readFileSync(
  path.join(__dirname, "fixtures", "yt-data", "channels-page.html"),
  "utf8",
);

test("readInitialData extrae el JSON con llaves y comillas escapadas en cadenas", () => {
  const data = plain(yt.readInitialData(page));
  assert.strictEqual(data.title, 'Llave } suelta y "comillas" con {llaves}');
  assert.strictEqual(data.fin, '\\"}');
  assert.strictEqual(data.contents.length, 2);
});

test("extractJsonAfter devuelve null sin marcador, sin objeto o con JSON roto", () => {
  assert.strictEqual(yt.extractJsonAfter(page, "var otraCosa = "), null);
  assert.strictEqual(yt.readInitialData("<html></html>"), null);
  assert.strictEqual(yt.extractJsonAfter('x = {"a": 1', "x = "), null);
  assert.strictEqual(yt.extractJsonAfter("x = {a: 1};", "x = "), null);
  assert.strictEqual(yt.extractJsonAfter('x = "texto"', "x = "), null);
  assert.strictEqual(yt.extractJsonAfter(null, "x = "), null);
});

test("readInitialData acepta el marcador window[...]", () => {
  const html = 'window["ytInitialData"] = {"a":{"b":"}"}};</script>';
  assert.deepStrictEqual(plain(yt.readInitialData(html)), { a: { b: "}" } });
});

test("readYtcfg fusiona los dos ytcfg.set y los posteriores pisan", () => {
  const ytcfg = plain(yt.readYtcfg(page));
  assert.strictEqual(ytcfg.LOGGED_IN, true);
  assert.strictEqual(ytcfg.INNERTUBE_CLIENT_VERSION, "2.20990101.00.00");
  assert.strictEqual(ytcfg.INNERTUBE_CONTEXT.client.hl, "es");
  const pisado = 'ytcfg.set({"A":1,"B":1});ytcfg.set({"B":2});';
  assert.deepStrictEqual(plain(yt.readYtcfg(pisado)), { A: 1, B: 2 });
  assert.strictEqual(yt.readYtcfg("<html></html>"), null);
  assert.strictEqual(yt.readYtcfg('ytcfg.set("K", 1);'), null);
});

test("getCookie lee una cookie o devuelve null", () => {
  assert.strictEqual(yt.getCookie("a=1; SAPISID=xyz; b=2", "SAPISID"), "xyz");
  assert.strictEqual(yt.getCookie("a=1; b=2", "SAPISID"), null);
  assert.strictEqual(yt.getCookie("XSAPISID=1", "SAPISID"), null);
  assert.strictEqual(yt.getCookie(undefined, "a"), null);
});

test("getSession exige LOGGED_IN y la cookie SAPISID", () => {
  const ytcfg = { LOGGED_IN: true, DATASYNC_ID: "cuenta||" };
  assert.deepStrictEqual(plain(yt.getSession(ytcfg, "SAPISID=abc")), {
    loggedIn: true,
    accountId: "cuenta||",
  });
  assert.strictEqual(
    yt.getSession(ytcfg, "__Secure-3PAPISID=abc").loggedIn,
    true,
  );
  assert.strictEqual(yt.getSession(ytcfg, "otra=1").loggedIn, false);
  assert.strictEqual(
    yt.getSession({ DATASYNC_ID: "x" }, "SAPISID=abc").loggedIn,
    false,
  );
  assert.strictEqual(
    yt.getSession({ LOGGED_IN: true }, "SAPISID=a").accountId,
    null,
  );
  assert.strictEqual(yt.getSession(null, "").loggedIn, false);
});

test("hashAccount da SHA-256 hexadecimal sin el id en claro", async () => {
  const hash = await yt.hashAccount("cuenta-inventada||");
  assert.strictEqual(
    hash,
    crypto.createHash("sha256").update("cuenta-inventada||").digest("hex"),
  );
  assert.ok(!hash.includes("cuenta"));
});

test("buildAuthHeaders calcula SAPISIDHASH y las variantes 1P y 3P", async () => {
  const sha1 = (text) => crypto.createHash("sha1").update(text).digest("hex");
  const origin = "https://www.youtube.com";
  const now = 1_700_000_000_500;
  const cookies = "SAPISID=aaa; __Secure-1PAPISID=bbb; __Secure-3PAPISID=ccc";
  const headers = await yt.buildAuthHeaders(cookies, { now, origin });
  const ts = 1_700_000_000;
  assert.deepStrictEqual(plain(headers), {
    Authorization: [
      `SAPISIDHASH ${ts}_${sha1(`${ts} aaa ${origin}`)}`,
      `SAPISID1PHASH ${ts}_${sha1(`${ts} bbb ${origin}`)}`,
      `SAPISID3PHASH ${ts}_${sha1(`${ts} ccc ${origin}`)}`,
    ].join(" "),
  });

  const only = await yt.buildAuthHeaders("SAPISID=aaa", { now });
  assert.strictEqual(
    only.Authorization,
    `SAPISIDHASH ${ts}_${sha1(`${ts} aaa ${origin}`)}`,
  );
  assert.strictEqual(await yt.buildAuthHeaders("otra=1", { now }), null);
});

test("buildBrowseRequest arma URL, cabeceras planas y cuerpo", () => {
  const ytcfg = plain(yt.readYtcfg(page));
  const auth = { Authorization: "SAPISIDHASH 1_x" };
  const { url, init } = yt.buildBrowseRequest(ytcfg, "TOKEN", auth);
  assert.strictEqual(
    url,
    "https://www.youtube.com/youtubei/v1/browse?prettyPrint=false&key=clave-inventada",
  );
  assert.strictEqual(init.method, "POST");
  assert.strictEqual(init.credentials, "include");
  assert.deepStrictEqual(plain(init.headers), {
    "Content-Type": "application/json",
    "X-Origin": "https://www.youtube.com",
    "X-Goog-AuthUser": "1",
    "X-Youtube-Client-Name": "1",
    "X-Youtube-Client-Version": "2.20990101.00.00",
    "X-Goog-Visitor-Id": "visitante-inventado",
    Authorization: "SAPISIDHASH 1_x",
  });
  const body = JSON.parse(init.body);
  assert.strictEqual(body.continuation, "TOKEN");
  assert.strictEqual(body.context.client.clientName, "WEB");

  const bare = yt.buildBrowseRequest(
    {
      INNERTUBE_CONTEXT: {},
      INNERTUBE_CONTEXT_CLIENT_NAME: 1,
      INNERTUBE_CLIENT_VERSION: "2.0",
      DELEGATED_SESSION_ID: "pagina",
    },
    "T",
    null,
  );
  assert.strictEqual(
    bare.url,
    "https://www.youtube.com/youtubei/v1/browse?prettyPrint=false",
  );
  assert.strictEqual(bare.init.headers["X-Goog-AuthUser"], "0");
  assert.strictEqual(bare.init.headers["X-Goog-PageId"], "pagina");
  assert.ok(!("Authorization" in bare.init.headers));
  assert.strictEqual(yt.buildBrowseRequest({}, "T", null), null);
  // Sin nombre o versión del cliente no se pide: las cabeceras saldrían "undefined"
  assert.strictEqual(
    yt.buildBrowseRequest(
      { INNERTUBE_CONTEXT: {}, INNERTUBE_CLIENT_VERSION: "2.0" },
      "T",
      null,
    ),
    null,
  );
  assert.strictEqual(
    yt.buildBrowseRequest(
      { INNERTUBE_CONTEXT: {}, INNERTUBE_CONTEXT_CLIENT_NAME: 1 },
      "T",
      null,
    ),
    null,
  );
});

const fixture = (name) =>
  fs.readFileSync(path.join(__dirname, "fixtures", "yt-data", name), "utf8");
const { YouTubeGroups: groups, YouTubeGroupsMetadata: metadata } =
  loadModules();
const parseAge = (text) => metadata.parseAge(text);

test("parseChannels lee la página: handle, /channel/UC y nombre de simpleText y de runs", () => {
  const result = plain(yt.parseChannels(yt.readInitialData(page)));
  assert.deepStrictEqual(result.channels, [
    {
      url: "https://www.youtube.com/@canal-uno",
      name: "Canal de Prueba Uno",
      description: "",
      avatar: null,
    },
    {
      url: "https://www.youtube.com/channel/UCinventado0000000000002",
      name: "Canal de Prueba Dos",
      description: "",
      avatar: null,
    },
  ]);
  assert.strictEqual(result.continuation, null);
});

test("parseChannels lee la continuación: avatar, descripción, duplicados y token en commandExecutorCommand", () => {
  const data = JSON.parse(fixture("channels-continuation.json"));
  const result = plain(yt.parseChannels(data));
  assert.deepStrictEqual(result.channels, [
    {
      url: "https://www.youtube.com/@canal-tres",
      name: "Canal de Prueba Tres",
      description: "Descripción de tres",
      avatar: "https://yt3.ggpht.com/avatar-tres=s88-c-k-c0x00ffffff-no-rj",
    },
    {
      url: "https://www.youtube.com/@canal-uno",
      name: "Canal de Prueba Uno",
      description: "",
      avatar: null,
    },
    {
      url: "https://www.youtube.com/channel/UCinventado0000000000004",
      name: "Canal de Prueba Cuatro",
      description: "Sin avatar",
      avatar: null,
    },
  ]);
  assert.strictEqual(result.continuation, "TOKEN-SIGUIENTE");
});

test("parseChannels no repite canales y descarta los sin URL válida", () => {
  const renderer = (title, endpoint) => ({
    channelRenderer: {
      title: { simpleText: title },
      navigationEndpoint: endpoint,
    },
  });
  const data = {
    items: [
      renderer("A", { browseEndpoint: { canonicalBaseUrl: "/@a" } }),
      renderer("A otra vez", { browseEndpoint: { canonicalBaseUrl: "/@A" } }),
      renderer("Sin URL", { browseEndpoint: {} }),
      renderer("Fuera", { browseEndpoint: { canonicalBaseUrl: "/playlist" } }),
      renderer("", { browseEndpoint: { canonicalBaseUrl: "/@vacio" } }),
    ],
  };
  const urls = yt.parseChannels(data).channels.map((c) => c.url);
  assert.deepStrictEqual(plain(urls), ["https://www.youtube.com/@a"]);
});

test("la URL del canal coincide con la clave que lee ui/subscriptions del DOM", () => {
  const [first] = yt.parseChannels(yt.readInitialData(page)).channels;
  const fromDom = groups.normalizeChannelUrl("/@canal-uno");
  assert.strictEqual(
    groups.getChannelKey(first.url),
    groups.getChannelKey(fromDom),
  );
});

test("parseVideos lee videoRenderer, gridVideoRenderer y lockupViewModel con su antigüedad", () => {
  const data = yt.readInitialData(fixture("subscriptions-page.html"));
  const result = plain(yt.parseVideos(data, parseAge));
  assert.deepStrictEqual(result.videos, [
    {
      id: "vidUno0000A",
      channelUrl: "https://www.youtube.com/@canal-uno",
      ageSeconds: 3 * 86400,
    },
    {
      id: "vidDos0000B",
      channelUrl: "https://www.youtube.com/channel/UCinventado0000000000002",
      ageSeconds: 2 * 604800,
    },
    {
      id: "vidTres000C",
      channelUrl: "https://www.youtube.com/channel/UCinventado0000000000003",
      ageSeconds: 5 * 3600,
    },
    {
      id: "vidSinEdad0",
      channelUrl: "https://www.youtube.com/@canal-uno",
      ageSeconds: null,
    },
  ]);
  assert.strictEqual(result.continuation, "TOKEN-FEED-2");
});

test("parseVideos lee la continuación del feed", () => {
  const data = JSON.parse(fixture("subscriptions-continuation.json"));
  const result = plain(yt.parseVideos(data, parseAge));
  assert.deepStrictEqual(result.videos, [
    {
      id: "vidContinuacion1",
      channelUrl: "https://www.youtube.com/@canal-uno",
      ageSeconds: 2592000,
    },
  ]);
  assert.strictEqual(result.continuation, "TOKEN-FEED-3");
});

test("parseVideos ignora directos en curso", () => {
  const data = {
    items: [
      {
        videoRenderer: {
          videoId: "directo",
          ownerText: {
            runs: [
              {
                navigationEndpoint: {
                  browseEndpoint: { canonicalBaseUrl: "/@a" },
                },
              },
            ],
          },
          badges: [
            { metadataBadgeRenderer: { style: "BADGE_STYLE_TYPE_LIVE_NOW" } },
          ],
        },
      },
    ],
  };
  assert.deepStrictEqual(plain(yt.parseVideos(data, parseAge).videos), []);
});

test("una página desconocida da listas vacías y continuation null", () => {
  const data = yt.readInitialData(fixture("unknown-page.html"));
  assert.deepStrictEqual(plain(yt.parseChannels(data)), {
    channels: [],
    continuation: null,
  });
  assert.deepStrictEqual(plain(yt.parseVideos(data, parseAge)), {
    videos: [],
    continuation: null,
  });
  assert.deepStrictEqual(plain(yt.parseChannels(null)), {
    channels: [],
    continuation: null,
  });
});

test("collectAgeSamples ya no existe (6-29)", () => {
  assert.strictEqual(yt.collectAgeSamples, undefined);
});
