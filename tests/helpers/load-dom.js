// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM, VirtualConsole } = require("jsdom");

const ROOT = path.resolve(__dirname, "..", "..");
const openWindows = [];

// Los temporizadores de `content.js` (actualización en segundo plano) mantienen
// vivo el proceso: al acabar el fichero de test se cierran todas las ventanas.
require("node:test").after(() => {
  for (const window of openWindows.splice(0)) {
    window.close();
  }
});

const DEFAULT_URL = "https://www.youtube.com/feed/subscriptions";
const MAX_FLUSH_TURNS = 100;

/**
 * Devuelve los scripts de content_scripts[0].js del manifiesto, en su orden.
 * @returns {string[]} Rutas relativas a la raíz del proyecto.
 */
function manifestScripts() {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"),
  );
  return manifest.content_scripts[0].js;
}

/**
 * Comandos por defecto del mensaje de atajos: los de `manifest.json`,
 * con `shortcut` = `suggested_key.default`.
 * @returns {Array<{name: string, description: string, shortcut: string}>}
 */
function defaultCommands() {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"),
  );
  return Object.entries(manifest.commands || {}).map(([name, command]) => ({
    name,
    description: command.description,
    shortcut: command.suggested_key?.default || "",
  }));
}

/**
 * Respuesta por defecto del fondo simulado a `runtime.sendMessage`.
 * @param {Object} message - Mensaje enviado.
 * @returns {Object|undefined} Respuesta, o `undefined` si no es de atajos.
 */
function defaultRuntimeResponder(message) {
  if (message?.type === "youtube-groups:get-shortcuts") {
    return { commands: defaultCommands(), canOpenSettings: true };
  }
  if (message?.type === "youtube-groups:open-shortcut-settings") {
    return { opened: true };
  }
  return undefined;
}

/**
 * Crea un documento de jsdom y ejecuta en su contexto, con node:vm, los scripts
 * del manifiesto con un browser.storage simulado (get/set con copias y
 * contadores, onChanged asíncrono). `location` es el de jsdom: una navegación a
 * otra página no se ejecuta y se cuenta en `navigations`.
 * @param {Object} [options] - Todo opcional.
 * @param {string} [options.url] - URL de la página.
 * @param {string} [options.html] - HTML dentro de <body>.
 * @param {Object} [options.store] - Contenido inicial del almacenamiento.
 * @param {string[]} [options.scripts] - Scripts a ejecutar (por defecto, los del manifiesto).
 * @param {Function} [options.confirm] - Sustituto de `confirm`.
 * @param {Function} [options.prompt] - Sustituto de `prompt`.
 * @param {function(Object): *} [options.runtimeResponder] - Lo que devuelve
 *   `browser.runtime.sendMessage(message)` (puede ser una promesa); por
 *   defecto, `{ commands, canOpenSettings: true }` a
 *   `youtube-groups:get-shortcuts`, `{ opened: true }` a
 *   `youtube-groups:open-shortcut-settings` y `undefined` al resto. El
 *   `browser` simulado no tiene `browser.commands` (los scripts de contenido
 *   tampoco).
 * @param {Object<string, string>|"throws"} [options.localStorage] - Entradas
 *   a sembrar en `localStorage` antes de ejecutar los scripts, o `"throws"`
 *   para que leer `window.localStorage` lance.
 * @param {Object<string, string>} [options.sessionStorage] - Entradas a
 *   sembrar en `sessionStorage` antes de ejecutar los scripts.
 * @returns {Object} { window, document, browser, store, calls, messages,
 *   sessionStorage, localStorage, location, navigations, flush, global }.
 *   `localStorage` es `null` con `"throws"`. `messages` recoge
 *   lo enviado con `browser.runtime.sendMessage`.
 */
function loadDom({
  url = DEFAULT_URL,
  html = "",
  store: initialStore = {},
  scripts = manifestScripts(),
  confirm = () => true,
  prompt = () => null,
  runtimeResponder = defaultRuntimeResponder,
  localStorage: localStorageSeed,
  sessionStorage: sessionStorageSeed,
} = {}) {
  // jsdom avisa de las navegaciones que no implementa (location.assign a otra
  // página); aquí solo se cuentan.
  const navigations = { count: 0 };
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => {
    if (error && error.type === "not-implemented") {
      navigations.count += 1;
    } else {
      console.error(error);
    }
  });
  const jsdom = new JSDOM(
    `<!doctype html><html><head></head><body>${html}</body></html>`,
    { url, runScripts: "outside-only", virtualConsole },
  );
  const { window } = jsdom;
  openWindows.push(window);
  const { document, location, sessionStorage } = window;
  for (const [key, value] of Object.entries(sessionStorageSeed || {})) {
    sessionStorage.setItem(key, value);
  }

  const store = structuredClone(initialStore);
  const calls = { get: 0, set: 0 };
  const listeners = [];

  const messages = [];
  const runtimeListeners = [];
  const browser = {
    runtime: {
      async sendMessage(message) {
        messages.push(structuredClone(message));
        return runtimeResponder(structuredClone(message));
      },
      onMessage: {
        addListener(listener) {
          runtimeListeners.push(listener);
        },
      },
    },
    storage: {
      local: {
        async get(key) {
          calls.get += 1;
          return key in store ? { [key]: structuredClone(store[key]) } : {};
        },
        async set(items) {
          calls.set += 1;
          const changes = {};
          for (const [key, value] of Object.entries(items)) {
            changes[key] = {
              oldValue: key in store ? structuredClone(store[key]) : undefined,
              newValue: structuredClone(value),
            };
          }
          Object.assign(store, structuredClone(items));
          setImmediate(() => {
            for (const listener of listeners) {
              listener(structuredClone(changes), "local");
            }
          });
        },
      },
      onChanged: {
        addListener(listener) {
          listeners.push(listener);
        },
      },
    },
  };

  const rafQueue = [];

  // jsdom no maqueta ni trae estas APIs del navegador (o no sirven sin
  // maquetación): sustitutos mínimos para que el código no falle.
  const elementProto = window.Element.prototype;
  if (!elementProto.checkVisibility) {
    // Sin maquetación: todo se considera visible.
    elementProto.checkVisibility = () => true;
  }
  Object.assign(window, {
    // Cola controlada por flush() en lugar de pretendToBeVisual.
    requestAnimationFrame: (callback) => rafQueue.push(callback),
    matchMedia: () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }),
    innerWidth: 1280,
    innerHeight: 800,
    confirm,
    prompt,
    alert: () => {},
    browser,
    // jsdom no expone structuredClone en su ventana.
    structuredClone,
  });

  let localStorage = null;
  if (localStorageSeed === "throws") {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new window.DOMException("denegado", "SecurityError");
      },
    });
  } else {
    localStorage = window.localStorage;
    for (const [key, value] of Object.entries(localStorageSeed || {})) {
      localStorage.setItem(key, value);
    }
  }

  const context = jsdom.getInternalVMContext();

  for (const file of scripts) {
    const code = fs.readFileSync(path.join(ROOT, file), "utf8");
    vm.runInContext(code, context, { filename: file });
  }

  /**
   * Espera las microtareas y ejecuta los requestAnimationFrame pendientes, en
   * bucle hasta que no quede nada.
   * @returns {Promise<void>}
   */
  async function flush() {
    for (let turn = 0; turn < MAX_FLUSH_TURNS; turn += 1) {
      await new Promise((resolve) => setImmediate(resolve));
      if (rafQueue.length === 0) {
        return;
      }
      for (const callback of rafQueue.splice(0)) {
        callback(0);
      }
    }
    throw new Error("flush: no se estabiliza tras " + MAX_FLUSH_TURNS);
  }

  /**
   * Entrega un mensaje de runtime a los escuchadores de onMessage.
   * @param {unknown} message - Mensaje (se entrega una copia).
   * @returns {unknown[]} Lo que devuelve cada escuchador.
   */
  function sendRuntimeMessage(message) {
    return runtimeListeners.map((listener) =>
      listener(structuredClone(message)),
    );
  }

  return {
    window,
    document,
    browser,
    sendRuntimeMessage,
    store,
    calls,
    messages,
    sessionStorage,
    localStorage,
    location,
    navigations,
    flush,
    global: (name) => vm.runInContext(name, context),
  };
}

/**
 * Lee options/options.html y devuelve el contenido de <body> sin <script> y las
 * rutas de sus <script src>, relativas a la raíz del proyecto y en su orden.
 * @returns {{html: string, scripts: string[]}} Entrada para loadDom.
 */
function optionsPage() {
  const source = fs.readFileSync(
    path.join(ROOT, "options", "options.html"),
    "utf8",
  );
  const body = /<body[^>]*>([\s\S]*)<\/body>/.exec(source)[1];
  const scripts = [
    ...body.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*>\s*<\/script>/g),
  ].map((match) =>
    match[1].startsWith("/")
      ? match[1].slice(1)
      : path.posix.join("options", match[1]),
  );
  const html = body.replace(/<script\b[\s\S]*?<\/script>/g, "");
  return { html, scripts };
}

/**
 * Carga options/options.html en jsdom con sus scripts. Usa una URL https: con
 * un origen opaco (moz-extension:) jsdom lanza al leer sessionStorage.
 * @param {Object} [options] - Opciones de loadDom (store, confirm, prompt...).
 * @returns {Object} Lo mismo que loadDom.
 */
function loadOptionsDom(options = {}) {
  const { html, scripts } = optionsPage();
  return loadDom({
    url: "https://example.com/options/options.html",
    ...options,
    html,
    scripts,
  });
}

module.exports = { loadDom, manifestScripts, optionsPage, loadOptionsDom };
