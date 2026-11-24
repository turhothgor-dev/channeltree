// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

/**
 * Script de fondo: abre la página de opciones (editor de grupos) cuando un
 * script de contenido lo pide o con el atajo `open-editor`, y vacía la
 * selección de la pestaña activa con el atajo `clear-selection`. También
 * atiende los mensajes `youtube-groups:get-shortcuts` y
 * `youtube-groups:open-shortcut-settings` (ADR 0033).
 */

/**
 * Abre la página de opciones (editor de grupos).
 * @returns {Promise<void>}
 */
function openEditor() {
  return browser.runtime.openOptionsPage();
}

/**
 * Pide al script de contenido de la pestaña activa que vacíe su selección.
 * Fuera de YouTube no hay receptor: ese rechazo se ignora aquí a propósito.
 * Si falla la consulta de pestañas, la función rechaza y quien la llama
 * (`commands.onCommand`) lo ignora.
 * @returns {Promise<void>}
 */
async function clearSelectionInActiveTab() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const id = tabs?.[0]?.id;
  if (typeof id !== "number") {
    return;
  }
  await browser.tabs
    .sendMessage(id, { type: "youtube-groups:clear-selection" })
    .catch(() => {});
}

/**
 * Lista los comandos de la extensión con su atajo actual. Los scripts de
 * contenido no tienen `browser.commands`, por eso lo atiende el fondo (ADR 0033).
 * @returns {Promise<{ commands: { name: string, description: string,
 *   shortcut: string }[], canOpenSettings: boolean }>}
 */
async function getShortcuts() {
  const all = await browser.commands.getAll();
  return {
    commands: all.map((command) => ({
      name: String(command.name ?? ""),
      description: String(command.description ?? ""),
      shortcut: String(command.shortcut ?? ""),
    })),
    canOpenSettings:
      typeof browser.commands.openShortcutSettings === "function",
  };
}

/**
 * Abre la configuración de atajos de Firefox si la versión lo permite.
 * Nunca rechaza: si no se pudo, devuelve `{ opened: false }`.
 * @returns {Promise<{ opened: boolean }>}
 */
async function openShortcutSettings() {
  if (typeof browser.commands.openShortcutSettings !== "function") {
    return { opened: false };
  }
  try {
    await browser.commands.openShortcutSettings();
    return { opened: true };
  } catch (error) {
    console.error(
      "[ChannelTree] No se pudo abrir la configuración de atajos",
      error,
    );
    return { opened: false };
  }
}

/**
 * Borra la clave del modo de prueba de vídeos nuevos (6-27, retirado) que haya
 * quedado guardada. Si falla no pasa nada: se reintenta en el siguiente arranque.
 * @returns {Promise<void>}
 */
async function removeLegacyDebugKey() {
  try {
    await browser.storage.local.remove("youtubeDebug");
  } catch {
    // Sin efecto: solo es limpieza de una clave que ya nadie lee.
  }
}

removeLegacyDebugKey();

const replicator = YouTubeGroupsSync.createReplicator();

// El fondo de MV3 es una página de eventos: el escuchador va en el nivel superior.
browser.storage.onChanged.addListener(replicator.onStorageChanged);

replicator.reconcile().catch((error) => {
  console.error("[ChannelTree] No se pudo conciliar la sincronización", error);
});

browser.runtime.onMessage.addListener((message) => {
  if (message?.type === "youtube-groups:open-editor") {
    return openEditor();
  }
  if (message?.type === "youtube-groups:sync") {
    return replicator.handleMessage(message);
  }
  if (message?.type === "youtube-groups:get-shortcuts") {
    return getShortcuts();
  }
  if (message?.type === "youtube-groups:open-shortcut-settings") {
    return openShortcutSettings();
  }
  return undefined;
});

browser.commands.onCommand.addListener((command) => {
  if (command === "open-editor") {
    openEditor().catch((error) => {
      console.error(
        "[ChannelTree] No se pudo abrir el editor de grupos",
        error,
      );
    });
  } else if (command === "clear-selection") {
    // Fuera de YouTube, o si falla la consulta de pestañas, no hay nada que hacer.
    clearSelectionInActiveTab().catch(() => {});
  }
});
