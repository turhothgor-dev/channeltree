// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

/**
 * Color de acento (ADR 0040): publica `--yg-accent` y `--yg-accent-text` en un
 * `<style>` propio del documento, sin tocar el atributo `style` de `<html>`.
 * Sin estado ni `ctx`: no toca el DOM al cargar.
 */
const YouTubeGroupsAccent = (() => {
  const STYLE_ID = "youtube-groups-accent";

  /**
   * Aplica el color de acento al documento.
   * @param {Document} doc - Documento en el que se escribe el estilo.
   * @param {*} color - `#rrggbb`; si no es válido, el de por defecto.
   */
  function applyAccent(doc, color) {
    const accent = YouTubeGroupsSettings.isValidAccentColor(color)
      ? color.toLowerCase()
      : YouTubeGroupsSettings.DEFAULT_ACCENT_COLOR;
    const text = YouTubeGroupsIcons.getContrastTextColor(accent);
    const css = `:root { --yg-accent: ${accent}; --yg-accent-text: ${text}; }`;

    let style = doc.getElementById(STYLE_ID);
    if (!style) {
      style = doc.createElement("style");
      style.id = STYLE_ID;
      (doc.head || doc.documentElement).append(style);
    }
    if (style.textContent !== css) {
      style.textContent = css;
    }
  }

  return Object.freeze({ applyAccent });
})();
