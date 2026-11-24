// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

const YouTubeGroupsEditor = (() => {
  /**
   * Lista de hijos de un grupo (vacía si no tiene).
   * @param {Object} group - Grupo o subgrupo.
   * @returns {Array<Object>} Sus subgrupos.
   */
  function childrenOf(group) {
    return Array.isArray(group.subgroups) ? group.subgroups : [];
  }

  /**
   * Busca un grupo y su lugar en el árbol.
   * @param {Array<Object>} groups - Árbol de grupos.
   * @param {string} id - Id del grupo.
   * @returns {{group: Object, parentId: string|null, list: Array<Object>, index: number}|null}
   */
  function locate(groups, id) {
    const visit = (list, parentId) => {
      for (let index = 0; index < list.length; index++) {
        const group = list[index];
        if (group.id === id) {
          return { group, parentId, list, index };
        }
        const found = visit(childrenOf(group), group.id);
        if (found) {
          return found;
        }
      }
      return null;
    };
    return visit(groups, null);
  }

  /**
   * Indica si `id` es el propio grupo o uno de sus descendientes.
   * @param {Object} group - Grupo raíz del subárbol.
   * @param {string} id - Id a buscar.
   * @returns {boolean} true si está en el subárbol.
   */
  function subtreeContains(group, id) {
    if (group.id === id) {
      return true;
    }
    return childrenOf(group).some((child) => subtreeContains(child, id));
  }

  /**
   * Lugar actual de un grupo entre sus hermanos.
   * @param {Array<Object>} groups - Árbol de grupos.
   * @param {string} id - Id del grupo.
   * @returns {{parentId: string|null, index: number, siblingCount: number}|null}
   *   `null` si el grupo no existe.
   */
  function findGroupLocation(groups, id) {
    const found = locate(groups, id);
    if (!found) {
      return null;
    }
    return {
      parentId: found.parentId,
      index: found.index,
      siblingCount: found.list.length,
    };
  }

  /**
   * Mueve un grupo a otro lugar sin mutar la entrada.
   * @param {Array<Object>} groups - Árbol de grupos.
   * @param {string} groupId - Id del grupo a mover.
   * @param {string|null} parentId - Nuevo padre (`null` para el primer nivel).
   * @param {number} index - Posición en la lista de destino sin el grupo movido;
   *   se acota a `[0, longitud]`.
   * @returns {{groups: Array<Object>, changed: boolean}} Árbol resultante y si
   *   el grupo cambió de lugar.
   * @throws {Error} Si el grupo o el padre no existen, o si el padre es el
   *   propio grupo o un descendiente.
   */
  function moveGroup(groups, groupId, parentId, index) {
    const source = locate(groups, groupId);
    if (!source) {
      throw new Error("No existe el grupo indicado.");
    }

    const targetParentId = parentId ?? null;
    if (targetParentId !== null) {
      const parent = locate(groups, targetParentId);
      if (!parent) {
        throw new Error("No existe el grupo padre indicado.");
      }
      if (subtreeContains(source.group, targetParentId)) {
        throw new Error("No se puede mover un grupo dentro de sí mismo.");
      }
    }

    const result = structuredClone(groups);
    const moving = locate(result, groupId);
    moving.list.splice(moving.index, 1);

    let targetList = result;
    if (targetParentId !== null) {
      const parent = locate(result, targetParentId).group;
      if (!Array.isArray(parent.subgroups)) {
        parent.subgroups = [];
      }
      targetList = parent.subgroups;
    }

    const wanted = Number.isFinite(index)
      ? Math.trunc(index)
      : targetList.length;
    const clamped = Math.min(Math.max(wanted, 0), targetList.length);

    if (source.parentId === targetParentId && source.index === clamped) {
      return { groups: structuredClone(groups), changed: false };
    }

    const moved = moving.group;
    if (targetParentId === null) {
      moved.type = "group";
      delete moved.parentId;
    } else {
      moved.type = "subgroup";
      moved.parentId = targetParentId;
    }
    targetList.splice(clamped, 0, moved);

    return { groups: result, changed: true };
  }

  /**
   * Lugar para subir o bajar un grupo entre sus hermanos.
   * @param {Array<Object>} groups - Árbol de grupos.
   * @param {string} groupId - Id del grupo.
   * @param {number} delta - `-1` para subir, `1` para bajar.
   * @returns {{parentId: string|null, index: number}|null} `null` en los
   *   extremos o si el grupo no existe.
   */
  function getSiblingMove(groups, groupId, delta) {
    const location = findGroupLocation(groups, groupId);
    if (!location) {
      return null;
    }
    const index = location.index + delta;
    if (index < 0 || index >= location.siblingCount) {
      return null;
    }
    return { parentId: location.parentId, index };
  }

  /**
   * Destinos posibles para "Mover a…": primer nivel y el árbol en preorden
   * sin el grupo ni sus descendientes.
   * @param {Array<Object>} groups - Árbol de grupos.
   * @param {string} groupId - Id del grupo a mover.
   * @returns {Array<{id: string|null, name: string, level: number, current: boolean}>}
   *   `current` marca el padre actual.
   */
  function getMoveTargets(groups, groupId) {
    const source = locate(groups, groupId);
    if (!source) {
      return [];
    }

    const targets = [
      {
        id: null,
        name: "Primer nivel",
        level: 0,
        current: source.parentId === null,
      },
    ];
    const visit = (list, level) => {
      for (const group of list) {
        if (group.id === groupId) {
          continue;
        }
        targets.push({
          id: group.id,
          name: group.name,
          level,
          current: source.parentId === group.id,
        });
        visit(childrenOf(group), level + 1);
      }
    };
    visit(groups, 1);
    return targets;
  }

  /**
   * Lugar resultante de soltar un grupo arrastrado sobre otro.
   * @param {Array<Object>} groups - Árbol de grupos.
   * @param {string} draggedId - Id del grupo arrastrado.
   * @param {string} targetId - Id del grupo sobre el que se suelta.
   * @param {"before"|"after"|"inside"} zone - Zona de la suelta; `"inside"` lo
   *   deja como último hijo del destino.
   * @returns {{parentId: string|null, index: number}|null} `null` si el destino
   *   es el propio grupo o un descendiente, o alguno no existe.
   */
  function getDropPosition(groups, draggedId, targetId, zone) {
    const dragged = locate(groups, draggedId);
    const target = locate(groups, targetId);
    if (!dragged || !target || subtreeContains(dragged.group, targetId)) {
      return null;
    }

    const draggedInTargetList = (list) => list === dragged.list;

    if (zone === "inside") {
      const children = childrenOf(target.group);
      const count = children.some((child) => child.id === draggedId)
        ? children.length - 1
        : children.length;
      return { parentId: targetId, index: count };
    }

    if (zone !== "before" && zone !== "after") {
      return null;
    }

    let index = target.index;
    if (draggedInTargetList(target.list) && dragged.index < target.index) {
      index -= 1;
    }
    if (zone === "after") {
      index += 1;
    }
    return { parentId: target.parentId, index };
  }

  /**
   * Mueve un grupo y guarda: una lectura y, si cambia de lugar, una escritura.
   * @param {string} groupId - Id del grupo a mover.
   * @param {string|null} parentId - Nuevo padre (`null` para el primer nivel).
   * @param {number} index - Posición en la lista de destino sin el grupo.
   * @returns {Promise<{changed: boolean}>} Si hubo cambio.
   */
  async function moveGroupAndSave(groupId, parentId, index) {
    return YouTubeGroupsStorage.withLock(
      YouTubeGroupsStorage.KEYS.groups,
      async () => {
        const groups = await YouTubeGroupsStorage.getGroups();
        const result = moveGroup(groups, groupId, parentId, index);
        if (result.changed) {
          await YouTubeGroupsStorage.saveGroups(result.groups);
        }
        return { changed: result.changed };
      },
    );
  }

  /**
   * Cuenta los subgrupos y los canales distintos de un subárbol.
   * @param {Array<Object>} groups - Árbol de grupos.
   * @param {string} id - Id del grupo raíz del subárbol.
   * @returns {{subgroups: number, channels: number}|null} `subgroups` son los
   *   descendientes (sin el propio grupo) y `channels` los canales distintos
   *   de todo el subárbol; `null` si el grupo no existe.
   */
  function summarizeSubtree(groups, id) {
    const found = locate(groups, id);
    if (!found) {
      return null;
    }
    const keys = new Set();
    let subgroups = 0;
    const visit = (group, isRoot) => {
      if (!isRoot) {
        subgroups += 1;
      }
      for (const channel of Array.isArray(group.channels)
        ? group.channels
        : []) {
        keys.add(YouTubeGroups.getChannelKey(channel.url));
      }
      for (const child of childrenOf(group)) {
        visit(child, false);
      }
    };
    visit(found.group, true);
    return { subgroups, channels: keys.size };
  }

  /**
   * Recoge los ids de un subárbol.
   * @param {Object} group - Raíz del subárbol.
   * @returns {Array<string>} Ids en preorden.
   */
  function collectIds(group) {
    return [group.id, ...childrenOf(group).flatMap(collectIds)];
  }

  /**
   * Quita un grupo con todo su subárbol y devuelve una instantánea para
   * restaurarlo, sin mutar la entrada.
   * @param {Array<Object>} groups - Árbol de grupos.
   * @param {string} id - Id del grupo a borrar.
   * @returns {{groups: Array<Object>, removedIds: Array<string>,
   *   snapshot: {group: Object, parentId: string|null, index: number}}}
   * @throws {Error} Si el grupo no existe.
   */
  function removeGroupWithSnapshot(groups, id) {
    const found = locate(groups, id);
    if (!found) {
      throw new Error("No existe el grupo indicado.");
    }
    const snapshot = {
      group: structuredClone(found.group),
      parentId: found.parentId,
      index: found.index,
    };
    const result = structuredClone(groups);
    const target = locate(result, id);
    target.list.splice(target.index, 1);
    return { groups: result, removedIds: collectIds(found.group), snapshot };
  }

  /**
   * Devuelve a su sitio un subárbol borrado, sin mutar la entrada.
   * @param {Array<Object>} groups - Árbol de grupos actual.
   * @param {{group: Object, parentId: string|null, index: number}} snapshot -
   *   Instantánea de `removeGroupWithSnapshot`.
   * @returns {{groups: Array<Object>, restored: boolean, atRoot: boolean}}
   *   `restored` es `false` si algún id ya existe; `atRoot` es `true` si el
   *   padre ya no existe y se añade al final del primer nivel.
   */
  function restoreGroup(groups, snapshot) {
    const restoredGroup = structuredClone(snapshot.group);
    if (collectIds(restoredGroup).some((id) => locate(groups, id))) {
      return {
        groups: structuredClone(groups),
        restored: false,
        atRoot: false,
      };
    }

    const result = structuredClone(groups);
    const parent =
      snapshot.parentId === null ? null : locate(result, snapshot.parentId);

    if (snapshot.parentId !== null && parent) {
      if (!Array.isArray(parent.group.subgroups)) {
        parent.group.subgroups = [];
      }
      const list = parent.group.subgroups;
      restoredGroup.type = "subgroup";
      restoredGroup.parentId = snapshot.parentId;
      list.splice(
        Math.min(Math.max(snapshot.index, 0), list.length),
        0,
        restoredGroup,
      );
      return { groups: result, restored: true, atRoot: false };
    }

    restoredGroup.type = "group";
    delete restoredGroup.parentId;
    if (snapshot.parentId === null) {
      result.splice(
        Math.min(Math.max(snapshot.index, 0), result.length),
        0,
        restoredGroup,
      );
      return { groups: result, restored: true, atRoot: false };
    }
    result.push(restoredGroup);
    return { groups: result, restored: true, atRoot: true };
  }

  /**
   * Borra un grupo y guarda: una lectura y una escritura.
   * @param {string} id - Id del grupo a borrar.
   * @returns {Promise<{removedIds: Array<string>, snapshot: Object,
   *   summary: {subgroups: number, channels: number}}>}
   * @throws {Error} Si el grupo no existe (no escribe).
   */
  async function deleteGroupAndSnapshot(id) {
    return YouTubeGroupsStorage.withLock(
      YouTubeGroupsStorage.KEYS.groups,
      async () => {
        const groups = await YouTubeGroupsStorage.getGroups();
        const summary = summarizeSubtree(groups, id);
        const result = removeGroupWithSnapshot(groups, id);
        await YouTubeGroupsStorage.saveGroups(result.groups);
        return {
          removedIds: result.removedIds,
          snapshot: result.snapshot,
          summary,
        };
      },
    );
  }

  /**
   * Restaura un grupo borrado y guarda; no escribe si ya estaba restaurado.
   * @param {{group: Object, parentId: string|null, index: number}} snapshot -
   *   Instantánea de `deleteGroupAndSnapshot`.
   * @returns {Promise<{restored: boolean, atRoot: boolean}>}
   */
  async function restoreGroupAndSave(snapshot) {
    return YouTubeGroupsStorage.withLock(
      YouTubeGroupsStorage.KEYS.groups,
      async () => {
        const groups = await YouTubeGroupsStorage.getGroups();
        const result = restoreGroup(groups, snapshot);
        if (result.restored) {
          await YouTubeGroupsStorage.saveGroups(result.groups);
        }
        return { restored: result.restored, atRoot: result.atRoot };
      },
    );
  }

  /**
   * Lista de canales de un grupo (vacía si no tiene).
   * @param {Object} group - Grupo o subgrupo.
   * @returns {Array<Object>} Sus canales.
   */
  function channelsOf(group) {
    return Array.isArray(group.channels) ? group.channels : [];
  }

  /**
   * Quita canales de un grupo sin mutar la entrada.
   * @param {Array<Object>} groups - Árbol de grupos.
   * @param {string} groupId - Id del grupo.
   * @param {Array<string>} urls - URL tal como están guardadas.
   * @returns {{groups: Array<Object>, removed: Array<{channel: Object,
   *   index: number}>}} Árbol resultante y los quitados con su posición
   *   original; las URL que no están se ignoran.
   * @throws {Error} Si el grupo no existe.
   */
  function removeChannels(groups, groupId, urls) {
    if (!locate(groups, groupId)) {
      throw new Error("No existe el grupo indicado.");
    }
    const wanted = new Set(urls);
    const result = structuredClone(groups);
    const target = locate(result, groupId).group;
    const removed = [];
    const kept = [];
    channelsOf(target).forEach((channel, index) => {
      if (wanted.has(channel.url)) {
        removed.push({ channel: structuredClone(channel), index });
      } else {
        kept.push(channel);
      }
    });
    target.channels = kept;
    return { groups: result, removed };
  }

  /**
   * Devuelve a su posición canales quitados, sin mutar la entrada.
   * @param {Array<Object>} groups - Árbol de grupos actual.
   * @param {string} groupId - Id del grupo.
   * @param {Array<{channel: Object, index: number}>} removed - Resultado de
   *   `removeChannels`.
   * @returns {{groups: Array<Object>, restored: number}} Cuántos se
   *   reinsertaron; los que ya están (por clave) no se repiten y, si el grupo
   *   ya no existe, `restored` es 0.
   */
  function restoreChannels(groups, groupId, removed) {
    const result = structuredClone(groups);
    const found = locate(result, groupId);
    if (!found) {
      return { groups: result, restored: 0 };
    }
    const target = found.group;
    if (!Array.isArray(target.channels)) {
      target.channels = [];
    }
    const keys = new Set(
      target.channels.map((channel) =>
        YouTubeGroups.getChannelKey(channel.url),
      ),
    );
    let restored = 0;
    const ordered = [...removed].sort((a, b) => a.index - b.index);
    for (const item of ordered) {
      const key = YouTubeGroups.getChannelKey(item.channel.url);
      if (keys.has(key)) {
        continue;
      }
      keys.add(key);
      const at = Math.min(Math.max(item.index, 0), target.channels.length);
      target.channels.splice(at, 0, structuredClone(item.channel));
      restored += 1;
    }
    return { groups: result, restored };
  }

  /**
   * Copia o mueve canales de un grupo a otro sin mutar la entrada.
   * @param {Array<Object>} groups - Árbol de grupos.
   * @param {string} fromId - Id del grupo de origen.
   * @param {Array<string>} urls - URL tal como están guardadas en el origen.
   * @param {string} toId - Id del grupo de destino.
   * @param {"copy"|"move"} mode - Copiar o mover.
   * @returns {{groups: Array<Object>, added: number, skipped: number}}
   *   `skipped` cuenta los que ya estaban en el destino; con `"move"` se
   *   quitan del origen en todo caso.
   * @throws {Error} Si algún grupo no existe o origen y destino coinciden.
   */
  function transferChannels(groups, fromId, urls, toId, mode) {
    if (fromId === toId) {
      throw new Error("El origen y el destino son el mismo grupo.");
    }
    if (!locate(groups, fromId) || !locate(groups, toId)) {
      throw new Error("No existe el grupo indicado.");
    }
    const wanted = new Set(urls);
    const result = structuredClone(groups);
    const from = locate(result, fromId).group;
    const to = locate(result, toId).group;
    if (!Array.isArray(to.channels)) {
      to.channels = [];
    }
    const keys = new Set(
      to.channels.map((channel) => YouTubeGroups.getChannelKey(channel.url)),
    );
    let added = 0;
    let skipped = 0;
    for (const channel of channelsOf(from)) {
      if (!wanted.has(channel.url)) {
        continue;
      }
      const key = YouTubeGroups.getChannelKey(channel.url);
      if (keys.has(key)) {
        skipped += 1;
        continue;
      }
      keys.add(key);
      to.channels.push(structuredClone(channel));
      added += 1;
    }
    if (mode === "move") {
      from.channels = channelsOf(from).filter(
        (channel) => !wanted.has(channel.url),
      );
    }
    return { groups: result, added, skipped };
  }

  /**
   * Añade canales al final de un grupo sin mutar la entrada.
   * @param {Array<Object>} groups - Árbol de grupos.
   * @param {string} toId - Id del grupo de destino.
   * @param {Array<{name: string, url: string}>} channels - Canales con `url`
   *   normalizada.
   * @returns {{groups: Array<Object>, added: number, skipped: number}}
   *   `skipped` cuenta los que ya estaban (por `getChannelKey`).
   * @throws {Error} Si el grupo no existe.
   */
  function addChannels(groups, toId, channels) {
    if (!locate(groups, toId)) {
      throw new Error("No existe el grupo indicado.");
    }
    const result = structuredClone(groups);
    const to = locate(result, toId).group;
    if (!Array.isArray(to.channels)) {
      to.channels = [];
    }
    const keys = new Set(
      to.channels.map((channel) => YouTubeGroups.getChannelKey(channel.url)),
    );
    let added = 0;
    let skipped = 0;
    for (const channel of channels) {
      const key = YouTubeGroups.getChannelKey(channel.url);
      if (keys.has(key)) {
        skipped += 1;
        continue;
      }
      keys.add(key);
      to.channels.push({ name: channel.name, url: channel.url });
      added += 1;
    }
    return { groups: result, added, skipped };
  }

  /**
   * Añade canales a varios grupos sin mutar la entrada.
   * @param {Array<Object>} groups - Árbol de grupos.
   * @param {Array<{groupId: string, channel: {name: string, url: string}}>}
   *   assignments - Un canal por grupo de destino.
   * @returns {{groups: Array<Object>, added: number, skipped: number,
   *   missing: number}} `skipped` cuenta los que ya estaban (por
   *   `getChannelKey`) y `missing` los de grupos que no existen.
   */
  function addChannelsToGroups(groups, assignments) {
    const result = structuredClone(groups);
    let added = 0;
    let skipped = 0;
    let missing = 0;
    for (const { groupId, channel } of assignments) {
      const found = locate(result, groupId);
      if (!found) {
        missing += 1;
        continue;
      }
      const to = found.group;
      if (!Array.isArray(to.channels)) {
        to.channels = [];
      }
      const key = YouTubeGroups.getChannelKey(channel.url);
      if (
        to.channels.some(
          (item) => YouTubeGroups.getChannelKey(item.url) === key,
        )
      ) {
        skipped += 1;
        continue;
      }
      to.channels.push({ name: channel.name, url: channel.url });
      added += 1;
    }
    return { groups: result, added, skipped, missing };
  }

  /**
   * Añade canales a varios grupos y guarda una vez; no escribe si no añade
   * ninguno.
   * @param {Array<{groupId: string, channel: {name: string, url: string}}>}
   *   assignments - Un canal por grupo de destino.
   * @returns {Promise<{added: number, skipped: number, missing: number,
   *   undo: {before: Array<Object>, after: Array<Object>}|null}>}
   */
  async function addChannelsToGroupsAndSave(assignments) {
    return YouTubeGroupsStorage.withLock(
      YouTubeGroupsStorage.KEYS.groups,
      async () => {
        const groups = await YouTubeGroupsStorage.getGroups();
        const result = addChannelsToGroups(groups, assignments);
        if (result.added === 0) {
          return {
            added: 0,
            skipped: result.skipped,
            missing: result.missing,
            undo: null,
          };
        }
        await YouTubeGroupsStorage.saveGroups(result.groups);
        return {
          added: result.added,
          skipped: result.skipped,
          missing: result.missing,
          undo: { before: groups, after: result.groups },
        };
      },
    );
  }

  /**
   * Añade canales a un grupo y guarda; no escribe si no añade ninguno.
   * @param {string} toId - Id del grupo de destino.
   * @param {Array<{name: string, url: string}>} channels - Canales a añadir.
   * @returns {Promise<{added: number, skipped: number}>}
   * @throws {Error} Si el grupo no existe (no escribe).
   */
  async function addChannelsAndSave(toId, channels) {
    return YouTubeGroupsStorage.withLock(
      YouTubeGroupsStorage.KEYS.groups,
      async () => {
        const groups = await YouTubeGroupsStorage.getGroups();
        const result = addChannels(groups, toId, channels);
        if (result.added > 0) {
          await YouTubeGroupsStorage.saveGroups(result.groups);
        }
        return { added: result.added, skipped: result.skipped };
      },
    );
  }

  /**
   * Quita canales de un grupo y guarda; no escribe si no quita ninguno.
   * @param {string} groupId - Id del grupo.
   * @param {Array<string>} urls - URL tal como están guardadas.
   * @returns {Promise<{removed: Array<{channel: Object, index: number}>}>}
   * @throws {Error} Si el grupo no existe (no escribe).
   */
  async function removeChannelsAndSave(groupId, urls) {
    return YouTubeGroupsStorage.withLock(
      YouTubeGroupsStorage.KEYS.groups,
      async () => {
        const groups = await YouTubeGroupsStorage.getGroups();
        const result = removeChannels(groups, groupId, urls);
        if (result.removed.length > 0) {
          await YouTubeGroupsStorage.saveGroups(result.groups);
        }
        return { removed: result.removed };
      },
    );
  }

  /**
   * Restaura canales quitados y guarda; no escribe si no restaura ninguno.
   * @param {string} groupId - Id del grupo.
   * @param {Array<{channel: Object, index: number}>} removed - Quitados.
   * @returns {Promise<{restored: number}>}
   */
  async function restoreChannelsAndSave(groupId, removed) {
    return YouTubeGroupsStorage.withLock(
      YouTubeGroupsStorage.KEYS.groups,
      async () => {
        const groups = await YouTubeGroupsStorage.getGroups();
        const result = restoreChannels(groups, groupId, removed);
        if (result.restored > 0) {
          await YouTubeGroupsStorage.saveGroups(result.groups);
        }
        return { restored: result.restored };
      },
    );
  }

  /**
   * Copia o mueve canales y guarda; no escribe si no cambia nada.
   * @param {string} fromId - Id del grupo de origen.
   * @param {Array<string>} urls - URL tal como están guardadas en el origen.
   * @param {string} toId - Id del grupo de destino.
   * @param {"copy"|"move"} mode - Copiar o mover.
   * @returns {Promise<{added: number, skipped: number}>}
   * @throws {Error} Si algún grupo no existe o coinciden (no escribe).
   */
  async function transferChannelsAndSave(fromId, urls, toId, mode) {
    return YouTubeGroupsStorage.withLock(
      YouTubeGroupsStorage.KEYS.groups,
      async () => {
        const groups = await YouTubeGroupsStorage.getGroups();
        const result = transferChannels(groups, fromId, urls, toId, mode);
        if (JSON.stringify(result.groups) !== JSON.stringify(groups)) {
          await YouTubeGroupsStorage.saveGroups(result.groups);
        }
        return { added: result.added, skipped: result.skipped };
      },
    );
  }

  /**
   * Normaliza un texto para buscar: minúsculas, sin diacríticos, espacios
   * colapsados y recortado.
   * @param {string} text - Texto original.
   * @returns {string} Texto normalizado.
   */
  function normalizeSearchText(text) {
    return String(text ?? "")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Ruta de una URL de canal (`/@handle`, `/channel/…`); si no es una URL
   * válida, el texto tal cual.
   * @param {string} url - URL guardada del canal.
   * @returns {string} Ruta de la URL.
   */
  function channelPath(url) {
    try {
      return decodeURIComponent(new URL(url).pathname);
    } catch {
      return String(url ?? "");
    }
  }

  /**
   * Busca grupos y canales por nombre (y ruta de URL en los canales).
   * @param {Array<Object>} groups - Árbol de grupos.
   * @param {string} query - Consulta del usuario.
   * @returns {{groupIds: Array<string>, channelMatches: Object<string,
   *   Array<string>>, visibleIds: Array<string>}|null} `null` si la consulta
   *   normalizada está vacía. `visibleIds` incluye coincidencias y antecesores
   *   en preorden.
   */
  function searchGroups(groups, query) {
    const needle = normalizeSearchText(query);
    if (!needle) {
      return null;
    }
    const groupIds = [];
    const channelMatches = {};
    const visibleIds = [];

    // Devuelve true si el subárbol contiene alguna coincidencia.
    const visit = (list) => {
      let any = false;
      for (const group of list) {
        const slot = visibleIds.length;
        visibleIds.push(group.id);
        let hit = false;
        if (normalizeSearchText(group.name).includes(needle)) {
          groupIds.push(group.id);
          hit = true;
        }
        const urls = channelsOf(group)
          .filter(
            (channel) =>
              normalizeSearchText(channel.name).includes(needle) ||
              normalizeSearchText(channelPath(channel.url)).includes(needle),
          )
          .map((channel) => channel.url);
        if (urls.length > 0) {
          channelMatches[group.id] = urls;
          hit = true;
        }
        if (visit(childrenOf(group))) {
          hit = true;
        }
        if (hit) {
          any = true;
        } else {
          visibleIds.splice(slot, 1);
        }
      }
      return any;
    };
    visit(groups);
    return { groupIds, channelMatches, visibleIds };
  }

  const nameCollator = new Intl.Collator("es", {
    sensitivity: "base",
    numeric: true,
  });

  /**
   * Compara dos nombres sin distinguir mayúsculas ni acentos y con números
   * naturales ("Grupo 2" antes que "Grupo 10").
   * @param {string} a - Primer nombre.
   * @param {string} b - Segundo nombre.
   * @returns {number} Negativo, cero o positivo, como `Array.prototype.sort`.
   */
  function compareNames(a, b) {
    return nameCollator.compare(String(a ?? "").trim(), String(b ?? "").trim());
  }

  /**
   * Ordena de la A a la Z los subgrupos de un grupo (o los grupos de primer
   * nivel) sin recursión y sin mutar la entrada.
   * @param {Array<Object>} groups - Árbol de grupos.
   * @param {string|null} parentId - Id del padre (`null` para el primer nivel).
   * @returns {{groups: Array<Object>, changed: boolean}} Árbol resultante y si
   *   el orden cambió.
   * @throws {Error} Si el padre no existe.
   */
  function sortSubgroups(groups, parentId) {
    const result = structuredClone(groups);
    let list = result;
    if (parentId !== null && parentId !== undefined) {
      const parent = locate(result, parentId);
      if (!parent) {
        throw new Error("No existe el grupo indicado.");
      }
      list = childrenOf(parent.group);
    }
    const before = list.map((group) => group.id);
    list.sort((a, b) => compareNames(a.name, b.name));
    const changed = list.some((group, index) => group.id !== before[index]);
    return { groups: changed ? result : structuredClone(groups), changed };
  }

  /**
   * Ordena de la A a la Z los canales propios de un grupo sin mutar la entrada.
   * @param {Array<Object>} groups - Árbol de grupos.
   * @param {string} groupId - Id del grupo.
   * @returns {{groups: Array<Object>, changed: boolean}} Árbol resultante y si
   *   el orden cambió.
   * @throws {Error} Si el grupo no existe.
   */
  function sortChannels(groups, groupId) {
    const result = structuredClone(groups);
    const found = locate(result, groupId);
    if (!found) {
      throw new Error("No existe el grupo indicado.");
    }
    const list = Array.isArray(found.group.channels)
      ? found.group.channels
      : [];
    const before = list.map((channel) => channel.url);
    list.sort((a, b) => compareNames(channelLabel(a), channelLabel(b)));
    const changed = list.some(
      (channel, index) => channel.url !== before[index],
    );
    return { groups: changed ? result : structuredClone(groups), changed };
  }

  /**
   * Texto por el que se ordena un canal: su nombre, o la URL si el nombre
   * está vacío o solo tiene espacios.
   * @param {Object} channel - Canal del grupo.
   * @returns {string} Nombre o URL.
   */
  function channelLabel(channel) {
    return String(channel.name ?? "").trim() || channel.url;
  }

  /**
   * Indica si una lista ya está en orden A-Z, sin copiar el árbol (para
   * decidir si un botón de ordenar está activo).
   * @param {Array<Object>} groups - Árbol de grupos.
   * @param {string|null} id - Con `kind` "subgroups", id del padre (`null` =
   *   primer nivel); con "channels", id del grupo.
   * @param {"subgroups"|"channels"} kind - Lista a comprobar.
   * @returns {boolean} `true` si ordenar no cambiaría nada (también si el
   *   grupo no existe).
   */
  function isSorted(groups, id, kind) {
    let list = groups;
    if (kind === "channels" || (id !== null && id !== undefined)) {
      const found = locate(groups, id);
      if (!found) {
        return true;
      }
      list =
        kind === "channels"
          ? Array.isArray(found.group.channels)
            ? found.group.channels
            : []
          : childrenOf(found.group);
    }
    const label = kind === "channels" ? channelLabel : (group) => group.name;
    for (let index = 1; index < list.length; index++) {
      if (compareNames(label(list[index - 1]), label(list[index])) > 0) {
        return false;
      }
    }
    return true;
  }

  /**
   * Destinos posibles para "Fusionar con…": el árbol en preorden sin el grupo
   * ni sus descendientes (un antecesor sí es válido).
   * @param {Array<Object>} groups - Árbol de grupos.
   * @param {string} sourceId - Id del grupo que se fundirá.
   * @returns {Array<{id: string, name: string, level: number}>} `level`
   *   empieza en 0; vacío si el grupo no existe.
   */
  function getMergeTargets(groups, sourceId) {
    if (!locate(groups, sourceId)) {
      return [];
    }
    const targets = [];
    const visit = (list, level) => {
      for (const group of list) {
        if (group.id === sourceId) {
          continue;
        }
        targets.push({ id: group.id, name: group.name, level });
        visit(childrenOf(group), level + 1);
      }
    };
    visit(groups, 0);
    return targets;
  }

  /**
   * Funde un grupo en otro sin mutar la entrada: el destino conserva id,
   * nombre, icono, color y lugar; recibe al final los canales del origen (sin
   * duplicar por `getChannelKey`) y los subgrupos directos del origen con su
   * subárbol. El origen desaparece.
   * @param {Array<Object>} groups - Árbol de grupos.
   * @param {string} sourceId - Id del grupo que se funde.
   * @param {string} targetId - Id del grupo de destino.
   * @returns {{groups: Array<Object>, added: number, skipped: number,
   *   movedSubgroups: number}} `skipped` cuenta los canales que ya estaban.
   * @throws {Error} Si algún grupo no existe, coinciden o el destino está
   *   dentro del subárbol del origen.
   */
  function mergeGroups(groups, sourceId, targetId) {
    const source = locate(groups, sourceId);
    if (!source || !locate(groups, targetId)) {
      throw new Error("No existe el grupo indicado.");
    }
    if (sourceId === targetId) {
      throw new Error("No se puede fundir un grupo consigo mismo.");
    }
    if (subtreeContains(source.group, targetId)) {
      throw new Error("No se puede fundir un grupo dentro de sí mismo.");
    }

    const result = structuredClone(groups);
    const from = locate(result, sourceId);
    const to = locate(result, targetId).group;
    from.list.splice(from.index, 1);

    if (!Array.isArray(to.channels)) {
      to.channels = [];
    }
    const keys = new Set(
      to.channels.map((channel) => YouTubeGroups.getChannelKey(channel.url)),
    );
    let added = 0;
    let skipped = 0;
    for (const channel of channelsOf(from.group)) {
      const key = YouTubeGroups.getChannelKey(channel.url);
      if (keys.has(key)) {
        skipped += 1;
        continue;
      }
      keys.add(key);
      to.channels.push(channel);
      added += 1;
    }

    if (!Array.isArray(to.subgroups)) {
      to.subgroups = [];
    }
    const moved = childrenOf(from.group);
    for (const child of moved) {
      child.type = "subgroup";
      child.parentId = to.id;
      to.subgroups.push(child);
    }

    const keywords = YouTubeGroups.normalizeKeywords([
      ...(Array.isArray(to.keywords) ? to.keywords : []),
      ...(Array.isArray(from.group.keywords) ? from.group.keywords : []),
    ]).keywords;
    if (keywords.length > 0) {
      to.keywords = keywords;
    } else {
      delete to.keywords;
    }

    return { groups: result, added, skipped, movedSubgroups: moved.length };
  }

  /**
   * Revierte una operación de fusionar u ordenar solo si el árbol actual es
   * el que dejó esa operación (comparado con `JSON.stringify`).
   * @param {Array<Object>} current - Árbol actual.
   * @param {{before: Array<Object>, after: Array<Object>}} undo - Instantánea.
   * @returns {{groups: Array<Object>, status: "restored"|"already"|"changed"}}
   *   `groups` es `before` si se restaura; si no, el árbol actual sin tocar.
   */
  function revertGroups(current, undo) {
    const result = YouTubeGroupsUndo.revertSnapshot(current, undo);
    return { groups: result.value, status: result.status };
  }

  /**
   * Funde un grupo en otro y guarda.
   * @param {string} sourceId - Id del grupo que se funde.
   * @param {string} targetId - Id del grupo de destino.
   * @returns {Promise<{added: number, skipped: number, movedSubgroups: number,
   *   undo: {before: Array<Object>, after: Array<Object>}}>}
   * @throws {Error} Si la fusión no es válida (no escribe).
   */
  async function mergeGroupsAndSave(sourceId, targetId) {
    return YouTubeGroupsStorage.withLock(
      YouTubeGroupsStorage.KEYS.groups,
      async () => {
        const groups = await YouTubeGroupsStorage.getGroups();
        const result = mergeGroups(groups, sourceId, targetId);
        await YouTubeGroupsStorage.saveGroups(result.groups);
        return {
          added: result.added,
          skipped: result.skipped,
          movedSubgroups: result.movedSubgroups,
          undo: { before: groups, after: result.groups },
        };
      },
    );
  }

  // Ordena con `sorter(groups)` y guarda solo si cambia el orden.
  async function sortAndSave(sorter) {
    return YouTubeGroupsStorage.withLock(
      YouTubeGroupsStorage.KEYS.groups,
      async () => {
        const groups = await YouTubeGroupsStorage.getGroups();
        const result = sorter(groups);
        if (!result.changed) {
          return { changed: false, undo: null };
        }
        await YouTubeGroupsStorage.saveGroups(result.groups);
        return {
          changed: true,
          undo: { before: groups, after: result.groups },
        };
      },
    );
  }

  /**
   * Ordena A-Z los subgrupos de un grupo (o la raíz) y guarda.
   * @param {string|null} parentId - Id del padre (`null` para la raíz).
   * @returns {Promise<{changed: boolean, undo: Object|null}>}
   * @throws {Error} Si el padre no existe.
   */
  function sortSubgroupsAndSave(parentId) {
    return sortAndSave((groups) => sortSubgroups(groups, parentId));
  }

  /**
   * Ordena A-Z los canales de un grupo y guarda.
   * @param {string} groupId - Id del grupo.
   * @returns {Promise<{changed: boolean, undo: Object|null}>}
   * @throws {Error} Si el grupo no existe.
   */
  function sortChannelsAndSave(groupId) {
    return sortAndSave((groups) => sortChannels(groups, groupId));
  }

  /**
   * Quita canales de todos los grupos y subgrupos sin mutar la entrada.
   * @param {Array<Object>} groups - Árbol de grupos.
   * @param {Array<string>} keys - Claves de canal (`getChannelKey`).
   * @returns {{groups: Array<Object>, removedChannels: number,
   *   removedEntries: number}} Árbol resultante, canales distintos
   *   encontrados y canales quitados en total.
   */
  function removeChannelsEverywhere(groups, keys) {
    return YouTubeGroups.removeChannelsEverywhere(groups, keys);
  }

  /**
   * Quita canales de todos los grupos y guarda solo si cambia algo.
   * @param {Array<string>} keys - Claves de canal (`getChannelKey`).
   * @returns {Promise<{removedChannels: number, removedEntries: number,
   *   undo: {before: Array<Object>, after: Array<Object>}|null}>}
   */
  async function removeChannelsEverywhereAndSave(keys) {
    return YouTubeGroupsStorage.withLock(
      YouTubeGroupsStorage.KEYS.groups,
      async () => {
        const groups = await YouTubeGroupsStorage.getGroups();
        const result = removeChannelsEverywhere(groups, keys);
        if (result.removedEntries === 0) {
          return { removedChannels: 0, removedEntries: 0, undo: null };
        }
        await YouTubeGroupsStorage.saveGroups(result.groups);
        return {
          removedChannels: result.removedChannels,
          removedEntries: result.removedEntries,
          undo: { before: groups, after: result.groups },
        };
      },
    );
  }

  /**
   * Deshace una fusión u ordenación y guarda solo si se restaura.
   * @param {{before: Array<Object>, after: Array<Object>}} undo - Instantánea.
   * @returns {Promise<{status: "restored"|"already"|"changed"}>}
   */
  function revertGroupsAndSave(undo) {
    return YouTubeGroups.revertGroupsAndSave(undo);
  }

  return {
    revertGroups,
    mergeGroupsAndSave,
    sortSubgroupsAndSave,
    sortChannelsAndSave,
    revertGroupsAndSave,
    removeChannelsEverywhere,
    removeChannelsEverywhereAndSave,
    getMergeTargets,
    mergeGroups,
    compareNames,
    sortSubgroups,
    sortChannels,
    isSorted,
    normalizeSearchText,
    searchGroups,
    removeChannels,
    restoreChannels,
    transferChannels,
    addChannels,
    addChannelsAndSave,
    addChannelsToGroups,
    addChannelsToGroupsAndSave,
    removeChannelsAndSave,
    restoreChannelsAndSave,
    transferChannelsAndSave,
    findGroupLocation,
    moveGroup,
    getSiblingMove,
    getMoveTargets,
    getDropPosition,
    moveGroupAndSave,
    summarizeSubtree,
    removeGroupWithSnapshot,
    restoreGroup,
    deleteGroupAndSnapshot,
    restoreGroupAndSave,
  };
})();
