// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

/**
 * Subapartado "Atajos de teclado" de la sección Ajustes del menú de la guía
 * (ADR 0033): lista los atajos reales de la extensión y ofrece abrir su
 * configuración. Los scripts de contenido no tienen `browser.commands`, así
 * que lo pide al fondo por mensaje (`youtube-groups:get-shortcuts` y
 * `youtube-groups:open-shortcut-settings`). No usa innerHTML con datos.
 */
const YouTubeGroupsShortcutsSection = (() => {
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
   * Crea el subapartado dentro de un contenedor. No lee nada hasta `load()`.
   * @param {HTMLElement} container - Elemento donde se pinta.
   * @returns {Readonly<{load: function(): Promise<void>}>} Componente.
   */
  function create(container) {
    const list = el("ul", "youtube-groups__shortcuts");
    const button = el(
      "button",
      "youtube-groups__shortcuts-change youtube-groups__text-button",
      "Cambiar atajos",
    );
    button.type = "button";
    button.hidden = true;
    const errorEl = el("p", "youtube-groups__shortcuts-error");
    errorEl.setAttribute("role", "alert");
    errorEl.hidden = true;
    container.replaceChildren(
      el("h3", "youtube-groups__shortcuts-title", "Atajos de teclado"),
      el(
        "p",
        "youtube-groups__shortcuts-hint",
        "Funcionan en cualquier pestaña de Firefox. «Limpiar la selección» " +
          "actúa en la pestaña de YouTube activa.",
      ),
      list,
      button,
      el(
        "p",
        "youtube-groups__shortcuts-hint",
        "Se cambian en about:addons → ⚙ → Gestionar atajos de teclado de " +
          "extensiones.",
      ),
      errorEl,
    );

    let requestCounter = 0;

    /**
     * Muestra u oculta el error del subapartado.
     * @param {string} message - Texto; vacío lo oculta.
     * @returns {void}
     */
    function setError(message) {
      errorEl.textContent = message;
      errorEl.hidden = !message;
    }

    button.addEventListener("click", async () => {
      setError("");
      button.disabled = true;
      try {
        const response = await browser.runtime.sendMessage({
          type: "youtube-groups:open-shortcut-settings",
        });
        if (response?.opened !== true) {
          setError(
            "No se pudo abrir la configuración de atajos. Usa la ruta de " +
              "about:addons.",
          );
        }
      } catch (error) {
        console.error(
          "[ChannelTree] No se pudo abrir la configuración de atajos",
          error,
        );
        setError(
          "No se pudo abrir la configuración de atajos. Usa la ruta de " +
            "about:addons.",
        );
      } finally {
        button.disabled = false;
      }
    });

    /**
     * Pide al fondo los comandos y pinta cada uno con su atajo. Una respuesta
     * de una petición anterior a otra más reciente se descarta.
     * @returns {Promise<void>}
     */
    async function load() {
      requestCounter += 1;
      const request = requestCounter;
      try {
        const response = await browser.runtime.sendMessage({
          type: "youtube-groups:get-shortcuts",
        });
        if (!response || !Array.isArray(response.commands)) {
          throw new Error("el fondo no respondió");
        }
        if (request !== requestCounter) {
          return;
        }
        list.replaceChildren(
          ...response.commands.map((command) => {
            const item = document.createElement("li");
            const shortcut = document.createElement("kbd");
            shortcut.textContent = command.shortcut || "Sin asignar";
            item.append(
              el(
                "span",
                "youtube-groups__shortcut-name",
                command.description || "",
              ),
              " ",
              shortcut,
            );
            return item;
          }),
        );
        button.hidden = response.canOpenSettings !== true;
        setError("");
      } catch (error) {
        if (request !== requestCounter) {
          return;
        }
        console.error("[ChannelTree] No se pudieron leer los atajos", error);
        list.replaceChildren();
        button.hidden = true;
        setError("No se pudieron leer los atajos: " + error.message);
      }
    }

    return Object.freeze({ load });
  }

  return Object.freeze({ create });
})();
