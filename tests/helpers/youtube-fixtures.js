// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

// Fragmentos mínimos de HTML de YouTube para los tests de DOM.

/**
 * Guía con `ytd-guide-renderer #sections` y una sección "Más de YouTube"
 * (la que lleva enlaces a hosts de YouTube Music, ver findGuideInsertionIndex).
 */
const GUIDE_HTML = `
  <tp-yt-app-drawer>
    <ytd-guide-renderer><div id="sections">
      <ytd-guide-section-renderer>
        <a href="/feed/subscriptions">Suscripciones</a>
      </ytd-guide-section-renderer>
      <ytd-guide-section-renderer>
        <a href="https://music.youtube.com/">YouTube Music</a>
      </ytd-guide-section-renderer>
    </div></ytd-guide-renderer>
  </tp-yt-app-drawer>`;

/** ID de vídeo de los fragmentos (11 caracteres, como exige extractVideoId). */
const VIDEO_ID = "abc123DEF45";

/** Tarjeta de vídeo de suscripciones con miniatura, enlace de vídeo y de canal. */
const SUBSCRIPTION_CARD_HTML = `
  <ytd-rich-item-renderer>
    <ytd-thumbnail><a id="thumbnail" href="/watch?v=${VIDEO_ID}"><img src="x.jpg"></a></ytd-thumbnail>
    <a id="video-title" href="/watch?v=${VIDEO_ID}">Vídeo de prueba</a>
    <ytd-channel-name><a href="/@canal">Canal</a></ytd-channel-name>
  </ytd-rich-item-renderer>`;

/** Resultado de canal de la búsqueda. */
const CHANNEL_RESULT_HTML = `
  <ytd-channel-renderer>
    <a id="main-link" href="/@canal"><div id="text-container"><ytd-channel-name><span id="text">Canal</span></ytd-channel-name></div></a>
  </ytd-channel-renderer>`;

/** Página /watch con reproductor, vídeo y propietario. */
const WATCH_PAGE_HTML = `
  <ytd-watch-flexy video-id="${VIDEO_ID}">
    <div id="movie_player"><video></video></div>
    <ytd-video-owner-renderer>
      <a href="/@canal">Canal</a>
    </ytd-video-owner-renderer>
  </ytd-watch-flexy>`;

/** ID del segundo Short de `SHORTS_PAGE_HTML` (11 caracteres). */
const SHORT_ID_2 = "zyx987WVU65";

/** Página /shorts con dos reels; el primero, activo, con su reproductor y canal. */
const SHORTS_PAGE_HTML = `
  <ytd-shorts>
    <ytd-reel-video-renderer is-active>
      <div id="player-container"><div id="shorts-player"><video></video></div></div>
      <a href="/@canalshort">Canal Short</a>
    </ytd-reel-video-renderer>
    <ytd-reel-video-renderer>
      <div id="player-container"></div>
      <a href="/@otrocanal">Otro canal</a>
    </ytd-reel-video-renderer>
  </ytd-shorts>`;

/** URL normalizada del canal de las tarjetas de ejemplo. */
const CHANNEL_URL = "https://www.youtube.com/@canal";

/**
 * Grupo con el formato guardado (ver createGroup de modules/groups.js).
 * @param {string} id - Id (y nombre por defecto) del grupo.
 * @param {Object} [options] - name, channels, subgroups, color.
 * @returns {Object} Grupo.
 */
function makeGroup(
  id,
  { name = id, channels = [], subgroups = [], color = "" } = {},
) {
  return {
    id,
    name,
    type: "group",
    channels,
    subgroups,
    icon: "",
    color,
  };
}

/**
 * Contenido inicial del almacenamiento con unos grupos.
 * @param {Object[]} groups - Grupos.
 * @returns {Object} Valor para la opción `store` de loadDom.
 */
function groupsStore(groups) {
  return { youtubeGroups: { version: 1, groups } };
}

module.exports = {
  VIDEO_ID,
  CHANNEL_URL,
  makeGroup,
  groupsStore,
  GUIDE_HTML,
  SUBSCRIPTION_CARD_HTML,
  CHANNEL_RESULT_HTML,
  WATCH_PAGE_HTML,
  SHORT_ID_2,
  SHORTS_PAGE_HTML,
};
