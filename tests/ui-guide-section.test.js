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
  GUIDE_HTML,
} = require("./helpers/youtube-fixtures");

const GUIDE = "#youtube-groups-guide";

/**
 * Grupos de prueba: A (con un canal y el subgrupo A1) y B.
 * @returns {Object} Valor para la opción `store` de loadDom.
 */
function guideStore() {
  return groupsStore([
    makeGroup("A", {
      channels: [{ name: "Canal", url: CHANNEL_URL }],
      subgroups: [makeGroup("A1")],
    }),
    makeGroup("B"),
  ]);
}

/**
 * Carga una página con la guía y los grupos de prueba.
 * @param {Object} [options] - Opciones de loadDom (url, store...).
 * @returns {Promise<Object>} El resultado de loadDom, ya estabilizado.
 */
async function loadWithGuide(options = {}) {
  const dom = loadDom({ html: GUIDE_HTML, store: guideStore(), ...options });
  await dom.flush();
  return dom;
}

/**
 * Textos de los botones principales de las filas de la columna visible (la
 * última: durante la animación la saliente sigue en el DOM).
 * @param {Object} dom - Resultado de loadDom.
 * @returns {string[]} Textos de los nombres.
 */
function rowNames(dom) {
  const column = dom.document.querySelector(
    `${GUIDE} .youtube-groups__guide-viewport`,
  ).lastElementChild;
  return Array.from(
    column.querySelectorAll(
      ".youtube-groups__guide-row .youtube-groups__guide-item",
    ),
  ).map(
    (item) => item.querySelector(".youtube-groups__guide-name").textContent,
  );
}

test("hay una única sección justo antes de la sección Más de YouTube", async () => {
  const dom = await loadWithGuide();

  assert.strictEqual(dom.document.querySelectorAll(GUIDE).length, 1);
  const guide = dom.document.querySelector(GUIDE);
  const sections = dom.document.querySelector("#sections");
  assert.strictEqual(guide.parentElement, sections);
  assert.strictEqual(
    guide.nextElementSibling.querySelector("a").getAttribute("href"),
    "https://music.youtube.com/",
  );
  assert.strictEqual(
    guide.previousElementSibling.querySelector("a").getAttribute("href"),
    "/feed/subscriptions",
  );
});

test("añadir un nodo a #sections no duplica ni mueve la sección", async () => {
  const dom = await loadWithGuide();
  const sections = dom.document.querySelector("#sections");
  const before = Array.from(sections.children).indexOf(
    dom.document.querySelector(GUIDE),
  );

  const extra = dom.document.createElement("div");
  sections.append(extra);
  await dom.flush();

  assert.strictEqual(dom.document.querySelectorAll(GUIDE).length, 1);
  assert.strictEqual(
    Array.from(sections.children).indexOf(dom.document.querySelector(GUIDE)),
    before,
  );
});

test('la fila de A muestra "A"; "›" entra en A y "‹" vuelve', async () => {
  const dom = await loadWithGuide();
  assert.deepStrictEqual(rowNames(dom), ["A", "B"]);

  dom.document.querySelector(".youtube-groups__guide-enter").click();
  await dom.flush();
  assert.deepStrictEqual(rowNames(dom), ["A1"]);
  assert.strictEqual(
    dom.document.querySelector(".youtube-groups__guide-back").hidden,
    false,
  );

  dom.document.querySelector(".youtube-groups__guide-back").click();
  await dom.flush();
  assert.deepStrictEqual(rowNames(dom), ["A", "B"]);
});

test("las filas de grupo no tienen botón Reproducir", async () => {
  const dom = await loadWithGuide();

  const row = dom.document.querySelector(".youtube-groups__guide-row");
  const children = Array.from(row.children);
  assert.strictEqual(children.length, 3);
  assert.ok(children[0].hasAttribute("data-group-id"), "botón del grupo");
  assert.ok(
    children[1].classList.contains("youtube-groups__guide-bullet"),
    "bullet",
  );
  assert.ok(children[2].classList.contains("youtube-groups__guide-enter"), "›");
  assert.strictEqual(
    dom.document.querySelector(".youtube-groups__guide-toggle"),
    null,
  );
  assert.strictEqual(
    dom.document.querySelector(".youtube-groups__guide-play"),
    null,
  );
});

const UNGROUPED = `${GUIDE} .youtube-groups__guide-item--ungrouped`;

/**
 * Suscripciones conocidas de prueba: dos sin grupo y una (CHANNEL_URL) en A.
 * @returns {Object} Contenido de `youtubeSubscriptions`.
 */
function subscriptionsStore() {
  const entry = (name, url) => ({ name, url, firstSeen: 1 });
  return {
    version: 1,
    channels: {
      [CHANNEL_URL]: entry("Canal", CHANNEL_URL),
      "https://www.youtube.com/@uno": entry(
        "Uno",
        "https://www.youtube.com/@uno",
      ),
      "https://www.youtube.com/@dos": entry(
        "Dos",
        "https://www.youtube.com/@dos",
      ),
    },
  };
}

test('la entrada "Sin grupo" va al final de la raíz, con icono y sin bullet ni desplegables', async () => {
  const dom = await loadWithGuide();
  const button = dom.document.querySelector(UNGROUPED);
  assert.ok(button);
  assert.strictEqual(button.getAttribute("aria-pressed"), "false");
  assert.strictEqual(button.hasAttribute("data-group-id"), false);
  const svg = button.querySelector("svg");
  assert.ok(svg);
  assert.strictEqual(svg.getAttribute("aria-hidden"), "true");

  const wrapper = button.parentElement;
  assert.strictEqual(wrapper.querySelector("button + button"), null);
  assert.strictEqual(
    wrapper.querySelector(
      ".youtube-groups__guide-bullet, .youtube-groups__guide-enter",
    ),
    null,
  );
  assert.strictEqual(wrapper.parentElement.lastElementChild, wrapper);
  assert.strictEqual(
    wrapper.previousElementSibling.classList.contains(
      "youtube-groups__guide-group",
    ),
    true,
  );
  assert.strictEqual(button.textContent, "Sin grupo");
});

test('"Sin grupo (N)" cuenta las suscripciones conocidas sin grupo y se actualiza', async () => {
  const store = guideStore();
  store.youtubeSubscriptions = subscriptionsStore();
  const dom = await loadWithGuide({ store });
  const button = () => dom.document.querySelector(UNGROUPED);
  assert.strictEqual(button().textContent, "Sin grupo (2)");
  assert.ok(button().title.includes("2 suscripciones conocidas sin grupo"));

  const channels = subscriptionsStore().channels;
  channels["https://www.youtube.com/@tres"] = {
    name: "Tres",
    url: "https://www.youtube.com/@tres",
    firstSeen: 1,
  };
  await dom.browser.storage.local.set({
    youtubeSubscriptions: { version: 1, channels },
  });
  await dom.flush();
  assert.strictEqual(button().textContent, "Sin grupo (3)");
});

test('"Sin grupo" no aparece en una subcolumna y vuelve al regresar', async () => {
  const dom = await loadWithGuide();
  dom.document.querySelector(".youtube-groups__guide-enter").click();
  await dom.flush();
  const column = dom.document.querySelector(
    `${GUIDE} .youtube-groups__guide-viewport`,
  ).lastElementChild;
  assert.strictEqual(
    column.querySelector(".youtube-groups__guide-item--ungrouped"),
    null,
  );

  dom.document.querySelector(".youtube-groups__guide-back").click();
  await dom.flush();
  assert.ok(dom.document.querySelector(UNGROUPED));
});

test('sin grupos, "Sin grupo" aparece tras "Aún no hay grupos"', async () => {
  const dom = await loadWithGuide({ store: groupsStore([]) });
  const column = dom.document.querySelector(
    `${GUIDE} .youtube-groups__guide-column`,
  );
  assert.strictEqual(
    column.firstElementChild.className,
    "youtube-groups__guide-empty",
  );
  assert.strictEqual(
    column.lastElementChild,
    dom.document.querySelector(UNGROUPED).parentElement,
  );
});

test('pulsar "Sin grupo" es excluyente con los grupos y al repetir se desmarca', async () => {
  const dom = await loadWithGuide({
    url: "https://www.youtube.com/feed/subscriptions",
  });
  const pressed = (selector) =>
    dom.document.querySelector(selector).getAttribute("aria-pressed");
  const clear = dom.document.querySelector(".youtube-groups__guide-clear");

  dom.document.querySelector(UNGROUPED).click();
  await dom.flush();
  assert.strictEqual(pressed(UNGROUPED), "true");
  assert.strictEqual(clear.getAttribute("aria-label"), "Limpiar selección");
  assert.strictEqual(clear.disabled, false);

  dom.document.querySelector('[data-group-id="A"]').click();
  await dom.flush();
  assert.strictEqual(pressed(UNGROUPED), "false");
  assert.strictEqual(pressed('[data-group-id="A"]'), "true");

  dom.document.querySelector(UNGROUPED).click();
  await dom.flush();
  assert.strictEqual(pressed(UNGROUPED), "true");
  assert.strictEqual(pressed('[data-group-id="A"]'), "false");

  dom.document.querySelector(UNGROUPED).click();
  await dom.flush();
  assert.strictEqual(pressed(UNGROUPED), "false");
  assert.strictEqual(clear.getAttribute("aria-label"), "Limpiar selección");
});

test('pulsar "Sin grupo" en inicio guarda el filtro pendiente para ir a suscripciones', async () => {
  const dom = await loadWithGuide({ url: "https://www.youtube.com/" });
  dom.document.querySelector(UNGROUPED).click();
  await dom.flush();

  const pending = JSON.parse(
    dom.window.sessionStorage.getItem("youtubeGroupsPendingFilter"),
  );
  assert.deepStrictEqual(pending.selection, ["ungrouped"]);
});

test("el color del grupo es un bullet en su botón principal, sin banda", async () => {
  const groups = [
    makeGroup("A", { subgroups: [makeGroup("A1")] }),
    makeGroup("B"),
  ];
  groups[0].color = "#2196F3";
  const dom = await loadWithGuide({ store: groupsStore(groups) });
  const band = "youtube-groups__group-band";
  const bulletSel = ".youtube-groups__group-bullet";

  const rows = dom.document.querySelectorAll(
    `${GUIDE} .youtube-groups__guide-row`,
  );
  assert.strictEqual(rows.length, 2);
  const [rowA, rowB] = rows;
  const buttonA = rowA.querySelector(".youtube-groups__guide-item");
  const bulletA = rowA.querySelector(
    `.youtube-groups__guide-bullet ${bulletSel}`,
  );
  assert.ok(bulletA);
  assert.strictEqual(buttonA.querySelector(bulletSel), null);
  assert.strictEqual(
    bulletA.style.getPropertyValue("--yg-group-color"),
    "#2196F3",
  );
  assert.strictEqual(buttonA.getAttribute("data-group-id"), groups[0].id);
  assert.strictEqual(buttonA.classList.contains(band), false);
  assert.strictEqual(rowA.classList.contains(band), false);
  // Sin color, bullet gris por defecto: sin variable propia
  const bulletB = rowB.querySelector(bulletSel);
  assert.ok(bulletB);
  assert.strictEqual(bulletB.style.getPropertyValue("--yg-group-color"), "");
  assert.deepStrictEqual(rowNames(dom), ["A", "B"]);

  dom.document.querySelector(".youtube-groups__guide-enter").click();
  await dom.flush();
  const inner = dom.document
    .querySelector(`${GUIDE} .youtube-groups__guide-viewport`)
    .lastElementChild.querySelector(".youtube-groups__guide-row");
  const innerBullet = inner.querySelector(bulletSel);
  assert.ok(innerBullet);
  assert.strictEqual(
    innerBullet.style.getPropertyValue("--yg-group-color"),
    "#2196F3",
  );
});

test("el bullet muestra los vídeos nuevos, baja sin rehacer la fila y se vacía al quitar la selección", async () => {
  const OTHER_URL = "https://www.youtube.com/@otro";
  const ids = ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"];
  const groups = [
    makeGroup("A", {
      channels: [{ name: "Canal", url: CHANNEL_URL }],
      subgroups: [
        makeGroup("A1", { channels: [{ name: "Canal", url: CHANNEL_URL }] }),
      ],
    }),
    makeGroup("B", { channels: [{ name: "Otro", url: OTHER_URL }] }),
  ];
  groups[0].color = "#2196F3";
  const now = Date.now();
  const store = groupsStore(groups);
  store.youtubeNewVideos = {
    version: 1,
    since: now - 1000,
    videos: {
      [ids[0]]: { channel: CHANNEL_URL, seenAt: now, publishedBefore: now },
      [ids[1]]: { channel: CHANNEL_URL, seenAt: now, publishedBefore: now },
      [ids[2]]: { channel: OTHER_URL, seenAt: now, publishedBefore: now },
    },
    visits: {},
  };
  const dom = await loadWithGuide({ store });
  const bulletOf = (groupId) =>
    dom.document.querySelector(
      `${GUIDE} [data-bullet-for="${groupId}"] .youtube-groups__group-bullet`,
    );

  assert.strictEqual(bulletOf("A").textContent, "2");
  assert.strictEqual(bulletOf("B").textContent, "1");
  assert.strictEqual(
    bulletOf("B").style.getPropertyValue("--yg-group-color"),
    "",
  );

  const row = dom.document.querySelector(".youtube-groups__guide-row");
  await dom.browser.storage.local.set({
    youtubeWatched: { version: 1, videos: { [ids[0]]: 1 } },
  });
  await dom.flush();
  assert.strictEqual(bulletOf("A").textContent, "1");
  assert.ok(row.isConnected);
  assert.strictEqual(
    dom.document.querySelector(".youtube-groups__guide-row"),
    row,
  );

  dom.document.querySelector(".youtube-groups__guide-enter").click();
  await dom.flush();
  assert.strictEqual(bulletOf("A1").textContent, "1");

  dom.document.querySelector(".youtube-groups__guide-back").click();
  await dom.flush();
  dom.document.querySelector('[data-group-id="A"]').click();
  await dom.flush();
  // Aplicar el filtro no reconoce (ADR 0043)
  assert.strictEqual(bulletOf("A").textContent, "1");

  dom.document.querySelector('[data-group-id="A"]').click();
  await dom.flush();
  assert.strictEqual(bulletOf("A").textContent, "");
  assert.strictEqual(
    bulletOf("A").classList.contains("youtube-groups__group-bullet--count"),
    false,
  );
});

test("el bullet de un grupo con canales despliega y pliega su lista, y conserva el estado", async () => {
  const dom = await loadWithGuide();
  const bullet = () =>
    dom.document.querySelector(
      `${GUIDE} button.youtube-groups__guide-bullet[data-bullet-for]`,
    );
  const list = () =>
    dom.document.querySelector(
      `${GUIDE} [id^="youtube-groups-guide-channels-"]`,
    );

  assert.strictEqual(bullet().getAttribute("aria-expanded"), "false");
  assert.strictEqual(bullet().getAttribute("aria-controls"), list().id);
  assert.strictEqual(
    bullet().getAttribute("aria-label"),
    "Mostrar canales de A",
  );
  assert.strictEqual(list().hidden, true);

  bullet().click();
  assert.strictEqual(list().hidden, false);
  assert.strictEqual(bullet().getAttribute("aria-expanded"), "true");
  assert.strictEqual(
    bullet().getAttribute("aria-label"),
    "Ocultar canales de A",
  );

  // Repintar la columna conserva el estado
  dom.document.querySelector(".youtube-groups__guide-enter").click();
  await dom.flush();
  dom.document.querySelector(".youtube-groups__guide-back").click();
  await dom.flush();
  assert.strictEqual(list().hidden, false);
  assert.strictEqual(bullet().getAttribute("aria-expanded"), "true");

  bullet().click();
  assert.strictEqual(list().hidden, true);
  assert.strictEqual(bullet().getAttribute("aria-expanded"), "false");
});

/**
 * Almacén con A (2 vídeos nuevos, canales) y B (1 vídeo nuevo, canales), sin visitas.
 * @returns {Object} Valor para la opción `store` de loadDom.
 */
function newVideosStore() {
  const OTHER_URL = "https://www.youtube.com/@otro";
  const groups = [
    makeGroup("A", { channels: [{ name: "Canal", url: CHANNEL_URL }] }),
    makeGroup("B", { channels: [{ name: "Otro", url: OTHER_URL }] }),
  ];
  const now = Date.now();
  const store = groupsStore(groups);
  store.youtubeNewVideos = {
    version: 1,
    since: now - 1000,
    videos: {
      aaaaaaaaaaa: { channel: CHANNEL_URL, seenAt: now, publishedBefore: now },
      bbbbbbbbbbb: { channel: CHANNEL_URL, seenAt: now, publishedBefore: now },
      ccccccccccc: { channel: OTHER_URL, seenAt: now, publishedBefore: now },
    },
    visits: {},
  };
  return store;
}

const waitForNewVideosFlush = () =>
  new Promise((resolve) => setTimeout(resolve, 2300));

test("desplegar y plegar con el bullet no selecciona, no filtra ni reconoce vídeos nuevos", async () => {
  const dom = await loadWithGuide({
    url: "https://www.youtube.com/feed/subscriptions",
    store: newVideosStore(),
  });
  const bulletButton = (id) =>
    dom.document.querySelector(
      `${GUIDE} button.youtube-groups__guide-bullet[data-bullet-for="${id}"]`,
    );
  const circle = (id) =>
    bulletButton(id).querySelector(".youtube-groups__group-bullet");
  const clear = dom.document.querySelector(".youtube-groups__guide-clear");

  bulletButton("A").click();
  await dom.flush();
  bulletButton("A").click();
  await dom.flush();

  assert.strictEqual(
    dom.document.querySelectorAll(`${GUIDE} [aria-pressed="true"]`).length,
    0,
  );
  assert.strictEqual(clear.disabled, true);
  assert.strictEqual(bulletButton("A").getAttribute("aria-expanded"), "false");
  assert.strictEqual(circle("A").textContent, "2");
  assert.ok(
    circle("A").classList.contains("youtube-groups__group-bullet--count"),
  );
  assert.strictEqual(
    dom.document
      .querySelector('[data-group-id="A"]')
      .getAttribute("aria-description"),
    "2 vídeos nuevos",
  );
  await waitForNewVideosFlush();
  await dom.flush();
  assert.deepStrictEqual(dom.store.youtubeNewVideos.visits, {});
});

test("el bullet no cambia la selección existente ni reconoce el grupo del bullet", async () => {
  const dom = await loadWithGuide({
    url: "https://www.youtube.com/feed/subscriptions",
    store: newVideosStore(),
  });
  const pressed = (id) =>
    dom.document
      .querySelector(`[data-group-id="${id}"]`)
      .getAttribute("aria-pressed");
  const bullet = (id) =>
    dom.document.querySelector(
      `${GUIDE} button.youtube-groups__guide-bullet[data-bullet-for="${id}"]`,
    );

  dom.document.querySelector('[data-group-id="B"]').click();
  await dom.flush();
  assert.strictEqual(pressed("B"), "true");

  bullet("A").click();
  await dom.flush();
  assert.strictEqual(pressed("B"), "true");
  assert.strictEqual(pressed("A"), "false");

  // El bullet del grupo seleccionado no lo deselecciona
  bullet("B").click();
  await dom.flush();
  bullet("B").click();
  await dom.flush();
  assert.strictEqual(pressed("B"), "true");

  await waitForNewVideosFlush();
  await dom.flush();
  assert.strictEqual("A" in dom.store.youtubeNewVideos.visits, false);
});

test("el bullet en inicio no navega ni deja filtro pendiente", async () => {
  const dom = await loadWithGuide({
    url: "https://www.youtube.com/",
    store: newVideosStore(),
  });
  const bullet = dom.document.querySelector(
    `${GUIDE} button.youtube-groups__guide-bullet[data-bullet-for="A"]`,
  );
  bullet.click();
  await dom.flush();
  bullet.click();
  await dom.flush();

  assert.strictEqual(dom.navigations.count, 0);
  assert.strictEqual(
    dom.window.sessionStorage.getItem("youtubeGroupsPendingFilter"),
    null,
  );
});

test("un grupo sin canales tiene bullet decorativo (span) y sin color sigue teniéndolo", async () => {
  const dom = await loadWithGuide();
  const rowB = dom.document.querySelectorAll(
    `${GUIDE} .youtube-groups__guide-row`,
  )[1];
  const host = rowB.querySelector(".youtube-groups__guide-bullet");
  assert.strictEqual(host.tagName, "SPAN");
  assert.strictEqual(host.getAttribute("aria-hidden"), "true");
  assert.strictEqual(host.hasAttribute("aria-expanded"), false);
  assert.ok(host.querySelector(".youtube-groups__group-bullet"));
  assert.strictEqual(
    rowB.querySelector("button.youtube-groups__guide-bullet"),
    null,
  );
});

test("los vídeos nuevos van en el bullet y en el aria-description de bullet y botón", async () => {
  const groups = [
    makeGroup("A", { channels: [{ name: "Canal", url: CHANNEL_URL }] }),
  ];
  const now = Date.now();
  const store = groupsStore(groups);
  store.youtubeNewVideos = {
    version: 1,
    since: now - 1000,
    videos: {
      aaaaaaaaaaa: { channel: CHANNEL_URL, seenAt: now, publishedBefore: now },
      bbbbbbbbbbb: { channel: CHANNEL_URL, seenAt: now, publishedBefore: now },
      ccccccccccc: { channel: CHANNEL_URL, seenAt: now, publishedBefore: now },
    },
    visits: {},
  };
  const dom = await loadWithGuide({ store });
  const host = dom.document.querySelector(`${GUIDE} [data-bullet-for]`);
  const main = dom.document.querySelector(`${GUIDE} [data-group-id]`);
  assert.strictEqual(host.textContent, "3");
  assert.strictEqual(host.getAttribute("aria-description"), "3 vídeos nuevos");
  assert.strictEqual(main.getAttribute("aria-description"), "3 vídeos nuevos");
});

test("de punta a punta: una tarjeta nueva pinta el número en padre y subgrupo, seleccionar el padre los conserva y quitarlo vacía padre y subgrupo", async () => {
  const store = groupsStore([
    makeGroup("A", {
      subgroups: [
        makeGroup("A1", { channels: [{ name: "Canal", url: CHANNEL_URL }] }),
      ],
    }),
  ]);
  store.youtubeNewVideos = {
    version: 1,
    since: Date.now() - 24 * 60 * 60 * 1000,
    videos: {},
    visits: {},
  };
  const card = `
    <ytd-rich-item-renderer>
      <a id="thumbnail" href="/watch?v=aaaaaaaaaaa"><img src="x.jpg"></a>
      <a id="video-title" href="/watch?v=aaaaaaaaaaa">Vídeo</a>
      <ytd-channel-name><a href="/@canal">Canal</a></ytd-channel-name>
      <div id="metadata"><span>hace 2 horas</span></div>
    </ytd-rich-item-renderer>`;
  const dom = await loadWithGuide({
    html: GUIDE_HTML + card,
    store,
    url: "https://www.youtube.com/",
  });
  // Espera real al volcado diferido (2 s) del recolector.
  await new Promise((resolve) => setTimeout(resolve, 2300));
  await dom.flush();

  const bulletOf = (groupId) =>
    dom.document.querySelector(
      `${GUIDE} [data-bullet-for="${groupId}"] .youtube-groups__group-bullet`,
    );
  const bulletA = bulletOf("A");
  assert.strictEqual(bulletA.textContent, "1");
  assert.ok(bulletA.classList.contains("youtube-groups__group-bullet--count"));
  assert.strictEqual(
    dom.document
      .querySelector(`${GUIDE} [data-group-id="A"]`)
      .getAttribute("aria-description"),
    "1 vídeo nuevo",
  );

  dom.document.querySelector(".youtube-groups__guide-enter").click();
  await dom.flush();
  assert.strictEqual(bulletOf("A1").textContent, "1");
  assert.ok(
    bulletOf("A1").classList.contains("youtube-groups__group-bullet--count"),
  );
  assert.strictEqual(
    dom.document
      .querySelector(`${GUIDE} [data-group-id="A1"]`)
      .getAttribute("aria-description"),
    "1 vídeo nuevo",
  );

  dom.document.querySelector(".youtube-groups__guide-back").click();
  await dom.flush();
  dom.document.querySelector(`${GUIDE} [data-group-id="A"]`).click();
  await dom.flush();
  assert.strictEqual(bulletOf("A").textContent, "1");

  dom.document.querySelector(".youtube-groups__guide-enter").click();
  await dom.flush();
  assert.strictEqual(bulletOf("A1").textContent, "1");

  dom.document.querySelector(".youtube-groups__guide-back").click();
  await dom.flush();
  dom.document.querySelector(`${GUIDE} [data-group-id="A"]`).click();
  await dom.flush();
  assert.strictEqual(bulletOf("A").textContent, "");

  dom.document.querySelector(".youtube-groups__guide-enter").click();
  await dom.flush();
  assert.strictEqual(bulletOf("A1").textContent, "");
});

test("de punta a punta: pasar del padre a su subgrupo conserva el número del subgrupo hasta salir de él", async () => {
  const store = groupsStore([
    makeGroup("A", {
      subgroups: [
        makeGroup("A1", { channels: [{ name: "Canal", url: CHANNEL_URL }] }),
      ],
    }),
  ]);
  store.youtubeNewVideos = {
    version: 1,
    since: Date.now() - 24 * 60 * 60 * 1000,
    videos: {},
    visits: {},
  };
  const card = `
    <ytd-rich-item-renderer>
      <a id="thumbnail" href="/watch?v=aaaaaaaaaaa"><img src="x.jpg"></a>
      <a id="video-title" href="/watch?v=aaaaaaaaaaa">Vídeo</a>
      <ytd-channel-name><a href="/@canal">Canal</a></ytd-channel-name>
      <div id="metadata"><span>hace 2 horas</span></div>
    </ytd-rich-item-renderer>`;
  const dom = await loadWithGuide({
    html: GUIDE_HTML + card,
    store,
    url: "https://www.youtube.com/",
  });
  await new Promise((resolve) => setTimeout(resolve, 2300));
  await dom.flush();

  const bulletOf = (groupId) =>
    dom.document.querySelector(
      `${GUIDE} [data-bullet-for="${groupId}"] .youtube-groups__group-bullet`,
    );

  dom.document.querySelector(`${GUIDE} [data-group-id="A"]`).click();
  await dom.flush();
  dom.document.querySelector(".youtube-groups__guide-enter").click();
  await dom.flush();
  // Pasa de A a su subgrupo A1: A se reconoce, A1 sigue con su número
  dom.document.querySelector(`${GUIDE} [data-group-id="A1"]`).click();
  await dom.flush();
  assert.strictEqual(bulletOf("A1").textContent, "1");
  await new Promise((resolve) => setTimeout(resolve, 2300));
  await dom.flush();
  const { visits } = dom.store.youtubeNewVideos;
  assert.ok(Object.hasOwn(visits, "A"));
  assert.ok(!Object.hasOwn(visits, "A1"));

  // Al quitar el filtro de A1, baja
  dom.document.querySelector(`${GUIDE} [data-group-id="A1"]`).click();
  await dom.flush();
  assert.strictEqual(bulletOf("A1").textContent, "");
});

test("las filas de grupo no muestran el recuento de canales", async () => {
  const dom = await loadWithGuide();
  const main = dom.document.querySelector(`${GUIDE} [data-group-id]`);
  assert.strictEqual(
    main.querySelector(".youtube-groups__guide-name").textContent,
    "A",
  );
  assert.strictEqual(main.querySelector(".youtube-groups__guide-count"), null);
});

test("la guía tiene encabezado, barra de botones, formulario, navegación y columna, en ese orden", async () => {
  const dom = await loadWithGuide();
  const guide = dom.document.querySelector(GUIDE);
  assert.deepStrictEqual(
    Array.from(guide.children).map((child) => child.classList[0]),
    [
      "youtube-groups__guide-heading",
      "youtube-groups__guide-toolbar",
      "youtube-groups__guide-form",
      "youtube-groups__guide-nav",
      "youtube-groups__guide-viewport",
    ],
  );
  assert.strictEqual(guide.children[0].tagName.toLowerCase(), "h3");
  const toolbar = guide.querySelector(".youtube-groups__guide-toolbar");
  assert.strictEqual(toolbar.getAttribute("role"), "group");
  assert.strictEqual(
    toolbar.getAttribute("aria-label"),
    "Acciones de ChannelTree",
  );
  assert.deepStrictEqual(
    Array.from(toolbar.children).map((child) => child.classList[0]),
    [
      "youtube-groups__guide-create",
      "youtube-groups__guide-clear",
      "youtube-groups__guide-edit",
      "youtube-groups__guide-menu-button",
    ],
  );
  for (const button of toolbar.children) {
    assert.strictEqual(button.textContent, "");
    assert.strictEqual(button.children.length, 1);
    assert.strictEqual(button.firstElementChild.tagName.toLowerCase(), "svg");
  }
  const create = toolbar.querySelector(".youtube-groups__guide-create");
  assert.strictEqual(create.getAttribute("aria-label"), "Crear grupo");
  assert.strictEqual(create.title, "Crear grupo");

  dom.document.querySelector(".youtube-groups__guide-item").click();
  await dom.flush();
  const after = dom.document.querySelector(".youtube-groups__guide-create");
  assert.strictEqual(after.getAttribute("aria-label"), "Crear subgrupo en «A»");
  assert.strictEqual(after.title, "Crear subgrupo en «A»");
});

test("el encabezado no tiene acción y no cambia la columna ni la selección", async () => {
  const dom = await loadWithGuide();
  const heading = () =>
    dom.document.querySelector(`${GUIDE} .youtube-groups__guide-heading`);
  assert.strictEqual(heading().textContent, "ChannelTree");
  assert.strictEqual(heading().querySelector("button, a"), null);
  assert.strictEqual(heading().hasAttribute("tabindex"), false);

  dom.document.querySelector(".youtube-groups__guide-enter").click();
  await dom.flush();
  assert.strictEqual(heading().textContent, "ChannelTree");
  heading().click();
  await dom.flush();
  assert.strictEqual(
    dom.document.querySelector(".youtube-groups__guide-nav-title").textContent,
    "A",
  );
  assert.deepStrictEqual(dom.store.youtubeGroups.activeSelection ?? [], []);
});

test("la fila de navegación dice Suscripciones, el grupo abierto y vuelve", async () => {
  const dom = await loadWithGuide();
  const back = dom.document.querySelector(".youtube-groups__guide-back");
  const title = () =>
    dom.document.querySelector(".youtube-groups__guide-nav-title");
  assert.strictEqual(title().textContent, "Suscripciones");
  assert.strictEqual(back.hidden, true);

  dom.document.querySelector(".youtube-groups__guide-enter").click();
  await dom.flush();
  assert.strictEqual(title().textContent, "A");
  assert.strictEqual(back.hidden, false);

  back.click();
  await dom.flush();
  assert.strictEqual(title().textContent, "Suscripciones");
  assert.strictEqual(back.hidden, true);
});

test("Limpiar selección está en la barra, deshabilitado sin selección", async () => {
  const dom = await loadWithGuide();
  const guide = dom.document.querySelector(GUIDE);
  assert.strictEqual(
    guide.querySelector(".youtube-groups__guide-footer"),
    null,
  );
  assert.strictEqual(
    guide.lastElementChild.className,
    "youtube-groups__guide-viewport",
  );
  const clear = guide.querySelector(
    ".youtube-groups__guide-toolbar .youtube-groups__guide-clear",
  );
  assert.strictEqual(clear.hidden, false);
  assert.strictEqual(clear.disabled, true);
  assert.strictEqual(clear.getAttribute("aria-label"), "Limpiar selección");
  assert.strictEqual(clear.title, "Limpiar selección");
  assert.strictEqual(clear.querySelector(".youtube-groups__guide-badge"), null);

  dom.document.querySelector(".youtube-groups__guide-item").click();
  await dom.flush();
  assert.strictEqual(clear.disabled, false);
  assert.strictEqual(clear.getAttribute("aria-label"), "Limpiar selección");
  assert.strictEqual(clear.textContent, "");

  clear.click();
  await dom.flush();
  assert.strictEqual(clear.disabled, true);
  assert.strictEqual(clear.getAttribute("aria-label"), "Limpiar selección");
});

test('"+ Grupo" con un nombre crea el grupo en el almacenamiento y aparece la fila', async () => {
  const dom = await loadWithGuide();
  dom.document.querySelector(".youtube-groups__guide-create").click();
  const form = dom.document.querySelector(".youtube-groups__guide-form");
  assert.strictEqual(form.hidden, false);

  form.querySelector("input").value = "Nuevo";
  form.querySelector("button[type='submit']").click();
  await dom.flush();

  assert.deepStrictEqual(
    dom.store.youtubeGroups.groups.map((group) => group.name),
    ["A", "B", "Nuevo"],
  );
  assert.deepStrictEqual(rowNames(dom), ["A", "B", "Nuevo"]);
});

test("un nombre de un carácter muestra el error y no escribe", async () => {
  const dom = await loadWithGuide();
  dom.document.querySelector(".youtube-groups__guide-create").click();
  const form = dom.document.querySelector(".youtube-groups__guide-form");

  form.querySelector("input").value = "X";
  form.querySelector("button[type='submit']").click();
  await dom.flush();

  assert.strictEqual(
    form.querySelector(".youtube-groups__guide-form-error").textContent,
    "El nombre del grupo debe tener al menos 2 caracteres",
  );
  assert.strictEqual(dom.store.youtubeGroups.groups.length, 2);
});

/**
 * Carga una página con la guía y simula que no hay pantalla completa (jsdom
 * no tiene `document.fullscreenElement`: `undefined` cuenta como pantalla
 * completa); `fullscreenchange` recalcula la guía fija.
 * @param {string} url - URL de la página.
 * @returns {Promise<Object>} El resultado de loadDom, ya estabilizado.
 */
async function loadPinned(url) {
  const dom = loadDom({ url, html: GUIDE_HTML, store: guideStore() });
  Object.defineProperty(dom.document, "fullscreenElement", { value: null });
  dom.document.dispatchEvent(new dom.window.Event("fullscreenchange"));
  await dom.flush();
  return dom;
}

test("YouTubeGroupsGuideSection.create no toca el DOM ni fija la guía hasta start()", () => {
  const scripts = manifestScripts().filter((file) => file !== "content.js");
  const dom = loadDom({
    url: "https://www.youtube.com/feed/subscriptions",
    html: GUIDE_HTML,
    scripts,
  });
  const before = dom.document.body.innerHTML;
  const pinnedClass = "youtube-groups--guide-pinned";

  const Guide = dom.global("YouTubeGroupsGuideSection");
  assert.strictEqual(typeof Guide.create, "function");
  const guide = Guide.create({
    state: { activeSelection: [] },
    setActiveSelection() {},
    navigateToSubscriptions() {},
    renderGroupsPanel: async () => {},
  });

  assert.strictEqual(dom.document.body.innerHTML, before);
  assert.strictEqual(
    dom.document.documentElement.classList.contains(pinnedClass),
    false,
  );
  assert.strictEqual(typeof guide.renderGuideSection, "function");
  assert.strictEqual(typeof guide.noteMutations, "function");
  assert.strictEqual(typeof guide.checkPlacement, "function");

  Object.defineProperty(dom.document, "fullscreenElement", { value: null });
  guide.start();
  assert.strictEqual(
    dom.document.documentElement.classList.contains(pinnedClass),
    true,
  );
});

test("la guía muestra el avatar guardado de un canal y repinta al cambiar youtubeAvatars", async () => {
  const otherUrl = "https://www.youtube.com/@otro";
  const avatarUrl = "https://yt3.ggpht.com/abc=s88-c-k-c0x00ffffff-no-rj";
  const otherAvatarUrl = "https://yt3.ggpht.com/def=s88-c-k-c0x00ffffff-no-rj";
  const store = groupsStore([
    makeGroup("A", {
      channels: [
        { name: "Canal", url: CHANNEL_URL },
        { name: "Otro", url: otherUrl },
      ],
    }),
  ]);
  store.youtubeAvatars = {
    version: 1,
    avatars: { [CHANNEL_URL]: avatarUrl },
  };
  const dom = await loadWithGuide({ store });

  const rows = () =>
    Array.from(
      dom.document.querySelectorAll(`${GUIDE} .youtube-groups__guide-channel`),
    );
  assert.strictEqual(rows().length, 2);
  const [first, second] = rows();
  assert.strictEqual(
    first.querySelector("img.youtube-groups__avatar-img").getAttribute("src"),
    avatarUrl,
  );
  assert.strictEqual(second.querySelector("img"), null);
  assert.ok(second.querySelector(".youtube-groups__avatar-initial"));
  assert.strictEqual(
    first.querySelector(".youtube-groups__guide-name").textContent,
    "Canal",
  );
  assert.strictEqual(first.title, CHANNEL_URL);

  await dom.browser.storage.local.set({
    youtubeAvatars: {
      version: 1,
      avatars: { [CHANNEL_URL]: avatarUrl, [otherUrl]: otherAvatarUrl },
    },
  });
  await dom.flush();

  assert.strictEqual(
    rows()[1]
      .querySelector("img.youtube-groups__avatar-img")
      .getAttribute("src"),
    otherAvatarUrl,
  );
});

test("el engranaje de la barra abre y cierra el menú y refleja aria-expanded", async () => {
  const dom = await loadWithGuide();
  const gear = dom.document.querySelector(
    `${GUIDE} .youtube-groups__guide-toolbar .youtube-groups__guide-menu-button`,
  );
  assert.strictEqual(gear.getAttribute("aria-label"), "Opciones");
  assert.strictEqual(gear.getAttribute("aria-haspopup"), "dialog");
  assert.strictEqual(gear.getAttribute("aria-controls"), "youtube-groups-menu");
  assert.strictEqual(gear.getAttribute("aria-expanded"), "false");
  assert.strictEqual(gear.textContent, "");

  gear.click();
  assert.strictEqual(gear.getAttribute("aria-expanded"), "true");
  gear.click();
  assert.strictEqual(gear.getAttribute("aria-expanded"), "false");
});

test("en suscripciones la guía está fija en <html> y en inicio no", async () => {
  const pinned = await loadPinned("https://www.youtube.com/feed/subscriptions");
  assert.strictEqual(
    pinned.document.documentElement.classList.contains(
      "youtube-groups--guide-pinned",
    ),
    true,
  );

  const home = await loadPinned("https://www.youtube.com/");
  assert.strictEqual(
    home.document.documentElement.classList.contains(
      "youtube-groups--guide-pinned",
    ),
    false,
  );
});

test("un cambio externo que borra el grupo del filtro deja la selección vacía", async () => {
  const dom = await loadWithGuide({
    url: "https://www.youtube.com/feed/subscriptions",
  });
  const clear = dom.document.querySelector(".youtube-groups__guide-clear");

  dom.document.querySelector('[data-group-id="A"]').click();
  await dom.flush();
  assert.strictEqual(clear.disabled, false);

  await dom.browser.storage.local.set({
    youtubeGroups: { version: 1, groups: [makeGroup("B")] },
  });
  for (let turn = 0; turn < 5; turn += 1) {
    await dom.flush();
  }

  assert.strictEqual(clear.disabled, true);
});

test("la selección es única: elegir otro sustituye al anterior y repetir deselecciona", async () => {
  const dom = await loadWithGuide({
    url: "https://www.youtube.com/feed/subscriptions",
  });
  const groupButton = (index) =>
    dom.document.querySelectorAll(`${GUIDE} [data-group-id]`)[index];

  groupButton(0).click();
  await dom.flush();
  groupButton(1).click();
  await dom.flush();
  assert.strictEqual(groupButton(0).getAttribute("aria-pressed"), "false");
  assert.strictEqual(groupButton(1).getAttribute("aria-pressed"), "true");

  groupButton(1).click();
  await dom.flush();
  assert.strictEqual(groupButton(1).getAttribute("aria-pressed"), "false");
  assert.strictEqual(
    dom.document.querySelectorAll(`${GUIDE} [aria-pressed="true"]`).length,
    0,
  );
});

test('"Sin grupo" con un canal seleccionado deja solo "Sin grupo"', async () => {
  const dom = await loadWithGuide({
    url: "https://www.youtube.com/feed/subscriptions",
  });
  const channel = dom.document.querySelector(".youtube-groups__guide-channel");
  channel.click();
  await dom.flush();
  assert.strictEqual(
    dom.document.querySelectorAll(`${GUIDE} [aria-pressed="true"]`).length,
    1,
  );

  dom.document.querySelector(UNGROUPED).click();
  await dom.flush();
  const pressedItems = dom.document.querySelectorAll(
    `${GUIDE} [aria-pressed="true"]`,
  );
  assert.strictEqual(pressedItems.length, 1);
  assert.strictEqual(pressedItems[0], dom.document.querySelector(UNGROUPED));
});

test("un traspaso con dos claves válidas deja seleccionada solo la primera", async () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const scripts = manifestScripts();
  const dom = loadDom({
    html: GUIDE_HTML,
    store: guideStore(),
    url: "https://www.youtube.com/feed/subscriptions",
    scripts: scripts.filter((file) => file !== "content.js"),
  });
  const groups = (await dom.browser.storage.local.get("youtubeGroups"))
    .youtubeGroups.groups;
  dom.sessionStorage.setItem(
    "youtubeGroupsPendingFilter",
    JSON.stringify({
      version: 3,
      selection: [`group:${groups[0].id}`, `group:${groups[1].id}`],
      createdAt: Date.now(),
    }),
  );
  dom.window.eval(
    fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8"),
  );
  for (let turn = 0; turn < 5; turn += 1) {
    await dom.flush();
  }

  const pressedItems = dom.document.querySelectorAll(
    `${GUIDE} [aria-pressed="true"]`,
  );
  assert.strictEqual(pressedItems.length, 1);
  assert.strictEqual(
    pressedItems[0].getAttribute("data-group-id"),
    groups[0].id,
  );
});

test("los filtros avanzados siguen aplicados al cambiar de grupo", async () => {
  const dom = await loadWithGuide({
    url: "https://www.youtube.com/feed/subscriptions",
  });
  dom.document.querySelector(".youtube-groups__guide-menu-button").click();
  await dom.flush();
  const select = dom.document.querySelector(
    '.youtube-groups__filter-select[data-filter="duration"]',
  );
  select.value = "short";
  select.dispatchEvent(new dom.window.Event("change"));

  const groupButton = (index) =>
    dom.document.querySelectorAll(`${GUIDE} [data-group-id]`)[index];
  groupButton(0).click();
  await dom.flush();
  groupButton(1).click();
  await dom.flush();

  assert.strictEqual(select.value, "short");
});

/**
 * Simula que un nombre recortado no cabe y fija `prefers-reduced-motion`.
 * @param {Object} dom - Resultado de loadDom.
 * @param {Element} name - Nombre `.youtube-groups__guide-name`.
 * @param {boolean} reduce - Si el sistema pide reducir el movimiento.
 * @param {number} scrollWidth - Ancho total simulado.
 */
function fakeOverflow(dom, name, reduce, scrollWidth) {
  Object.defineProperty(name, "scrollWidth", {
    configurable: true,
    value: scrollWidth,
  });
  Object.defineProperty(name, "clientWidth", {
    configurable: true,
    value: 100,
  });
  dom.window.matchMedia = () => ({
    matches: reduce,
    addEventListener() {},
    removeEventListener() {},
  });
}

const MARQUEE = "youtube-groups__guide-name--marquee";

test("la marquesina arranca con el ratón y con el foco si el nombre no cabe", async () => {
  const dom = await loadWithGuide();
  const item = dom.document.querySelector(`${GUIDE} [data-group-id]`);
  const name = item.querySelector(".youtube-groups__guide-name");
  fakeOverflow(dom, name, false, 180);
  const fire = (type, target = name) =>
    target.dispatchEvent(new dom.window.Event(type, { bubbles: true }));

  fire("pointerover");
  assert.ok(name.classList.contains(MARQUEE));
  assert.strictEqual(
    name.style.getPropertyValue("--yg-marquee-distance"),
    "80px",
  );
  assert.strictEqual(
    name.style.getPropertyValue("--yg-marquee-duration"),
    "2000ms",
  );

  fire("pointerout");
  assert.ok(!name.classList.contains(MARQUEE));
  assert.strictEqual(name.style.getPropertyValue("--yg-marquee-distance"), "");

  fire("focusin", item);
  assert.ok(name.classList.contains(MARQUEE));
  fire("focusout", item);
  assert.ok(!name.classList.contains(MARQUEE));
});

test("un nombre que cabe no recibe la marquesina", async () => {
  const dom = await loadWithGuide();
  const name = dom.document.querySelector(
    `${GUIDE} [data-group-id] .youtube-groups__guide-name`,
  );
  fakeOverflow(dom, name, false, 100);
  name.dispatchEvent(new dom.window.Event("pointerover", { bubbles: true }));
  assert.ok(!name.classList.contains(MARQUEE));
});

test("con reducir movimiento no hay marquesina y el title lleva el nombre completo", async () => {
  const dom = await loadWithGuide();
  const group = dom.document.querySelector(`${GUIDE} [data-group-id]`);
  const groupName = group.querySelector(".youtube-groups__guide-name");
  fakeOverflow(dom, groupName, true, 180);
  groupName.dispatchEvent(
    new dom.window.Event("pointerover", { bubbles: true }),
  );
  assert.ok(!groupName.classList.contains(MARQUEE));
  assert.strictEqual(group.title, "A");

  const channel = dom.document.querySelector(
    `${GUIDE} .youtube-groups__guide-channel`,
  );
  const channelName = channel.querySelector(".youtube-groups__guide-name");
  fakeOverflow(dom, channelName, true, 180);
  channelName.dispatchEvent(
    new dom.window.Event("pointerover", { bubbles: true }),
  );
  assert.ok(!channelName.classList.contains(MARQUEE));
  assert.strictEqual(channel.title, `Canal · ${CHANNEL_URL}`);
});

test("la marquesina del rótulo de navegación arranca, para y se limpia al cambiar de columna", async () => {
  const dom = await loadWithGuide();
  const nav = dom.document.querySelector(".youtube-groups__guide-nav");
  const label = nav.querySelector(".youtube-groups__guide-name");
  const fire = (type, target) =>
    target.dispatchEvent(new dom.window.Event(type, { bubbles: true }));
  const back = dom.document.querySelector(".youtube-groups__guide-back");

  dom.document.querySelector(".youtube-groups__guide-enter").click();
  await dom.flush();
  assert.strictEqual(label.textContent, "A");

  fakeOverflow(dom, label, false, 180);
  fire("pointerover", label);
  assert.ok(label.classList.contains(MARQUEE));
  assert.strictEqual(
    label.style.getPropertyValue("--yg-marquee-distance"),
    "80px",
  );
  fire("pointerout", label);
  assert.ok(!label.classList.contains(MARQUEE));
  fire("focusin", back);
  assert.ok(label.classList.contains(MARQUEE));
  fire("focusout", back);
  assert.ok(!label.classList.contains(MARQUEE));

  fakeOverflow(dom, label, false, 100);
  fire("pointerover", label);
  assert.ok(!label.classList.contains(MARQUEE));

  fakeOverflow(dom, label, true, 180);
  fire("pointerover", label);
  assert.ok(!label.classList.contains(MARQUEE));
  assert.strictEqual(nav.title, "A");

  fakeOverflow(dom, label, false, 180);
  fire("pointerover", label);
  assert.ok(label.classList.contains(MARQUEE));
  back.click();
  await dom.flush();
  assert.strictEqual(label.textContent, "Suscripciones");
  assert.ok(!label.classList.contains(MARQUEE));
  assert.ok(!nav.hasAttribute("title"));
});

test("los botones de icono de la guía llevan la clase común, y '‹' y '›' la pequeña", async () => {
  const dom = await loadWithGuide();
  const ICON = "youtube-groups__icon-button";
  const back = dom.document.querySelector(".youtube-groups__guide-back");
  assert.ok(back.classList.contains(ICON));
  assert.ok(back.classList.contains(`${ICON}--small`));
  for (const hook of ["create", "edit", "clear", "menu-button"]) {
    const button = dom.document.querySelector(`.youtube-groups__guide-${hook}`);
    assert.ok(button.classList.contains(ICON), hook);
    assert.ok(!button.classList.contains(`${ICON}--small`), hook);
  }
  const enter = dom.document.querySelector(".youtube-groups__guide-enter");
  assert.ok(enter.classList.contains(ICON));
  assert.ok(enter.classList.contains(`${ICON}--small`));
  for (const button of [back, enter]) {
    assert.strictEqual(button.textContent, "", "sin glifo de texto");
    assert.strictEqual(button.children.length, 1);
    assert.strictEqual(button.firstElementChild.localName, "svg");
  }
});

test('el foco pasa a "‹" tras "›" y vuelve al "›" de A tras "‹"', async () => {
  const dom = await loadWithGuide();
  dom.document.querySelector(".youtube-groups__guide-enter").click();
  await dom.flush();
  assert.strictEqual(
    dom.document.activeElement,
    dom.document.querySelector(".youtube-groups__guide-back"),
  );

  dom.document.querySelector(".youtube-groups__guide-back").click();
  await dom.flush();
  const column = dom.document.querySelector(
    `${GUIDE} .youtube-groups__guide-viewport`,
  ).lastElementChild;
  const rowA = column
    .querySelector('[data-group-id="A"]')
    .closest(".youtube-groups__guide-row");
  assert.strictEqual(
    dom.document.activeElement,
    rowA.querySelector(".youtube-groups__guide-enter"),
  );
});

test('crear un subgrupo desde la raíz no mueve el foco a "‹"', async () => {
  const dom = await loadWithGuide();
  dom.document.querySelector('[data-group-id="A"]').click();
  await dom.flush();
  dom.document.querySelector(".youtube-groups__guide-create").click();
  const form = dom.document.querySelector(".youtube-groups__guide-form");
  form.querySelector("input").value = "Nuevo";
  form.querySelector("button[type='submit']").click();
  await dom.flush();

  assert.notStrictEqual(
    dom.document.activeElement,
    dom.document.querySelector(".youtube-groups__guide-back"),
  );
});
