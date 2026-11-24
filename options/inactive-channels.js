// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

/**
 * Sección "Canales inactivos" del editor: lista los canales de los grupos de
 * los que no se ha visto ningún vídeo nuevo durante el plazo elegido y permite
 * quitarlos en bloque de todos sus grupos, con "Deshacer". No usa innerHTML con
 * datos.
 */
const YouTubeGroupsInactiveList = (() => {
  const DESCRIPTION =
    "Canales de tus grupos de los que no se ha visto ningún vídeo nuevo " +
    "durante el plazo elegido. Es aproximado: solo cuenta lo que la " +
    "extensión ve al usar YouTube, sin consultarlo.";
  const NO_FEED_TEXT =
    "Aún no hay datos: visita tus suscripciones en YouTube para empezar a " +
    "observar la actividad de los canales.";
  const STALE_TEXT =
    "Hace más de 30 días que no se visitan tus suscripciones en YouTube; " +
    "visítalas para actualizar la actividad.";
  const NO_DATA_TEXT =
    "No se ha podido leer la antigüedad de ningún vídeo (por ejemplo, si " +
    "YouTube está en otro idioma), así que no se puede saber qué canales " +
    "están inactivos.";
  const NONE_TEXT = "Ningún canal inactivo en el plazo elegido.";
  const NO_MATCH_TEXT = "Ningún canal inactivo coincide con la búsqueda.";
  const NOT_IN_GROUPS_TEXT = "Los canales ya no estaban en ningún grupo";
  const ERROR_TEXT = "No se pudieron quitar los canales.";
  const LABEL = "Canales inactivos";
  const THRESHOLD_KEY = "threshold";

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
   * @param {Object} options - Opciones.
   * @param {function(string, function(): void, boolean): void} options.showNotice -
   *   Muestra el aviso del editor (texto, acción de deshacer, foco en ella).
   * @param {function(Object): Promise<void>} options.undoGroups - Deshace una
   *   operación sobre los grupos (instantánea `{ before, after }`).
   * @param {HTMLElement} [options.pageSizeControl] - Selector de tamaño de
   *   página, que el marco coloca bajo el título.
   * @returns {{render: Function}} Componente.
   */
  function create(container, { showNotice, undoGroups, pageSizeControl }) {
    const selected = new Set();
    const frame = YouTubeGroupsPager.createListFrame(container, {
      titleId: "options-inactive-title",
      label: LABEL,
      controls: pageSizeControl,
    });
    const body = frame.body;
    const paging = YouTubeGroupsPager.createListPaging(frame, {
      label: LABEL,
      rerender: () => render(lastData),
    });
    let lastData = {
      groups: [],
      subscriptions: {},
      activity: null,
      avatars: {},
      query: "",
    };
    let thresholdMonths = YouTubeGroupsChannelActivity.DEFAULT_THRESHOLD_MONTHS;
    let busy = false;
    let errorText = "";

    /**
     * Quita de todos los grupos los canales marcados y avisa con "Deshacer".
     * @param {Array<string>} keys - Claves de los canales.
     * @returns {Promise<void>}
     */
    async function removeSelected(keys) {
      if (busy || keys.length === 0) {
        return;
      }
      busy = true;
      errorText = "";
      render(lastData);
      try {
        const { removedChannels, undo } =
          await YouTubeGroupsEditor.removeChannelsEverywhereAndSave(keys);
        selected.clear();
        if (removedChannels === 0 || !undo) {
          showNotice(NOT_IN_GROUPS_TEXT);
        } else {
          showNotice(
            removedChannels === 1
              ? "1 canal quitado de sus grupos"
              : `${removedChannels} canales quitados de sus grupos`,
            () => undoGroups(undo),
            true,
          );
        }
      } catch (error) {
        console.error(error);
        errorText = ERROR_TEXT;
      }
      busy = false;
      render(lastData);
    }

    /**
     * Pinta la sección.
     * @param {Object} data - Datos.
     * @param {Array<Object>} data.groups - Árbol de grupos.
     * @param {Object} data.subscriptions - Mapa de suscripciones conocidas.
     * @param {Object} data.activity - Actividad guardada (`youtubeChannelActivity`).
     * @param {Object} data.avatars - Avatares (clave de canal → URL).
     * @param {string} data.query - Texto del buscador de Canales.
     * @returns {void}
     */
    function render(data) {
      lastData = data;
      const { groups, subscriptions, activity, avatars, query } = data;
      const activityApi = YouTubeGroupsChannelActivity;
      const now = Date.now();
      const result = activityApi.listInactiveChannels(
        activity,
        groups,
        subscriptions,
        { now, thresholdMonths },
      );
      const all = result.channels;
      const allKeys = new Set(all.map((item) => item.key));
      for (const key of [...selected]) {
        if (!allKeys.has(key)) {
          selected.delete(key);
        }
      }
      const needle = YouTubeGroupsEditor.normalizeSearchText(query || "");
      const items = needle
        ? all.filter(
            (item) =>
              YouTubeGroupsEditor.normalizeSearchText(item.name).includes(
                needle,
              ) ||
              YouTubeGroupsEditor.normalizeSearchText(item.url).includes(
                needle,
              ),
          )
        : all;

      const { start, end, focusKey } = paging.resolve({
        total: items.length,
        pageSize: data.pageSize,
        query: needle,
      });
      const pageItems = items.slice(start, end);

      frame.title.textContent = `Canales inactivos (${all.length})`;
      body.replaceChildren();
      body.append(el("p", "options__channels-summary", DESCRIPTION));

      const select = document.createElement("select");
      select.className = "options__inactive-threshold";
      select.setAttribute("aria-label", "Sin vídeos desde hace");
      for (const months of activityApi.THRESHOLD_MONTHS) {
        const option = document.createElement("option");
        option.value = String(months);
        option.textContent = `${months} meses`;
        select.append(option);
      }
      select.value = String(thresholdMonths);
      select.disabled = busy;
      select.addEventListener("change", () => {
        thresholdMonths = Number(select.value);
        paging.focusNext(THRESHOLD_KEY);
        render(lastData);
      });
      select.setAttribute("data-focus-key", THRESHOLD_KEY);
      body.append(select);

      if (errorText) {
        const alert = el("p", "options__error", errorText);
        alert.setAttribute("role", "alert");
        body.append(alert);
      }

      if (result.status === "no-feed") {
        body.append(el("p", "options__channels-summary", NO_FEED_TEXT));
        restoreFocusUnlessBusy(focusKey);
        return;
      }
      if (result.status === "stale") {
        body.append(el("p", "options__channels-summary", STALE_TEXT));
        restoreFocusUnlessBusy(focusKey);
        return;
      }
      if (result.status === "no-data") {
        body.append(el("p", "options__channels-summary", NO_DATA_TEXT));
        restoreFocusUnlessBusy(focusKey);
        return;
      }
      if (items.length === 0) {
        body.append(
          el(
            "p",
            "options__channels-summary",
            all.length === 0 ? NONE_TEXT : NO_MATCH_TEXT,
          ),
        );
        if (all.length === 0 && result.observingSince !== null) {
          const days = Math.floor(
            (now - result.observingSince) / activityApi.DAY_MS,
          );
          body.append(
            el(
              "p",
              "options__channels-summary",
              `Se observa la actividad desde hace ${
                days === 1 ? "1 día" : `${days} días`
              }.`,
            ),
          );
        }
        restoreFocusUnlessBusy(focusKey);
        return;
      }

      const bar = el("div", "options__channels-bar");
      const selectAll = document.createElement("input");
      selectAll.type = "checkbox";
      selectAll.setAttribute("aria-label", "Seleccionar la página");
      selectAll.setAttribute("data-focus-key", "select-page");
      const selectAllLabel = el("label", "options__select-all");
      selectAllLabel.append(selectAll, " Seleccionar la página");
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      bar.append(selectAllLabel, removeButton);

      const checkboxes = [];
      const refresh = () => {
        const visibleSelected = pageItems.filter((item) =>
          selected.has(item.key),
        ).length;
        selectAll.checked = visibleSelected === pageItems.length;
        selectAll.indeterminate =
          visibleSelected > 0 && visibleSelected < pageItems.length;
        selectAll.disabled = busy;
        removeButton.textContent = `Quitar de los grupos (${selected.size})`;
        removeButton.disabled = busy || selected.size === 0;
        for (const box of checkboxes) {
          box.disabled = busy;
        }
      };

      selectAll.addEventListener("change", () => {
        for (const item of pageItems) {
          if (selectAll.checked) {
            selected.add(item.key);
          } else {
            selected.delete(item.key);
          }
        }
        for (const box of checkboxes) {
          box.checked = selectAll.checked;
        }
        refresh();
      });
      removeButton.addEventListener("click", () => {
        removeSelected([...selected]);
      });
      body.append(bar);
      const controls = paging.controls();
      if (controls) {
        body.append(controls);
      }

      const list = el("ul", "options__channel-list");
      for (const item of pageItems) {
        const row = el("li", "options__channel");
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = selected.has(item.key);
        box.dataset.key = item.key;
        box.setAttribute("data-focus-key", `select:${item.key}`);
        box.setAttribute("aria-label", `Seleccionar ${item.name}`);
        box.addEventListener("change", () => {
          if (box.checked) {
            selected.add(item.key);
          } else {
            selected.delete(item.key);
          }
          refresh();
        });
        checkboxes.push(box);
        const avatar = YouTubeGroupsIconsDom.createChannelAvatar(
          item.name,
          YouTubeGroupsAvatars.getAvatarFor(avatars, item.url),
          YouTubeGroupsIconsDom.AVATAR_SIZES.editor,
        );
        const text = el("span", "options__channel-text");
        const link = el("a", "options__channel-link", item.name);
        link.href = item.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        text.append(
          link,
          el("span", "options__channel-url", item.url),
          el(
            "span",
            "options__channel-url",
            `${activityApi.describeInactivity(item, now)} · En: ${item.groups
              .map((group) => group.name)
              .join(", ")}`,
          ),
        );
        const description = YouTubeGroupsPager.describe(
          subscriptions,
          item.key,
        );
        row.append(box, avatar, text);
        if (description) {
          row.append(description);
        }
        list.append(row);
      }
      body.append(list);
      refresh();
      restoreFocusUnlessBusy(focusKey);
    }

    /**
     * Devuelve el foco al control que lo tenía, salvo mientras se trabaja.
     * @param {string|null} key - Clave de foco capturada.
     * @returns {void}
     */
    function restoreFocusUnlessBusy(key) {
      if (!busy) {
        paging.restoreFocus(key);
      }
    }

    return { render };
  }

  return Object.freeze({ create, LABEL });
})();
