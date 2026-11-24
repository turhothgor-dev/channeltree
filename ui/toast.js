// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

/**
 * Aviso flotante con una acción opcional ("Deshacer"): un único elemento en
 * `document.body` que se oculta solo a los 10 s. Genérico y reutilizable (ADR
 * 0021). Se crea con `create(ctx)`; no toca el DOM al crearse.
 */
const YouTubeGroupsToast = (() => {
  const { shieldControlEvents } = YouTubeGroupsIconsDom;

  const TOAST_ID = "youtube-groups-toast";
  /** Milisegundos que el aviso permanece visible. */
  const DURATION_MS = 10000;

  /**
   * Crea el componente.
   * @param {Object} ctx - Contexto compartido de `content.js` (no se usa).
   * @returns {Readonly<Object>} API: `show` y `hide`.
   */
  function create(ctx) {
    /** @type {HTMLElement|null} */
    let element = null;
    let timer = null;

    /**
     * Devuelve el aviso, creándolo la primera vez.
     * @returns {HTMLElement} El elemento del aviso.
     */
    function getElement() {
      if (element && element.isConnected) {
        return element;
      }
      element = document.createElement("div");
      element.id = TOAST_ID;
      element.className = "youtube-groups__toast";
      element.setAttribute("role", "status");
      element.hidden = true;
      shieldControlEvents(element);
      document.body.appendChild(element);
      return element;
    }

    /** Oculta el aviso y cancela su temporizador. */
    function hide() {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      if (element) {
        element.hidden = true;
      }
    }

    /**
     * Muestra un aviso, sustituyendo al anterior y reiniciando el temporizador.
     * @param {string} message - Texto (se inserta con `textContent`).
     * @param {Object} [options] - Opciones.
     * @param {string} [options.actionLabel="Deshacer"] - Texto del botón.
     * @param {Function} [options.onAction] - Si se da, añade el botón; al
     *   pulsarlo se oculta el aviso y se llama a `onAction()`.
     */
    function show(message, { actionLabel = "Deshacer", onAction } = {}) {
      const toast = getElement();
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      toast.textContent = "";

      const text = document.createElement("span");
      text.className = "youtube-groups__toast-text";
      text.textContent = message;
      toast.appendChild(text);

      let button = null;
      if (typeof onAction === "function") {
        button = document.createElement("button");
        button.type = "button";
        button.className =
          "youtube-groups__toast-action action-button secondary-button";
        button.textContent = actionLabel;
        button.addEventListener("click", () => {
          hide();
          onAction();
        });
        toast.appendChild(button);
      }

      toast.hidden = false;
      if (button) {
        button.focus();
      }
      timer = window.setTimeout(hide, DURATION_MS);
    }

    return Object.freeze({ show, hide });
  }

  return Object.freeze({ create, DURATION_MS });
})();
