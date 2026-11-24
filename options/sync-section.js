// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

/**
 * Sección "Sincronización" de la página de opciones (ADR 0028): activa o
 * desactiva la réplica de grupos, ajustes y canales ocultos en `storage.sync`.
 * No escribe en el almacenamiento: habla con `background.js` por
 * `runtime.sendMessage`. No usa innerHTML con datos.
 */
const YouTubeGroupsSyncSection = (() => {
  const MESSAGE_TYPE = "youtube-groups:sync";
  const UPDATED_NOTICE = "Grupos y ajustes actualizados desde otro dispositivo";
  const UNAVAILABLE = "La sincronización no está disponible en este navegador.";

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
   * Da formato a un tamaño en KB con un decimal.
   * @param {number} bytes - Tamaño en bytes.
   * @returns {string} Por ejemplo "95,0".
   */
  function formatKb(bytes) {
    return (bytes / 1024).toLocaleString("es", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  }

  /**
   * Da formato a una marca de tiempo.
   * @param {number} ms - Milisegundos desde la época.
   * @returns {string} Fecha y hora locales.
   */
  function formatDate(ms) {
    return new Date(ms).toLocaleString("es");
  }

  /**
   * Crea la sección dentro de un contenedor.
   * @param {HTMLElement} container - Sección donde se pinta.
   * @param {Object} options - Opciones.
   * @param {function(string): void} options.showNotice - Muestra el aviso del
   *   editor (sin "Deshacer").
   * @returns {{load: function(): Promise<void>,
   *   applyStoredValue: function(*): void}} Componente.
   */
  function create(container, { showNotice }) {
    const title = el(
      "h2",
      "options__channels-title",
      "Sincronización entre dispositivos",
    );
    title.id = "options-sync-title";
    const intro = el(
      "p",
      "options__channels-summary",
      "Sincroniza los grupos (con sus palabras clave), los ajustes y los " +
        "canales ocultos con tu cuenta de Firefox. Requiere iniciar sesión " +
        "en Firefox con la sincronización de complementos activada. Los " +
        "vídeos vistos y las listas no se sincronizan. Si cambias lo mismo " +
        "en dos dispositivos antes de que se sincronicen, gana el último " +
        "cambio: haz una copia de seguridad antes de activarla.",
    );
    const label = el("label", "options__cleanup-option");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.id = "options-sync-enabled";
    box.disabled = true;
    label.append(box, el("span", "", "Sincronizar en este dispositivo"));
    const statusEl = el("p", "options__section-status");
    statusEl.setAttribute("role", "status");
    const errorEl = el("p", "options__error");
    errorEl.setAttribute("role", "alert");
    errorEl.hidden = true;
    const choiceEl = el("div", "options__sync-choice");
    choiceEl.hidden = true;
    container.replaceChildren(title, intro, label, statusEl, errorEl, choiceEl);

    /** Estado local mostrado (`readSyncValue`). */
    let current = YouTubeGroupsStorage.readSyncValue(undefined);
    let localBytes = null;
    let limitBytes = null;
    /** `true` cuando `status` ha dicho que hay `storage.sync`. */
    let available = false;
    /** Hay una petición en curso. */
    let pending = false;
    /** Última recepción pintada, para avisar solo cuando aumenta. */
    let lastReceived = null;

    /**
     * Muestra u oculta el error de la sección.
     * @param {string} message - Texto; vacío lo oculta.
     * @returns {void}
     */
    function setError(message) {
      errorEl.textContent = message;
      errorEl.hidden = !message;
    }

    /**
     * Compone la línea de estado del estado local.
     * @returns {string} Texto de estado.
     */
    function describe() {
      let text;
      if (current.status === "ok") {
        const parts = ["Activada."];
        if (current.lastSentAt !== null) {
          parts.push(`Último envío: ${formatDate(current.lastSentAt)}.`);
        }
        if (current.lastReceivedAt !== null) {
          parts.push(
            `Última recepción: ${formatDate(current.lastReceivedAt)}.`,
          );
        }
        text = parts.join(" ");
      } else if (current.status === "too-big") {
        text =
          current.bytes !== null && limitBytes !== null
            ? `Desactivada: los datos ocupan ${formatKb(current.bytes)} KB y el límite es ${formatKb(limitBytes)} KB.`
            : "Desactivada: los datos no caben en la cuota de Firefox.";
      } else if (current.status === "error") {
        text = `Error al sincronizar: ${current.error}`;
      } else {
        text = "Desactivada.";
      }
      if (localBytes !== null && limitBytes !== null) {
        text += ` Ocupan ${formatKb(localBytes)} KB de ${formatKb(limitBytes)} KB.`;
      }
      return text;
    }

    /**
     * Repinta casilla y estado con lo último leído.
     * @returns {void}
     */
    function render() {
      if (!available) {
        statusEl.textContent = UNAVAILABLE;
        box.checked = false;
        box.disabled = true;
        return;
      }
      statusEl.textContent = describe();
      box.checked = current.enabled;
      box.disabled = pending;
    }

    /**
     * Envía un mensaje al fondo.
     * @param {string} action - `status`, `enable` o `disable`.
     * @param {Object} [extra] - Campos adicionales.
     * @returns {Promise<*>} Respuesta, o `undefined` si falla.
     */
    async function send(action, extra) {
      try {
        return await browser.runtime.sendMessage({
          type: MESSAGE_TYPE,
          action,
          ...extra,
        });
      } catch (error) {
        console.error("[ChannelTree] No se pudo hablar con el fondo", error);
        return undefined;
      }
    }

    /**
     * Cierra el bloque de elección de dirección.
     * @returns {void}
     */
    function closeChoice() {
      choiceEl.replaceChildren();
      choiceEl.hidden = true;
    }

    /**
     * Ejecuta una petición con la casilla deshabilitada.
     * @param {function(): Promise<void>} action - Petición.
     * @returns {Promise<void>}
     */
    async function run(action) {
      if (pending) {
        return;
      }
      pending = true;
      box.disabled = true;
      setError("");
      closeChoice();
      try {
        await action();
      } finally {
        pending = false;
        render();
      }
    }

    /**
     * Pide activar (con o sin dirección) y refleja el resultado.
     * @param {"push"|"pull"} [direction] - Qué conservar.
     * @returns {Promise<void>}
     */
    async function enable(direction) {
      const response = await send("enable", direction ? { direction } : {});
      const result = response && response.result;
      if (result === "enabled") {
        current = { ...current, enabled: true, status: "ok", error: "" };
        showNotice("Sincronización activada");
      } else if (result === "choose") {
        showChoice(response.remoteUpdatedAt);
      } else if (result === "too-big") {
        setError(
          `No se ha activado: los datos ocupan ${formatKb(response.bytes)} KB ` +
            `y el límite es ${formatKb(response.limitBytes)} KB.`,
        );
      } else if (result === "unavailable") {
        available = false;
      } else {
        setError(
          "No se pudo activar la sincronización" +
            (response && response.message ? `: ${response.message}` : "."),
        );
        // La sincronización puede haber quedado activa con error: se pinta el estado real.
        await load();
      }
    }

    /**
     * Muestra la elección entre traer lo sincronizado o enviar lo local.
     * @param {number} remoteUpdatedAt - Fecha de lo sincronizado.
     * @returns {void}
     */
    function showChoice(remoteUpdatedAt) {
      const makeButton = (text, onClick) => {
        const button = el("button", "options__action", text);
        button.type = "button";
        button.addEventListener("click", onClick);
        return button;
      };
      choiceEl.replaceChildren(
        el(
          "p",
          "options__channels-summary",
          "Ya hay datos sincronizados de otro dispositivo " +
            `(${Number.isFinite(remoteUpdatedAt) ? formatDate(remoteUpdatedAt) : "fecha desconocida"}). ` +
            "¿Cuáles quieres conservar?",
        ),
        makeButton("Traer los sincronizados", () => run(() => enable("pull"))),
        makeButton("Enviar los de este dispositivo", () =>
          run(() => enable("push")),
        ),
        makeButton("Cancelar", closeChoice),
      );
      choiceEl.hidden = false;
    }

    /**
     * Pide desactivar y refleja el resultado.
     * @returns {Promise<void>}
     */
    async function disable() {
      const response = await send("disable");
      if (response && response.result === "disabled") {
        current = { ...current, enabled: false, status: "off", error: "" };
        showNotice("Sincronización desactivada");
      } else {
        setError("No se pudo desactivar la sincronización.");
      }
    }

    box.addEventListener("change", () => {
      run(box.checked ? () => enable() : disable);
    });

    /**
     * Pide el estado al fondo, lo pinta y habilita la casilla.
     * @returns {Promise<void>}
     */
    async function load() {
      const response = await send("status");
      if (!response || response.available === false) {
        available = false;
      } else {
        available = true;
        current = YouTubeGroupsStorage.readSyncValue(response.state);
        localBytes = Number.isFinite(response.localBytes)
          ? response.localBytes
          : null;
        limitBytes = Number.isFinite(response.limitBytes)
          ? response.limitBytes
          : null;
        lastReceived = current.lastReceivedAt;
      }
      render();
    }

    /**
     * Aplica un valor de `youtubeSync` llegado de `storage.onChanged`.
     * @param {*} raw - Valor nuevo (sin normalizar).
     * @returns {void}
     */
    function applyStoredValue(raw) {
      if (!available) {
        return;
      }
      current = YouTubeGroupsStorage.readSyncValue(raw);
      render();
      const received = current.lastReceivedAt;
      if (
        received !== null &&
        (lastReceived === null || received > lastReceived)
      ) {
        showNotice(UPDATED_NOTICE);
      }
      if (received !== null) {
        lastReceived = received;
      }
    }

    return { load, applyStoredValue };
  }

  return Object.freeze({ create });
})();
