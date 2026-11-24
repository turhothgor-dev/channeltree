// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

/**
 * Sección "Copia de seguridad" de la página de opciones: exporta e importa un
 * fichero JSON con los datos de la extensión (ADR 0006 y 0030: incluye
 * suscripciones, vídeos nuevos y actividad; no el estado de la sincronización
 * ni las preferencias de vista, que son de cada dispositivo). Tras importar, la
 * página se repinta por su `storage.onChanged`. No usa innerHTML con datos.
 */
const YouTubeGroupsBackupSection = (() => {
  /**
   * Crea un elemento con clase y texto opcional.
   * @param {string} tag - Etiqueta.
   * @param {string} className - Clase CSS.
   * @param {string} [text] - Texto.
   * @returns {HTMLElement} Elemento.
   */
  function el(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  }

  /**
   * Crea la sección dentro de un contenedor.
   * @param {HTMLElement} container - Sección donde se pinta.
   * @returns {{}} Componente (sin API pública).
   */
  function create(container) {
    const title = el("h2", "options__channels-title", "Copia de seguridad");
    title.id = "options-backup-title";
    const exportButton = el(
      "button",
      "action-button secondary-button options__backup-export",
      "Exportar copia",
    );
    exportButton.type = "button";
    const importButton = el(
      "button",
      "action-button secondary-button options__backup-import",
      "Importar copia",
    );
    importButton.type = "button";
    const fileInput = el("input", "options__backup-file");
    fileInput.type = "file";
    fileInput.accept = ".json,application/json";
    fileInput.hidden = true;
    const status = el("p", "options__section-status");
    status.setAttribute("aria-live", "polite");
    // Fila con separación: seguidos, los dos botones quedan pegados
    const buttonRow = el("div", "options__button-row");
    buttonRow.append(exportButton, importButton);
    container.replaceChildren(
      title,
      el(
        "p",
        "options__channels-summary",
        "Incluye grupos (con sus palabras clave), vídeos vistos, ajustes, listas, avatares, canales ocultos, suscripciones conocidas, vídeos nuevos y actividad de los canales. No incluye el estado de la sincronización ni las preferencias de vista de esta página, que son de cada dispositivo.",
      ),
      buttonRow,
      fileInput,
      status,
    );

    exportButton.addEventListener("click", async () => {
      status.textContent = "";
      try {
        const text = await YouTubeGroupsBackup.exportBackup();
        const blob = new Blob([text], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download =
          "channeltree-" + new Date().toISOString().slice(0, 10) + ".json";
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      } catch (error) {
        status.textContent = error.message;
        console.error("[ChannelTree] No se pudo exportar", error);
      }
    });

    importButton.addEventListener("click", () => {
      fileInput.click();
    });

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];
      if (!file) {
        return;
      }
      status.textContent = "";
      try {
        if (
          !confirm(
            "Se reemplazarán los datos de este navegador por los de la copia. Lo que una copia antigua no incluya se conserva. La sincronización y las preferencias de vista no cambian. ¿Continuar?",
          )
        ) {
          return;
        }
        const text = await file.text();
        const { dropped } = await YouTubeGroupsBackup.importBackup(text);
        status.textContent =
          dropped > 0
            ? "Copia importada (" + dropped + " entradas descartadas)."
            : "Copia importada.";
      } catch (error) {
        status.textContent = error.message;
      } finally {
        fileInput.value = "";
      }
    });

    return {};
  }

  return Object.freeze({ create });
})();
