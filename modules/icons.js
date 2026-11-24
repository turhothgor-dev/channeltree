// SPDX-License-Identifier: GPL-3.0-or-later AND Apache-2.0
// Copyright (C) 2026 Javier López Diego
// Incluye trazados de Material Icons (Google), Apache 2.0; ver THIRD_PARTY_NOTICES.md

const YouTubeGroupsIcons = (() => {
  // Categorías (pestañas del selector), en el orden en que se muestran.
  const ICON_CATEGORIES = [
    { id: "general", label: "General" },
    { id: "media", label: "Medios" },
    { id: "sports", label: "Deportes" },
  ];

  // Iconos de grupo. El orden es el de la cuadrícula del selector. El dibujo
  // (multicolor, de fxemoji) está en YouTubeGroupsFxemoji.ICONS, indexado por
  // id; codepoint es el del emoji y category una de ICON_CATEGORIES.
  const ICON_SET = [
    {
      id: "tech",
      label: "Tecnología",
      codepoint: "1F4BB",
      category: "general",
    },
    { id: "gaming", label: "Gaming", codepoint: "1F3AE", category: "general" },
    { id: "music", label: "Música", codepoint: "1F3B5", category: "general" },
    { id: "movie", label: "Cine", codepoint: "1F3AC", category: "general" },
    {
      id: "education",
      label: "Educación",
      codepoint: "1F393",
      category: "general",
    },
    {
      id: "science",
      label: "Ciencia",
      codepoint: "1F52C",
      category: "general",
    },
    { id: "art", label: "Arte", codepoint: "1F58C", category: "general" },
    { id: "food", label: "Comida", codepoint: "1F374", category: "general" },
    { id: "travel", label: "Viajes", codepoint: "2708", category: "general" },
    {
      id: "leisure",
      label: "Ocio y juegos",
      codepoint: "1F3B2",
      category: "general",
    },
    { id: "humor", label: "Humor", codepoint: "1F602", category: "general" },
    {
      id: "cars",
      label: "Coches y motor",
      codepoint: "1F697",
      category: "general",
    },
    {
      id: "nature",
      label: "Naturaleza",
      codepoint: "1F333",
      category: "general",
    },
    {
      id: "animals",
      label: "Animales",
      codepoint: "1F436",
      category: "general",
    },
    { id: "home", label: "Hogar", codepoint: "1F3E0", category: "general" },
    {
      id: "diy",
      label: "Bricolaje",
      codepoint: "1F528",
      category: "general",
    },
    { id: "fashion", label: "Moda", codepoint: "1F457", category: "general" },
    { id: "health", label: "Salud", codepoint: "1F48A", category: "general" },
    { id: "books", label: "Libros", codepoint: "1F4DA", category: "general" },
    {
      id: "camping",
      label: "Camping",
      codepoint: "1F3D5",
      category: "general",
    },
    {
      id: "adventure",
      label: "Aventura y montaña",
      codepoint: "1F3D4",
      category: "general",
    },
    {
      id: "agriculture",
      label: "Agricultura",
      codepoint: "1F69C",
      category: "general",
    },
    {
      id: "default",
      label: "Genérico",
      codepoint: "1F5C0",
      category: "general",
    },
    { id: "news", label: "Noticias", codepoint: "1F4F0", category: "media" },
    {
      id: "videopodcast",
      label: "Videopodcast",
      codepoint: "1F399",
      category: "media",
    },
    {
      id: "interviews",
      label: "Entrevistas",
      codepoint: "1F3A4",
      category: "media",
    },
    {
      id: "podcast",
      label: "Podcast y audio",
      codepoint: "1F3A7",
      category: "media",
    },
    { id: "radio", label: "Radio", codepoint: "1F4FB", category: "media" },
    {
      id: "television",
      label: "Televisión",
      codepoint: "1F4FA",
      category: "media",
    },
    { id: "live", label: "Directos", codepoint: "1F4E1", category: "media" },
    { id: "vlogs", label: "Vlogs", codepoint: "1F4F9", category: "media" },
    {
      id: "photography",
      label: "Fotografía",
      codepoint: "1F4F7",
      category: "media",
    },
    {
      id: "social",
      label: "Redes sociales",
      codepoint: "1F4F1",
      category: "media",
    },
    {
      id: "geopolitics",
      label: "Geopolítica",
      codepoint: "1F30D",
      category: "media",
    },
    {
      id: "politics",
      label: "Política",
      codepoint: "1F3DB",
      category: "media",
    },
    {
      id: "elections",
      label: "Elecciones",
      codepoint: "1F5F3",
      category: "media",
    },
    {
      id: "opinion",
      label: "Opinión y debate",
      codepoint: "1F4E3",
      category: "media",
    },
    { id: "history", label: "Historia", codepoint: "1F4DC", category: "media" },
    { id: "economy", label: "Economía", codepoint: "1F4C8", category: "media" },
    {
      id: "data",
      label: "Datos y estadística",
      codepoint: "1F4CA",
      category: "media",
    },
    { id: "money", label: "Dinero", codepoint: "1F4B5", category: "media" },
    { id: "finance", label: "Finanzas", codepoint: "1F4B0", category: "media" },
    {
      id: "business",
      label: "Negocios",
      codepoint: "1F4BC",
      category: "media",
    },
    {
      id: "astronomy",
      label: "Astronomía y espacio",
      codepoint: "1F680",
      category: "media",
    },
    {
      id: "mystery",
      label: "Misterio",
      codepoint: "1F47B",
      category: "media",
    },
    {
      id: "research",
      label: "Investigación",
      codepoint: "1F50E",
      category: "media",
    },
    { id: "sports", label: "Fútbol", codepoint: "26BD", category: "sports" },
    {
      id: "mma",
      label: "MMA y boxeo",
      codepoint: "1F44A",
      category: "sports",
    },
    {
      id: "basketball",
      label: "Baloncesto",
      codepoint: "1F3C0",
      category: "sports",
    },
    {
      id: "american-football",
      label: "Fútbol americano",
      codepoint: "1F3C8",
      category: "sports",
    },
    { id: "rugby", label: "Rugby", codepoint: "1F3C9", category: "sports" },
    { id: "baseball", label: "Béisbol", codepoint: "26BE", category: "sports" },
    { id: "golf", label: "Golf", codepoint: "26F3", category: "sports" },
    {
      id: "billiards",
      label: "Billar",
      codepoint: "1F3B1",
      category: "sports",
    },
    {
      id: "darts",
      label: "Dardos y tiro",
      codepoint: "1F3AF",
      category: "sports",
    },
    {
      id: "gym",
      label: "Gimnasio y halterofilia",
      codepoint: "1F4AA",
      category: "sports",
    },
    { id: "ski", label: "Esquí", codepoint: "1F3BF", category: "sports" },
    {
      id: "trophy",
      label: "Competiciones",
      codepoint: "1F3C6",
      category: "sports",
    },
    { id: "medal", label: "Medallas", codepoint: "1F3C5", category: "sports" },
    { id: "running", label: "Running", codepoint: "1F45F", category: "sports" },
    {
      id: "athletics",
      label: "Atletismo",
      codepoint: "1F3BD",
      category: "sports",
    },
    {
      id: "cycling",
      label: "Ciclismo",
      codepoint: "1F6B2",
      category: "sports",
    },
    {
      id: "swimming",
      label: "Natación",
      codepoint: "1F3CA",
      category: "sports",
    },
    { id: "surf", label: "Surf", codepoint: "1F30A", category: "sports" },
    { id: "tennis", label: "Tenis", codepoint: "1F3BE", category: "sports" },
    {
      id: "motorsport",
      label: "Motor (F1)",
      codepoint: "1F3CE",
      category: "sports",
    },
  ];

  // Iconos de interfaz (Material Icons, Apache 2.0, viewBox 24). Separados de
  // ICON_SET para que no salgan en el selector de iconos de grupos.
  const UI_ICON_PATHS = {
    eye: "M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z",
    check: "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
    "playlist-add":
      "M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z",
    settings:
      "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z",
    recycle:
      "M5.77 7.15 7.2 4.78l1.03-1.71c.39-.65 1.33-.65 1.72 0l1.48 2.46-1.23 2.06-1 1.62-3.43-2.06zm15.95 5.82-1.6-2.66-3.46 2L18.87 16H20a2 2 0 0 0 2-2c0-.36-.1-.71-.28-1.03zM16 21h1.5a2 2 0 0 0 1.79-1.11L20.74 17H16v-2l-4 4 4 4v-2zm-6-4H5.7l-.84 1.41c-.3.5-.32 1.12-.06 1.65.28.57.87.94 1.52.94H10v-4zm-3.88-2.65 1.73 1.04L6.48 9.9 1 11.27l1.7 1.02-.41.69c-.35.59-.38 1.31-.07 1.92l1.63 3.26 2.27-3.81zm10.9-9.21-1.3-2.17C15.35 2.37 14.7 2 14 2h-3.53l3.12 5.2-1.72 1.03 5.49 1.37 1.37-5.49-1.71 1.03z",
    add: "M13 7h-2v4H7v2h4v4h2v-4h4v-2h-4V7zm-1-5C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z",
    edit: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
    "arrow-up": "M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z",
    "arrow-down":
      "M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z",
    palette:
      "M12 3a9 9 0 0 0 0 18c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z",
    delete:
      "M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-3.5l-1-1zM18 7H6v12c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7z",
    swap: "M16 17.01V10h-2v7.01h-3L15 21l4-3.99h-3zM9 3 5 6.99h3V14h2V6.99h3L9 3z",
    // Material Icons "inbox" (Apache 2.0)
    ungrouped:
      "M19 3H4.99c-1.11 0-1.98.89-1.98 2L3 19c0 1.1.88 2 1.99 2H19c1.1 0 2-.9 2-2V5c0-1.11-.9-2-2-2zm0 12h-4c0 1.66-1.35 3-3 3s-3-1.34-3-3H4.99V5H19v10z",
    // Material Icons "merge_type" (Apache 2.0)
    merge:
      "M17 20.41L18.41 19 15 15.59 13.59 17 17 20.41zM7.5 8H11v5.59L5.59 19 7 20.41l6-6V8h3.5L12 3.5 7.5 8z",
    // Material Icons "sort_by_alpha" (Apache 2.0)
    "sort-az":
      "M14.94 4.66h-4.72l2.36-2.36zm-4.69 14.71h4.66l-2.33 2.33zM6.1 6.27L1.6 17.73h1.84l.92-2.45h5.11l.92 2.45h1.84L7.74 6.27H6.1zm-1.13 7.37l1.94-5.18 1.94 5.18H4.97zm10.76 2.5h6.12v1.59h-8.53v-1.29l5.92-8.56h-5.88v-1.6h8.3v1.26l-5.93 8.6z",
    // Material Icons "chevron_left" y "chevron_right" (Apache 2.0)
    "chevron-left": "M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z",
    "chevron-right": "M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z",
    // Material Icons "visibility_off" (Apache 2.0)
    "eye-off":
      "M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z",
  };

  // Color set with 8 colors
  const COLOR_SET = [
    { id: "blue", hex: "#2196F3" },
    { id: "green", hex: "#4CAF50" },
    { id: "red", hex: "#F44336" },
    { id: "orange", hex: "#FF9800" },
    { id: "purple", hex: "#9C27B0" },
    { id: "pink", hex: "#E91E63" },
    { id: "indigo", hex: "#3F51B5" },
    { id: "teal", hex: "#009688" },
  ];

  // Constants for no icon/color
  const NO_ICON = "";
  const NO_COLOR = "";

  /**
   * Gets the graphic (fxemoji) of an icon by ID
   * @param {string} id - The icon ID
   * @returns {{viewBox: string, shapes: Array<{tag: string, attrs: Object}>}|null}
   *   The graphic or null if not found
   */
  function getIconGraphic(id) {
    if (!ICON_SET.some((icon) => icon.id === id)) {
      return null;
    }
    const data = YouTubeGroupsFxemoji.ICONS[id];
    return data ? { viewBox: data.viewBox, shapes: data.shapes } : null;
  }

  /**
   * Gets the SVG path of an interface icon by ID
   * @param {string} id - The interface icon ID
   * @returns {string|null} The SVG path or null if not found
   */
  function getUiIconPath(id) {
    return Object.hasOwn(UI_ICON_PATHS, id) ? UI_ICON_PATHS[id] : null;
  }

  /**
   * Gets the label for an icon by ID
   * @param {string} id - The icon ID
   * @returns {string} The icon label or empty string if not found
   */
  function getIconLabel(id) {
    const icon = ICON_SET.find((icon) => icon.id === id);
    return icon ? icon.label : "";
  }

  /**
   * Gets the category of an icon by ID
   * @param {string} id - The icon ID
   * @returns {string} The category ID, or "general" if the ID is empty or unknown
   */
  function getIconCategory(id) {
    const icon = ICON_SET.find((icon) => icon.id === id);
    return icon ? icon.category : "general";
  }

  /**
   * Checks if an icon ID is valid (empty or exists in ICON_SET)
   * @param {string} id - The icon ID to validate
   * @returns {boolean} True if valid
   */
  function isValidIconId(id) {
    return id === NO_ICON || ICON_SET.some((icon) => icon.id === id);
  }

  /**
   * Checks if a color hex is valid (empty or valid #rrggbb format)
   * @param {string} hex - The hex color to validate
   * @returns {boolean} True if valid
   */
  function isValidColor(hex) {
    return hex === NO_COLOR || /^#[A-Fa-f0-9]{6}$/.test(hex);
  }

  /**
   * Gets the hex color for a color ID
   * @param {string} id - The color ID
   * @returns {string|null} The hex color or null if not found
   */
  function getColorHex(id) {
    const color = COLOR_SET.find((color) => color.id === id);
    return color ? color.hex : null;
  }

  /**
   * Luminancia relativa WCAG de un color #rrggbb.
   * @param {string} hex - Color #rrggbb.
   * @returns {number} Luminancia entre 0 y 1.
   */
  function relativeLuminance(hex) {
    const channels = [1, 3, 5].map((start) => {
      const value = parseInt(hex.slice(start, start + 2), 16) / 255;
      return value <= 0.03928
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  /**
   * Elige el color de texto (blanco u oscuro) con mayor contraste WCAG sobre un fondo.
   * @param {string} hex - Fondo #rrggbb.
   * @returns {string} "#ffffff" o "#0f0f0f".
   */
  function getContrastTextColor(hex) {
    const luminance = relativeLuminance(hex);
    const darkText = relativeLuminance("#0f0f0f");
    const contrastWhite = 1.05 / (luminance + 0.05);
    const contrastDark = (luminance + 0.05) / (darkText + 0.05);
    return contrastWhite >= contrastDark ? "#ffffff" : "#0f0f0f";
  }

  return {
    ICON_SET,
    ICON_CATEGORIES,
    getIconCategory,
    getContrastTextColor,
    COLOR_SET,
    NO_ICON,
    NO_COLOR,
    getIconGraphic,
    getUiIconPath,
    getIconLabel,
    isValidIconId,
    isValidColor,
    getColorHex,
  };
})();
