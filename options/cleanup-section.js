// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

/**
 * Sección "Limpieza" de la página de opciones: analiza el árbol de grupos
 * (canales repetidos, URL no válidas y grupos vacíos) y aplica sin confirmar
 * las limpiezas elegidas, con "Deshacer" (ADR 0025). Los textos del informe
 * vienen del almacenamiento: siempre `textContent`, nunca innerHTML.
 */
const YouTubeGroupsCleanupSection = (() => {
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
   * Crea una casilla con su etiqueta.
   * @param {string} className - Clase de la casilla.
   * @param {string} text - Texto de la etiqueta.
   * @param {boolean} checked - Si empieza marcada.
   * @returns {{label: HTMLLabelElement, box: HTMLInputElement}} Etiqueta y casilla.
   */
  function checkbox(className, text, checked) {
    const label = el("label", "options__cleanup-option");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = className;
    box.checked = checked;
    label.append(box, el("span", "", text));
    return { label, box };
  }

  /**
   * Crea la sección dentro de un contenedor.
   * @param {HTMLElement} container - Sección donde se pinta.
   * @param {Object} options - Dependencias.
   * @param {function(string, function(): void, boolean): void} options.showNotice -
   *   Muestra un aviso con "Deshacer" opcional.
   * @param {function(Object): Promise<void>} options.undoGroups - Deshace una
   *   operación de grupos.
   * @returns {{setGroups: function(Array<Object>): void}} Componente.
   */
  function create(container, { showNotice, undoGroups }) {
    const title = el("h2", "options__channels-title", "Limpieza");
    title.id = "options-cleanup-title";
    const analyzeButton = el(
      "button",
      "action-button secondary-button options__cleanup-analyze",
      "Analizar",
    );
    analyzeButton.type = "button";
    const result = el("div", "options__cleanup-result");
    result.hidden = true;
    const report = el("div", "options__cleanup-report");
    const duplicates = checkbox(
      "options__cleanup-duplicates",
      "Unir canales repetidos",
      true,
    );
    const invalid = checkbox(
      "options__cleanup-invalid",
      "Corregir URL no válidas",
      true,
    );
    const empty = checkbox(
      "options__cleanup-empty",
      "Eliminar grupos vacíos",
      false,
    );
    const applyButton = el(
      "button",
      "action-button primary-button options__cleanup-apply",
      "Limpiar",
    );
    applyButton.type = "button";
    applyButton.disabled = true;
    result.append(
      report,
      duplicates.label,
      invalid.label,
      empty.label,
      applyButton,
    );
    const status = el("p", "options__section-status");
    status.setAttribute("aria-live", "polite");
    container.replaceChildren(
      title,
      el(
        "p",
        "options__channels-summary",
        "Detecta canales repetidos, URL no válidas y grupos vacíos, y limpia los que elijas.",
      ),
      analyzeButton,
      result,
      status,
    );

    /** Último análisis a la vista, o `null` si aún no se ha analizado. */
    let analysis = null;

    /**
     * Limpiezas elegidas en las casillas.
     * @returns {{duplicates: boolean, invalid: boolean, emptyGroups: boolean}}
     */
    function getChosen() {
      return {
        duplicates: duplicates.box.checked,
        invalid: invalid.box.checked,
        emptyGroups: empty.box.checked,
      };
    }

    /**
     * Cuenta los elementos que se limpiarían con lo elegido.
     * @returns {number} Número de elementos.
     */
    function countChosen() {
      if (!analysis) {
        return 0;
      }
      const chosen = getChosen();
      return (
        (chosen.duplicates ? analysis.duplicates.length : 0) +
        (chosen.invalid ? analysis.invalid.length : 0) +
        (chosen.emptyGroups ? analysis.emptyGroups.length : 0)
      );
    }

    /**
     * Habilita "Limpiar" solo si hay algo elegido que limpiar.
     * @returns {void}
     */
    function syncApplyButton() {
      applyButton.disabled = countChosen() === 0;
    }

    /**
     * Añade al informe un título con su recuento y la lista de elementos.
     * @param {string} heading - Título.
     * @param {Array<Object>} items - Elementos encontrados.
     * @param {function(Object): string} describe - Texto de cada elemento.
     * @returns {void}
     */
    function appendSection(heading, items, describe) {
      report.append(
        el("h3", "options__cleanup-title", heading + ": " + items.length),
      );
      if (items.length === 0) {
        return;
      }
      const list = el("ul", "options__cleanup-list");
      for (const item of items) {
        list.append(el("li", "", describe(item)));
      }
      report.append(list);
    }

    /**
     * Repinta el informe con el análisis actual, sin tocar las casillas.
     * @returns {void}
     */
    function renderReport() {
      report.replaceChildren();
      const describeChannel = (item) =>
        item.groupName + " › " + item.name + " (" + item.url + ")";
      appendSection("Canales repetidos", analysis.duplicates, describeChannel);
      appendSection(
        "URL no válidas",
        analysis.invalid,
        (item) =>
          describeChannel(item) +
          " " +
          (item.fixedUrl ? "→ " + item.fixedUrl : "(se quitará)"),
      );
      appendSection("Grupos vacíos", analysis.emptyGroups, (item) => item.name);
      result.hidden = false;
      syncApplyButton();
    }

    /**
     * Analiza los grupos guardados y pinta el informe.
     * @returns {Promise<void>}
     */
    async function analyze() {
      const groups = await YouTubeGroupsStorage.getGroups();
      analysis = YouTubeGroups.analyzeGroups(groups);
      renderReport();
    }

    analyzeButton.addEventListener("click", async () => {
      status.textContent = "";
      try {
        await analyze();
      } catch (error) {
        status.textContent = "No se pudo analizar: " + error.message;
        console.error("[ChannelTree] No se pudo analizar", error);
      }
    });

    for (const box of [duplicates.box, invalid.box, empty.box]) {
      box.addEventListener("change", syncApplyButton);
    }

    applyButton.addEventListener("click", async () => {
      status.textContent = "";
      const total = countChosen();
      if (total === 0) {
        return;
      }
      applyButton.disabled = true;
      try {
        const { changed, undo } =
          await YouTubeGroups.cleanupGroups(getChosen());
        await analyze();
        if (changed) {
          status.textContent = "Limpieza hecha.";
          showNotice(
            "Limpieza hecha: " + total + " elementos",
            () => undoGroups(undo),
            true,
          );
        } else {
          status.textContent = "No había nada que limpiar.";
        }
      } catch (error) {
        status.textContent = "No se pudo limpiar: " + error.message;
        console.error("[ChannelTree] No se pudo limpiar", error);
        syncApplyButton();
      }
    });

    /**
     * Si hay un análisis a la vista, lo rehace con estos grupos.
     * @param {Array<Object>} groups - Árbol de grupos actual.
     * @returns {void}
     */
    function setGroups(groups) {
      if (!analysis) {
        return;
      }
      analysis = YouTubeGroups.analyzeGroups(groups);
      renderReport();
    }

    return { setGroups };
  }

  return Object.freeze({ create });
})();
