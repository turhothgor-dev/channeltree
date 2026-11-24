// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

const YouTubeGroupsUndo = (() => {
  /**
   * Decide qué hacer al deshacer comparando el valor actual con la instantánea.
   * No muta `current` ni `undo`.
   * @param {*} current - Valor guardado ahora bajo la clave.
   * @param {{before: *, after: *}} undo - Instantánea de la operación.
   * @returns {{value: *, status: "restored"|"already"|"changed"}} Con
   *   `restored`, `value` es una copia de `before`; en otro caso, `current`.
   */
  function revertSnapshot(current, undo) {
    const now = JSON.stringify(current);
    if (now === JSON.stringify(undo.after)) {
      return { value: structuredClone(undo.before), status: "restored" };
    }
    if (now === JSON.stringify(undo.before)) {
      return { value: current, status: "already" };
    }
    return { value: current, status: "changed" };
  }

  /**
   * Lee, decide y guarda dentro del bloqueo de la clave.
   * @param {{key: string, read: Function, save: Function}} target - Clave,
   *   lectura y escritura del valor.
   * @param {{before: *, after: *}} undo - Instantánea de la operación.
   * @returns {Promise<{status: string}>} Estado del deshacer.
   */
  async function revertAndSave({ key, read, save }, undo) {
    return YouTubeGroupsStorage.withLock(key, async () => {
      const current = await read();
      const result = revertSnapshot(current, undo);
      if (result.status === "restored") {
        await save(result.value);
      }
      return { status: result.status };
    });
  }

  /**
   * Texto para mostrar tras deshacer.
   * @param {string} status - "restored", "already" o "changed".
   * @param {string} subject - Qué datos son ("los grupos", "las listas").
   * @returns {string} Mensaje para el usuario.
   */
  function describeStatus(status, subject) {
    if (status === "restored") {
      return "Deshecho";
    }
    if (status === "already") {
      return "Ya estaba deshecho";
    }
    return "No se puede deshacer: " + subject + " han cambiado desde entonces";
  }

  return { revertSnapshot, revertAndSave, describeStatus };
})();
