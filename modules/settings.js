// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

const YouTubeGroupsSettings = (() => {
  const DEFAULT_SETTINGS = Object.freeze({
    watchedMode: "dim",
    outsideMode: "hide",
    autoMarkPercent: 80,
    accentColor: "#1a73e8",
    backgroundRefresh: true,
    showNewBadge: true,
  });
  const DEFAULT_ACCENT_COLOR = DEFAULT_SETTINGS.accentColor;
  const WATCHED_MODES = Object.freeze(["show", "dim", "hide"]);
  const OUTSIDE_MODES = Object.freeze(["hide", "dim"]);
  const AUTO_MARK_PERCENTS = Object.freeze([0, 50, 80, 95]);

  /**
   * Indica si un valor es un color `#rrggbb`.
   *
   * @param {*} value - Valor a comprobar.
   * @returns {boolean}
   */
  function isValidAccentColor(value) {
    return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
  }

  // Un validador por ajuste; `normalize` devuelve el valor guardable.
  const VALIDATORS = {
    watchedMode: {
      isValid: (value) => WATCHED_MODES.includes(value),
      normalize: (value) => value,
    },
    outsideMode: {
      isValid: (value) => OUTSIDE_MODES.includes(value),
      normalize: (value) => value,
    },
    autoMarkPercent: {
      isValid: (value) => AUTO_MARK_PERCENTS.includes(value),
      normalize: (value) => value,
    },
    accentColor: {
      isValid: isValidAccentColor,
      normalize: (value) => value.toLowerCase(),
    },
    backgroundRefresh: {
      isValid: (value) => typeof value === "boolean",
      normalize: (value) => value,
    },
    showNewBadge: {
      isValid: (value) => typeof value === "boolean",
      normalize: (value) => value,
    },
  };

  /**
   * Indica si un valor es un objeto plano (no null ni array).
   *
   * @param {*} value - Valor a comprobar.
   * @returns {boolean}
   */
  function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  /**
   * Devuelve unos ajustes completos y válidos a partir de lo guardado.
   *
   * @param {*} raw - Lo leído del almacenamiento (puede ser cualquier cosa).
   * @returns {{watchedMode: string, outsideMode: string, autoMarkPercent: number, accentColor: string, backgroundRefresh: boolean, showNewBadge: boolean}} Objeto nuevo con solo los campos conocidos.
   */
  function normalizeSettings(raw) {
    const source = isPlainObject(raw) ? raw : {};
    const result = {};

    for (const [key, validator] of Object.entries(VALIDATORS)) {
      result[key] = validator.isValid(source[key])
        ? validator.normalize(source[key])
        : DEFAULT_SETTINGS[key];
    }

    return result;
  }

  /**
   * Lee los ajustes guardados y los normaliza.
   *
   * @returns {Promise<{watchedMode: string, outsideMode: string, autoMarkPercent: number}>}
   */
  async function getSettings() {
    return normalizeSettings(await YouTubeGroupsStorage.getSettings());
  }

  /**
   * Aplica un cambio parcial a los ajustes y escribe solo si algo cambia.
   *
   * @param {Object} patch - Claves de ajuste con su nuevo valor.
   * @returns {Promise<{settings: Object, changed: boolean}>}
   * @throws {Error} Si hay una clave desconocida o un valor no válido.
   */
  async function updateSettings(patch) {
    if (!isPlainObject(patch)) {
      throw new Error("Ajuste inválido: patch.");
    }

    for (const [key, value] of Object.entries(patch)) {
      if (!Object.hasOwn(VALIDATORS, key) || !VALIDATORS[key].isValid(value)) {
        throw new Error(`Ajuste inválido: ${key}.`);
      }
    }
    patch = { ...patch };
    for (const key of Object.keys(patch)) {
      patch[key] = VALIDATORS[key].normalize(patch[key]);
    }

    return YouTubeGroupsStorage.withLock(
      YouTubeGroupsStorage.KEYS.settings,
      async () => {
        const current = await getSettings();
        const settings = { ...current, ...patch };
        const changed = Object.keys(settings).some(
          (key) => settings[key] !== current[key],
        );

        if (changed) {
          await YouTubeGroupsStorage.saveSettings(settings);
        }

        return { settings, changed };
      },
    );
  }

  return {
    DEFAULT_SETTINGS,
    DEFAULT_ACCENT_COLOR,
    isValidAccentColor,
    WATCHED_MODES,
    OUTSIDE_MODES,
    AUTO_MARK_PERCENTS,
    normalizeSettings,
    getSettings,
    updateSettings,
  };
})();
