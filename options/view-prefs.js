// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

/**
 * Preferencias de vista de la página de opciones (tamaño de página de las listas
 * de "Canales" y pestaña activa). Se guardan en el `localStorage` de la
 * página de opciones, fuera de `youtubeSettings` (ADR 0029). Sin DOM: recibe el
 * almacén y no lanza nunca si no está disponible o tiene datos no válidos.
 */
const YouTubeGroupsViewPrefs = (() => {
  const STORAGE_KEY = "youtubeGroupsOptionsView";
  const PAGE_SIZES = Object.freeze([10, 20, 50, 100]);
  const DEFAULT_PAGE_SIZE = 20;
  const MAX_TAB_LENGTH = 64;

  /**
   * Normaliza unas preferencias: tamaño fuera de la lista → 20; `tab` no
   * válida → `null`. Un `collapsed` guardado por versiones anteriores se
   * ignora.
   * @param {unknown} value - Valor leído (puede ser cualquier cosa).
   * @returns {{pageSize: number, tab: (string|null)}} Preferencias válidas.
   */
  function normalizeViewPrefs(value) {
    const source = value && typeof value === "object" ? value : {};
    const pageSize = PAGE_SIZES.includes(source.pageSize)
      ? source.pageSize
      : DEFAULT_PAGE_SIZE;
    const tab =
      typeof source.tab === "string" &&
      source.tab.length > 0 &&
      source.tab.length <= MAX_TAB_LENGTH
        ? source.tab
        : null;
    return { pageSize, tab };
  }

  /**
   * Lee las preferencias del almacén. Si falla el acceso, la lectura o el
   * `JSON.parse`, devuelve las de por defecto.
   * @param {Storage|(() => Storage)|null|undefined} storage - `localStorage` o
   *   una función que lo devuelve (el acceso a la propiedad puede lanzar).
   * @returns {{pageSize: number, tab: (string|null)}} Preferencias válidas.
   */
  function loadViewPrefs(storage) {
    try {
      const target = typeof storage === "function" ? storage() : storage;
      const raw = target.getItem(STORAGE_KEY);
      return normalizeViewPrefs(raw === null ? null : JSON.parse(raw));
    } catch {
      return normalizeViewPrefs(null);
    }
  }

  /**
   * Guarda las preferencias normalizadas. Fallar no lanza.
   * @param {Storage|(() => Storage)|null|undefined} storage - Como en `loadViewPrefs`.
   * @param {{pageSize?: number, tab?: (string|null)}} prefs - Preferencias.
   * @returns {boolean} `true` si se guardaron.
   */
  function saveViewPrefs(storage, prefs) {
    try {
      const target = typeof storage === "function" ? storage() : storage;
      target.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: 1, ...normalizeViewPrefs(prefs) }),
      );
      return true;
    } catch {
      return false;
    }
  }

  return Object.freeze({
    STORAGE_KEY,
    PAGE_SIZES,
    DEFAULT_PAGE_SIZE,
    normalizeViewPrefs,
    loadViewPrefs,
    saveViewPrefs,
  });
})();
