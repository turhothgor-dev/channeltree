// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { loadModules, plain } = require("./helpers/load-modules");

const FOO = "https://www.youtube.com/@Foo";
const FOO_KEY = "https://www.youtube.com/@foo";
const BAR = "https://www.youtube.com/@Bar";
const BAR_KEY = "https://www.youtube.com/@bar";

function entry(name, url, firstSeen) {
  return { name, url, firstSeen };
}

test("normalizeSubscriptions descarta las entradas no válidas", () => {
  const { YouTubeGroupsSubscriptions: S } = loadModules();
  const good = entry("Foo", FOO, 10);

  const result = S.normalizeSubscriptions({
    [FOO_KEY]: good,
    [BAR]: entry("Bar", BAR, 10), // clave que no es getChannelKey
    "https://www.youtube.com/@baz": entry(
      "Baz",
      "https://www.youtube.com/watch?v=1",
      10,
    ),
    "https://www.youtube.com/@sin-nombre": entry(
      "  ",
      "https://www.youtube.com/@sin-nombre",
      10,
    ),
    "https://www.youtube.com/@fecha": entry(
      "Fecha",
      "https://www.youtube.com/@fecha",
      "ayer",
    ),
    "https://www.youtube.com/@nulo": null,
  });

  assert.deepStrictEqual(plain(result), { [FOO_KEY]: good });
  assert.deepStrictEqual(plain(S.normalizeSubscriptions(null)), {});
  assert.deepStrictEqual(plain(S.normalizeSubscriptions([])), {});
});

test("mergeSubscriptions añade con firstSeen = now", () => {
  const { YouTubeGroupsSubscriptions: S } = loadModules();

  const { channels, changed } = S.mergeSubscriptions(
    {},
    new Map([[FOO_KEY, { name: "Foo", url: FOO }]]),
    { now: 50 },
  );

  assert.strictEqual(changed, true);
  assert.deepStrictEqual(plain(channels), {
    [FOO_KEY]: entry("Foo", FOO, 50),
  });
});

test("mergeSubscriptions actualiza el nombre sin tocar firstSeen", () => {
  const { YouTubeGroupsSubscriptions: S } = loadModules();

  const { channels, changed } = S.mergeSubscriptions(
    { [FOO_KEY]: entry("Foo", FOO, 10) },
    { [FOO_KEY]: { name: "Foo Nuevo", url: FOO } },
    { now: 99 },
  );

  assert.strictEqual(changed, true);
  assert.deepStrictEqual(plain(channels), {
    [FOO_KEY]: entry("Foo Nuevo", FOO, 10),
  });
});

test("mergeSubscriptions no cambia nada con lo mismo", () => {
  const { YouTubeGroupsSubscriptions: S } = loadModules();

  const { changed } = S.mergeSubscriptions(
    { [FOO_KEY]: entry("Foo", FOO, 10) },
    { [FOO_KEY]: { name: "Foo", url: FOO } },
    { now: 99 },
  );

  assert.strictEqual(changed, false);
});

test("mergeSubscriptions con reconcileKeys borra lo no visto", () => {
  const { YouTubeGroupsSubscriptions: S } = loadModules();
  const stored = {
    [FOO_KEY]: entry("Foo", FOO, 10),
    [BAR_KEY]: entry("Bar", BAR, 20),
  };

  const { channels, changed } = S.mergeSubscriptions(stored, new Map(), {
    now: 99,
    reconcileKeys: new Set([FOO_KEY]),
  });

  assert.strictEqual(changed, true);
  assert.deepStrictEqual(plain(channels), {
    [FOO_KEY]: entry("Foo", FOO, 10),
  });

  const sin = S.mergeSubscriptions(stored, new Map(), { now: 99 });
  assert.strictEqual(sin.changed, false);
});

test("mergeSubscriptions no muta la entrada", () => {
  const { YouTubeGroupsSubscriptions: S } = loadModules();
  const stored = { [FOO_KEY]: entry("Foo", FOO, 10) };
  const observed = { [FOO_KEY]: { name: "Otro", url: FOO } };
  const storedCopy = structuredClone(stored);
  const observedCopy = structuredClone(observed);

  S.mergeSubscriptions(stored, observed, {
    now: 99,
    reconcileKeys: [],
  });

  assert.deepStrictEqual(stored, storedCopy);
  assert.deepStrictEqual(observed, observedCopy);
});

test("getUnclassifiedSubscriptions excluye grupos y subgrupos y ordena", () => {
  const { YouTubeGroupsSubscriptions: S } = loadModules();
  const channels = {
    [FOO_KEY]: entry("Foo", FOO, 10),
    [BAR_KEY]: entry("Bar", BAR, 10),
    "https://www.youtube.com/@zeta": entry(
      "Zeta",
      "https://www.youtube.com/@zeta",
      30,
    ),
    "https://www.youtube.com/@agrupado": entry(
      "Agrupado",
      "https://www.youtube.com/@agrupado",
      40,
    ),
    "https://www.youtube.com/@sub": entry(
      "Sub",
      "https://www.youtube.com/@sub",
      50,
    ),
  };
  const groups = [
    {
      id: "a",
      name: "A",
      channels: [
        { name: "Agrupado", url: "https://www.youtube.com/@AGRUPADO" },
      ],
      subgroups: [
        {
          id: "a1",
          name: "A1",
          channels: [{ name: "Sub", url: "https://www.youtube.com/@sub" }],
          subgroups: [],
        },
      ],
    },
  ];

  const result = S.getUnclassifiedSubscriptions(channels, groups);

  assert.deepStrictEqual(plain(result.map((item) => item.name)), [
    "Zeta",
    "Bar",
    "Foo",
  ]);
  assert.strictEqual(result[0].key, "https://www.youtube.com/@zeta");
});

test("normalizeDescription colapsa espacios y devuelve vacío si no es cadena", () => {
  const { YouTubeGroupsSubscriptions: S } = loadModules();

  assert.strictEqual(
    S.normalizeDescription("  Hola \n\n  mundo\t!  "),
    "Hola mundo !",
  );
  assert.strictEqual(S.normalizeDescription(null), "");
  assert.strictEqual(S.normalizeDescription(42), "");
  assert.strictEqual(S.normalizeDescription("  \n "), "");
});

test("normalizeDescription corta a 500 puntos de código sin partir emojis", () => {
  const { YouTubeGroupsSubscriptions: S } = loadModules();

  assert.strictEqual(S.MAX_DESCRIPTION_LENGTH, 500);
  assert.strictEqual(S.normalizeDescription("a".repeat(500)), "a".repeat(500));
  assert.strictEqual(
    S.normalizeDescription("a".repeat(501)),
    `${"a".repeat(499)}…`,
  );
  const emoji = S.normalizeDescription(`${"a".repeat(498)}😀😀😀`);
  assert.strictEqual(emoji, `${"a".repeat(498)}😀…`);
  assert.strictEqual(Array.from(emoji).length, 500);
});

test("normalizeSubscriptions conserva la descripción válida y no descarta la entrada", () => {
  const { YouTubeGroupsSubscriptions: S } = loadModules();
  const vacio = "https://www.youtube.com/@vacio";
  const viejo = "https://www.youtube.com/@viejo";

  const result = plain(
    S.normalizeSubscriptions({
      [FOO_KEY]: {
        ...entry("Foo", FOO, 10),
        description: " Un  canal \n bueno ",
      },
      [BAR_KEY]: { ...entry("Bar", BAR, 10), description: 5 },
      [vacio]: { ...entry("Vacio", vacio, 10), description: "   " },
      [viejo]: entry("Viejo", viejo, 10),
    }),
  );

  assert.strictEqual(result[FOO_KEY].description, "Un canal bueno");
  assert.deepStrictEqual(result[BAR_KEY], entry("Bar", BAR, 10));
  assert.deepStrictEqual(result[vacio], entry("Vacio", vacio, 10));
  assert.deepStrictEqual(result[viejo], entry("Viejo", viejo, 10));
});

test("mergeSubscriptions guarda la descripción en altas y existentes", () => {
  const { YouTubeGroupsSubscriptions: S } = loadModules();

  const alta = S.mergeSubscriptions(
    {},
    { [FOO_KEY]: { name: "Foo", url: FOO, description: "Desc" } },
    { now: 5 },
  );
  assert.strictEqual(alta.changed, true);
  assert.deepStrictEqual(plain(alta.channels), {
    [FOO_KEY]: { ...entry("Foo", FOO, 5), description: "Desc" },
  });

  const stored = { [FOO_KEY]: entry("Foo", FOO, 10) };
  const existente = S.mergeSubscriptions(
    stored,
    { [FOO_KEY]: { name: "Foo", url: FOO, description: "Nueva" } },
    { now: 99 },
  );
  assert.strictEqual(existente.changed, true);
  assert.strictEqual(existente.channels[FOO_KEY].description, "Nueva");
  assert.strictEqual(existente.channels[FOO_KEY].firstSeen, 10);
});

test("mergeSubscriptions conserva la descripción guardada si no llega otra", () => {
  const { YouTubeGroupsSubscriptions: S } = loadModules();
  const stored = {
    [FOO_KEY]: { ...entry("Foo", FOO, 10), description: "Guardada" },
  };

  const sin = S.mergeSubscriptions(
    stored,
    { [FOO_KEY]: { name: "Foo", url: FOO } },
    { now: 99 },
  );
  assert.strictEqual(sin.changed, false);
  assert.strictEqual(sin.channels[FOO_KEY].description, "Guardada");

  const vacia = S.mergeSubscriptions(
    stored,
    { [FOO_KEY]: { name: "Foo", url: FOO, description: "  " } },
    { now: 99 },
  );
  assert.strictEqual(vacia.changed, false);
  assert.strictEqual(vacia.channels[FOO_KEY].description, "Guardada");

  const misma = S.mergeSubscriptions(
    stored,
    { [FOO_KEY]: { name: "Foo", url: FOO, description: " Guardada " } },
    { now: 99 },
  );
  assert.strictEqual(misma.changed, false);
});

test("formatDescription trunca a 240 puntos de código y deja el texto en title", () => {
  const { YouTubeGroupsSubscriptions: S } = loadModules();

  assert.strictEqual(S.DISPLAY_DESCRIPTION_LENGTH, 240);
  assert.deepStrictEqual(plain(S.formatDescription("a".repeat(240))), {
    text: "a".repeat(240),
    title: "",
  });
  assert.deepStrictEqual(plain(S.formatDescription("a".repeat(241))), {
    text: `${"a".repeat(240)}…`,
    title: "a".repeat(241),
  });
  assert.deepStrictEqual(plain(S.formatDescription("corta")), {
    text: "corta",
    title: "",
  });
});

test("getSubscriptionDescription devuelve la descripción o vacío", () => {
  const { YouTubeGroupsSubscriptions: S } = loadModules();
  const subs = {
    [FOO_KEY]: { ...entry("Foo", FOO, 10), description: " Hola  mundo " },
    [BAR_KEY]: { ...entry("Bar", BAR, 10), description: 7 },
  };

  assert.strictEqual(S.getSubscriptionDescription(subs, FOO_KEY), "Hola mundo");
  assert.strictEqual(S.getSubscriptionDescription(subs, BAR_KEY), "");
  assert.strictEqual(S.getSubscriptionDescription(subs, "otra"), "");
  assert.strictEqual(S.getSubscriptionDescription(null, FOO_KEY), "");
});

test("findSubscriptionSectionIndex encuentra /feed/channels", () => {
  const { YouTubeGroupsSubscriptions: S } = loadModules();

  assert.strictEqual(
    S.findSubscriptionSectionIndex([
      ["/feed/you", "/@propio"],
      ["/@uno", "/feed/channels"],
    ]),
    1,
  );
  assert.strictEqual(
    S.findSubscriptionSectionIndex([["https://www.youtube.com/feed/channels"]]),
    0,
  );
  assert.strictEqual(
    S.findSubscriptionSectionIndex([["/feed/subscriptions"], ["/@uno"]]),
    -1,
  );
  assert.strictEqual(S.findSubscriptionSectionIndex(null), -1);
});

test("isChannelListComplete según los tres datos", () => {
  const { YouTubeGroupsSubscriptions: S } = loadModules();

  assert.strictEqual(
    S.isChannelListComplete({
      channelCount: 2,
      notedCount: 2,
      hasContinuation: false,
    }),
    true,
  );
  assert.strictEqual(
    S.isChannelListComplete({
      channelCount: 0,
      notedCount: 0,
      hasContinuation: false,
    }),
    false,
  );
  assert.strictEqual(
    S.isChannelListComplete({
      channelCount: 2,
      notedCount: 1,
      hasContinuation: false,
    }),
    false,
  );
  assert.strictEqual(
    S.isChannelListComplete({
      channelCount: 2,
      notedCount: 2,
      hasContinuation: true,
    }),
    false,
  );
});

test("saveObservedSubscriptions escribe una vez y no si no cambia", async () => {
  const { YouTubeGroupsSubscriptions: S, store, calls } = loadModules();
  const observed = new Map([[FOO_KEY, { name: "Foo", url: FOO }]]);

  const first = await S.saveObservedSubscriptions(observed);
  assert.strictEqual(first.changed, true);
  assert.strictEqual(calls.set, 1);
  assert.strictEqual(store.youtubeSubscriptions.version, 1);
  assert.deepStrictEqual(Object.keys(store.youtubeSubscriptions.channels), [
    FOO_KEY,
  ]);

  const second = await S.saveObservedSubscriptions(observed);
  assert.strictEqual(second.changed, false);
  assert.strictEqual(calls.set, 1);

  const third = await S.saveObservedSubscriptions(new Map(), {
    reconcileKeys: [],
  });
  assert.strictEqual(third.changed, true);
  assert.strictEqual(calls.set, 2);
});
