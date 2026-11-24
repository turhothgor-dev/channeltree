// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

/**
 * Sugerencias de grupo por palabras clave (ADR 0024). Sin DOM; solo la usa la
 * página de opciones. Compara por palabra completa, sin mayúsculas ni acentos,
 * y nunca construye expresiones regulares con el texto de la persona.
 */
const YouTubeGroupsKeywordRules = (() => {
  const SEPARATOR = " › ";

  /**
   * Parte un texto en palabras (letras y números), sin mayúsculas ni acentos.
   * @param {string} text - Texto original.
   * @returns {string[]} Palabras, sin vacíos.
   */
  function tokenize(text) {
    return YouTubeGroups.foldKeyword(text)
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean);
  }

  /**
   * Indica si las palabras de la clave aparecen seguidas en el nombre.
   * @param {string[]} nameTokens - Palabras del nombre del canal.
   * @param {string[]} keywordTokens - Palabras de la clave (no vacío).
   * @returns {boolean} true si hay coincidencia.
   */
  function matchesKeyword(nameTokens, keywordTokens) {
    const size = keywordTokens.length;
    if (size === 0) {
      return false;
    }
    for (let start = 0; start + size <= nameTokens.length; start += 1) {
      let equal = true;
      for (let offset = 0; offset < size; offset += 1) {
        if (nameTokens[start + offset] !== keywordTokens[offset]) {
          equal = false;
          break;
        }
      }
      if (equal) {
        return true;
      }
    }
    return false;
  }

  /**
   * Reglas de todo el árbol, en preorden.
   * @param {Array<Object>} groups - Árbol de grupos.
   * @returns {Array<{groupId: string, groupPath: string, keyword: string, tokens: string[], order: number}>}
   *   Una regla por palabra clave válida.
   */
  function collectRules(groups) {
    const rules = [];
    let order = 0;
    const visit = (list, parentPath) => {
      for (const group of Array.isArray(list) ? list : []) {
        const groupPath = parentPath
          ? `${parentPath}${SEPARATOR}${group.name}`
          : String(group.name);
        const { keywords } = YouTubeGroups.normalizeKeywords(group.keywords);
        for (const keyword of keywords) {
          const tokens = tokenize(keyword);
          if (tokens.length > 0) {
            rules.push({
              groupId: group.id,
              groupPath,
              keyword,
              tokens,
              order,
            });
          }
        }
        order += 1;
        visit(group.subgroups, groupPath);
      }
    };
    visit(groups, "");
    return rules;
  }

  /**
   * Elige el grupo sugerido para un nombre de canal.
   * @param {string} name - Nombre del canal.
   * @param {Array<Object>} rules - Reglas de `collectRules`.
   * @returns {{groupId: string, groupPath: string, keyword: string}|null}
   *   La regla con más palabras; a igualdad, la más larga; a igualdad, la primera del árbol.
   */
  function suggestGroup(name, rules) {
    const nameTokens = tokenize(name);
    let best = null;
    for (const rule of rules) {
      if (!matchesKeyword(nameTokens, rule.tokens)) {
        continue;
      }
      if (
        !best ||
        rule.tokens.length > best.tokens.length ||
        (rule.tokens.length === best.tokens.length &&
          (rule.keyword.length > best.keyword.length ||
            (rule.keyword.length === best.keyword.length &&
              rule.order < best.order)))
      ) {
        best = rule;
      }
    }
    return best
      ? {
          groupId: best.groupId,
          groupPath: best.groupPath,
          keyword: best.keyword,
        }
      : null;
  }

  /**
   * Sugerencias para una lista de suscripciones sin grupo.
   * @param {Array<{key: string, name: string}>} items - Suscripciones.
   * @param {Array<Object>} groups - Árbol de grupos.
   * @param {Array<Object>} [rules] - Reglas ya calculadas; por defecto,
   *   `collectRules(groups)`.
   * @returns {Map<string, {groupId: string, groupPath: string, keyword: string}>}
   *   Solo las suscripciones con sugerencia.
   */
  function suggestForSubscriptions(
    items,
    groups,
    rules = collectRules(groups),
  ) {
    const suggestions = new Map();
    if (rules.length === 0) {
      return suggestions;
    }
    for (const item of items) {
      const suggestion = suggestGroup(item.name, rules);
      if (suggestion) {
        suggestions.set(item.key, suggestion);
      }
    }
    return suggestions;
  }

  return {
    tokenize,
    matchesKeyword,
    collectRules,
    suggestGroup,
    suggestForSubscriptions,
  };
})();
