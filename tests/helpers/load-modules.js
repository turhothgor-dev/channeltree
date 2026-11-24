// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..", "..");
const MODULES = [
  "storage.js",
  "undo.js",
  "fxemoji-data.js",
  "icons.js",
  "groups.js",
  "avatars.js",
  "subscriptions.js",
  "new-videos.js",
  "hidden-channels.js",
  "channel-activity.js",
  "unsubscribes.js",
  "yt-data.js",
  "background-refresh.js",
  "group-editor.js",
  "keyword-rules.js",
  "watched.js",
  "settings.js",
  "visibility.js",
  "metadata.js",
  "pages.js",
  "filter.js",
  "guide.js",
  "playlists.js",
  "backup.js",
  "sync.js",
];

/**
 * Carga los scripts clásicos de modules/ en un contexto vm con un
 * browser.storage.local simulado (guarda y devuelve copias, cuenta llamadas a set).
 */
function loadModules(
  initialStore = {},
  {
    latencyMs = 0,
    origin = "https://www.youtube.com",
    sync,
    store: shared,
  } = {},
) {
  // `store` permite que dos contextos compartan almacén, como dos pestañas.
  const store = shared || structuredClone(initialStore);
  const calls = { get: 0, set: 0 };
  const delay = () =>
    latencyMs > 0
      ? new Promise((resolve) => setTimeout(resolve, latencyMs))
      : null;

  const browser = {
    storage: {
      local: {
        async get(key) {
          calls.get += 1;
          await delay();
          return key in store ? { [key]: structuredClone(store[key]) } : {};
        },
        async set(items) {
          calls.set += 1;
          await delay();
          Object.assign(store, structuredClone(items));
        },
        async remove(key) {
          calls.remove = (calls.remove || 0) + 1;
          await delay();
          for (const name of Array.isArray(key) ? key : [key]) {
            delete store[name];
          }
        },
      },
      ...(sync ? { sync } : {}),
    },
  };

  const context = vm.createContext({
    window: { location: { origin } },
    URL,
    crypto: globalThis.crypto,
    TextEncoder,
    setTimeout,
    clearTimeout,
    structuredClone,
    browser,
  });

  for (const file of MODULES) {
    const code = fs.readFileSync(path.join(ROOT, "modules", file), "utf8");
    vm.runInContext(code, context, { filename: file });
  }

  return {
    store,
    calls,
    YouTubeGroups: vm.runInContext("YouTubeGroups", context),
    YouTubeGroupsAvatars: vm.runInContext("YouTubeGroupsAvatars", context),
    YouTubeGroupsSubscriptions: vm.runInContext(
      "YouTubeGroupsSubscriptions",
      context,
    ),
    YouTubeGroupsNewVideos: vm.runInContext("YouTubeGroupsNewVideos", context),
    YouTubeGroupsHiddenChannels: vm.runInContext(
      "YouTubeGroupsHiddenChannels",
      context,
    ),
    YouTubeGroupsChannelActivity: vm.runInContext(
      "YouTubeGroupsChannelActivity",
      context,
    ),
    YouTubeGroupsUnsubscribes: vm.runInContext(
      "YouTubeGroupsUnsubscribes",
      context,
    ),
    YouTubeGroupsYtData: vm.runInContext("YouTubeGroupsYtData", context),
    YouTubeGroupsBackgroundRefresh: vm.runInContext(
      "YouTubeGroupsBackgroundRefresh",
      context,
    ),
    YouTubeGroupsEditor: vm.runInContext("YouTubeGroupsEditor", context),
    YouTubeGroupsKeywordRules: vm.runInContext(
      "YouTubeGroupsKeywordRules",
      context,
    ),
    YouTubeGroupsFxemoji: vm.runInContext("YouTubeGroupsFxemoji", context),
    YouTubeGroupsIcons: vm.runInContext("YouTubeGroupsIcons", context),
    YouTubeGroupsStorage: vm.runInContext("YouTubeGroupsStorage", context),
    YouTubeGroupsUndo: vm.runInContext("YouTubeGroupsUndo", context),
    YouTubeGroupsWatched: vm.runInContext("YouTubeGroupsWatched", context),
    YouTubeGroupsSettings: vm.runInContext("YouTubeGroupsSettings", context),
    YouTubeGroupsVisibility: vm.runInContext(
      "YouTubeGroupsVisibility",
      context,
    ),
    YouTubeGroupsMetadata: vm.runInContext("YouTubeGroupsMetadata", context),
    YouTubeGroupsPages: vm.runInContext("YouTubeGroupsPages", context),
    YouTubeGroupsFilter: vm.runInContext("YouTubeGroupsFilter", context),
    YouTubeGroupsGuide: vm.runInContext("YouTubeGroupsGuide", context),
    YouTubeGroupsPlaylists: vm.runInContext("YouTubeGroupsPlaylists", context),
    YouTubeGroupsBackup: vm.runInContext("YouTubeGroupsBackup", context),
    YouTubeGroupsSync: vm.runInContext("YouTubeGroupsSync", context),
  };
}

// Pasa un objeto creado en el contexto vm a uno comparable con deepStrictEqual.
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = { loadModules, plain };
