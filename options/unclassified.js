// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

/**
 * Lista "Canales sin grupo" de la página de opciones: muestra las
 * suscripciones conocidas que no están en ningún grupo. No usa innerHTML con datos.
 */
const YouTubeGroupsUnclassified = (() => {
  const EMPTY_TEXT =
    "Aún no se conoce ninguna suscripción. Abre YouTube con la guía " +
    "desplegada o visita «Todas las suscripciones» (youtube.com/feed/channels) " +
    "y baja hasta el final para leerlas todas.";
  const ALL_CLASSIFIED_TEXT =
    "Todas las suscripciones conocidas están en algún grupo.";
  const NO_MATCH_TEXT = "Ningún canal sin grupo coincide con la búsqueda.";

  const LABEL = "Canales sin grupo";

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
   * Crea la bandeja dentro de un contenedor.
   * @param {HTMLElement} container - Sección donde se pinta.
   * @param {Object} [callbacks] - Funciones de la página.
   * @param {function(string, function(): void, boolean): void} [callbacks.showNotice] -
   *   Muestra un aviso con "Deshacer" opcional.
   * @param {function(Object): Promise<void>} [callbacks.undoGroups] - Deshace
   *   una instantánea del árbol.
   * @param {HTMLElement} [callbacks.pageSizeControl] - Selector de tamaño de
   *   página, que el marco coloca bajo el título.
   * @returns {{render: Function}} Componente.
   */
  function create(container, { showNotice, undoGroups, pageSizeControl } = {}) {
    const selected = new Set();
    const frame = YouTubeGroupsPager.createListFrame(container, {
      titleId: "options-unclassified-title",
      label: LABEL,
      controls: pageSizeControl,
    });
    const body = frame.body;
    const paging = YouTubeGroupsPager.createListPaging(frame, {
      label: LABEL,
      rerender: () => render(lastData),
    });
    let lastData = null;
    let adding = false;
    let target = "";
    let busy = false;
    let notice = "";
    let errorText = "";

    /**
     * Texto del aviso tras añadir.
     * @param {string} name - Nombre del grupo.
     * @param {number} added - Canales añadidos.
     * @param {number} skipped - Canales que ya estaban.
     * @returns {string} Aviso.
     */
    function buildNotice(name, added, skipped) {
      let text =
        added === 1 ? `1 añadido a «${name}»` : `${added} añadidos a «${name}»`;
      if (skipped === 1) {
        text += "; 1 ya estaba";
      } else if (skipped > 1) {
        text += `; ${skipped} ya estaban`;
      }
      return text;
    }

    /**
     * Aplica sugerencias: una escritura y aviso con "Deshacer".
     * @param {Array<{item: Object, suggestion: Object}>} entries - Filas.
     * @param {boolean} single - Si es una sola fila.
     * @returns {Promise<void>}
     */
    async function applySuggestions(entries, single) {
      busy = true;
      notice = "";
      errorText = "";
      render(lastData);
      let message = "";
      let undo = null;
      try {
        const result = await YouTubeGroupsEditor.addChannelsToGroupsAndSave(
          entries.map(({ item, suggestion }) => ({
            groupId: suggestion.groupId,
            channel: { name: item.name, url: item.url },
          })),
        );
        for (const { item } of entries) {
          selected.delete(item.url);
        }
        undo = result.undo;
        if (result.added === 0) {
          message = "Los canales ya estaban en esos grupos";
        } else if (single) {
          message = `«${entries[0].item.name}» añadido a «${entries[0].suggestion.groupPath}»`;
        } else {
          message =
            result.added === 1
              ? "1 canal añadido a su grupo sugerido"
              : `${result.added} canales añadidos a sus grupos sugeridos`;
        }
        if (result.missing === 1) {
          message += "; 1 no se añadió porque su grupo ya no existe";
        } else if (result.missing > 1) {
          message += `; ${result.missing} no se añadieron porque su grupo ya no existe`;
        }
      } catch (error) {
        console.error(error);
        errorText = "No se pudieron aplicar las sugerencias.";
      }
      busy = false;
      render(lastData);
      if (message && showNotice) {
        showNotice(message, undo ? () => undoGroups(undo) : undefined, true);
      }
    }

    /**
     * Pinta la bandeja.
     * @param {Object} data - Datos.
     * @param {Array<Object>} data.groups - Árbol de grupos.
     * @param {Object} data.subscriptions - Mapa de suscripciones conocidas.
     * @param {Object} data.avatars - Avatares (clave de canal → URL).
     * @param {string} data.query - Texto del buscador de Canales.
     * @returns {void}
     */
    function render(data) {
      lastData = data;
      const { groups, subscriptions, avatars, query } = data;
      const all = YouTubeGroupsSubscriptions.getUnclassifiedSubscriptions(
        subscriptions,
        groups,
      );
      const allUrls = new Set(all.map((item) => item.url));
      for (const url of [...selected]) {
        if (!allUrls.has(url)) {
          selected.delete(url);
        }
      }
      const needle = YouTubeGroupsEditor.normalizeSearchText(query || "");
      if (selected.size === 0) {
        adding = false;
      }
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

      frame.title.textContent = `${LABEL} (${all.length})`;
      body.replaceChildren();
      if (notice) {
        const status = el("p", "options__channels-summary", notice);
        status.setAttribute("role", "status");
        body.append(status);
      }
      if (errorText) {
        const alert = el("p", "options__error", errorText);
        alert.setAttribute("role", "alert");
        body.append(alert);
      }

      if (items.length === 0) {
        const known = Object.keys(
          YouTubeGroupsSubscriptions.normalizeSubscriptions(subscriptions),
        ).length;
        const text =
          known === 0
            ? EMPTY_TEXT
            : all.length === 0
              ? ALL_CLASSIFIED_TEXT
              : NO_MATCH_TEXT;
        body.append(el("p", "options__channels-summary", text));
        restoreFocusUnlessBusy(focusKey);
        return;
      }

      const rules = YouTubeGroupsKeywordRules.collectRules(groups);
      const suggestions = YouTubeGroupsKeywordRules.suggestForSubscriptions(
        all,
        groups,
        rules,
      );
      const suggestedEntries = pageItems
        .filter((item) => suggestions.has(item.key))
        .map((item) => ({ item, suggestion: suggestions.get(item.key) }));
      if (rules.length === 0) {
        body.append(
          el(
            "p",
            "options__channels-summary",
            "Escribe palabras clave en un grupo (panel «Canales») para que aquí se sugiera a qué grupo añadir cada suscripción.",
          ),
        );
      }

      const bar = el("div", "options__channels-bar");
      const selectAll = document.createElement("input");
      selectAll.type = "checkbox";
      selectAll.setAttribute("aria-label", "Seleccionar la página");
      selectAll.setAttribute("data-focus-key", "select-page");
      const selectAllLabel = el("label", "options__select-all");
      selectAllLabel.append(selectAll, " Seleccionar la página");
      const addButton = document.createElement("button");
      addButton.type = "button";
      addButton.setAttribute("data-focus-key", "add-button");
      bar.append(selectAllLabel);
      if (suggestedEntries.length > 0) {
        const applyAll = document.createElement("button");
        applyAll.type = "button";
        applyAll.textContent = `Aplicar sugerencias de la página (${suggestedEntries.length})`;
        applyAll.setAttribute("data-focus-key", "apply-page");
        applyAll.disabled = busy;
        applyAll.addEventListener("click", () => {
          applySuggestions(suggestedEntries, false);
        });
        bar.append(applyAll);
      }
      bar.append(addButton);

      const checkboxes = [];
      const refresh = () => {
        const visibleSelected = pageItems.filter((item) =>
          selected.has(item.url),
        ).length;
        selectAll.checked = visibleSelected === pageItems.length;
        selectAll.indeterminate =
          visibleSelected > 0 && visibleSelected < pageItems.length;
        selectAll.disabled = busy;
        addButton.textContent = `Añadir a… (${selected.size})`;
        addButton.disabled = busy || selected.size === 0 || adding;
        for (const box of checkboxes) {
          box.disabled = busy;
        }
      };

      selectAll.addEventListener("change", () => {
        for (const item of pageItems) {
          if (selectAll.checked) {
            selected.add(item.url);
          } else {
            selected.delete(item.url);
          }
        }
        for (const box of checkboxes) {
          box.checked = selectAll.checked;
        }
        refresh();
      });
      addButton.addEventListener("click", () => {
        adding = true;
        target = "";
        paging.focusNext("add-select");
        render(lastData);
      });

      if (adding && selected.size > 0) {
        const wrapper = el("span", "options__transfer");
        const select = document.createElement("select");
        select.className = "options__transfer-select";
        select.setAttribute("aria-label", "Añadir a");
        select.setAttribute("data-focus-key", "add-select");
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Elige un grupo";
        select.append(placeholder);
        for (const group of YouTubeGroups.flattenGroups(groups)) {
          const option = document.createElement("option");
          option.value = group.id;
          option.textContent = "  ".repeat(group.level) + group.name;
          select.append(option);
        }
        select.value = target;
        if (select.value !== target) {
          target = "";
          select.value = "";
        }
        select.disabled = busy;
        const confirm = document.createElement("button");
        confirm.type = "button";
        confirm.textContent = "Añadir";
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.textContent = "Cancelar";
        cancel.disabled = busy;
        const updateConfirm = () => {
          confirm.disabled = busy || select.value === "";
        };
        updateConfirm();
        const close = () => {
          adding = false;
          target = "";
          render(lastData);
        };
        select.addEventListener("change", () => {
          target = select.value;
          updateConfirm();
        });
        select.addEventListener("keydown", (event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            close();
          }
        });
        cancel.addEventListener("click", close);
        confirm.addEventListener("click", async () => {
          const groupId = select.value;
          const group = YouTubeGroups.flattenGroups(groups).find(
            (candidate) => candidate.id === groupId,
          );
          if (!group) {
            return;
          }
          const channels = all
            .filter((item) => selected.has(item.url))
            .map((item) => ({ name: item.name, url: item.url }));
          busy = true;
          notice = "";
          errorText = "";
          render(lastData);
          try {
            const result = await YouTubeGroupsEditor.addChannelsAndSave(
              groupId,
              channels,
            );
            notice = buildNotice(group.name, result.added, result.skipped);
            selected.clear();
            adding = false;
            target = "";
          } catch (error) {
            console.error(error);
            errorText = "No se pudieron añadir los canales.";
          }
          busy = false;
          render(lastData);
        });
        wrapper.append(select, confirm, cancel);
        bar.append(wrapper);
      }
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
        box.checked = selected.has(item.url);
        box.dataset.url = item.url;
        box.setAttribute("data-focus-key", `select:${item.url}`);
        box.setAttribute("aria-label", `Seleccionar ${item.name}`);
        box.addEventListener("change", () => {
          if (box.checked) {
            selected.add(item.url);
          } else {
            selected.delete(item.url);
          }
          notice = "";
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
        text.append(link, el("span", "options__channel-url", item.url));
        const description = YouTubeGroupsPager.describe(
          subscriptions,
          item.key,
        );
        const suggestion = suggestions.get(item.key);
        if (suggestion) {
          text.append(
            el(
              "span",
              "options__suggestion",
              `Sugerencia: «${suggestion.groupPath}» (por «${suggestion.keyword}»)`,
            ),
          );
        }
        row.append(box, avatar, text);
        if (description) {
          row.append(description);
        }
        if (suggestion) {
          const apply = el(
            "button",
            "options__suggestion-apply",
            `Añadir a «${suggestion.groupPath}»`,
          );
          apply.type = "button";
          apply.setAttribute(
            "aria-label",
            `Añadir «${item.name}» a «${suggestion.groupPath}»`,
          );
          apply.setAttribute("data-focus-key", `apply:${item.url}`);
          apply.disabled = busy;
          apply.addEventListener("click", () => {
            applySuggestions([{ item, suggestion }], true);
          });
          row.append(apply);
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
