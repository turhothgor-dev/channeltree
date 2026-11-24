# 0025 · Ajustes, copia de seguridad y limpieza en la página de opciones

- Estado: aceptada
- Fecha: 2026-11-21
- Modifica: [0017](0017-menu-de-opciones-en-la-guia.md) (punto 1: el menú ya no tiene Limpieza ni Ajustes; la
  alternativa descartada "mover a la página de opciones" se adopta para lo que no actúa sobre la pestaña) y
  [0014](0014-pagina-de-opciones-editor-de-grupos.md) (la página de opciones deja de ser solo el editor de grupos)

## Contexto

ROADMAP 6-11 (plan 2026-11-21-fase6-11-ajustes-en-opciones):
"todo lo que no es filtrar, fuera de YouTube". Hoy el menú del engranaje de la guía (`ui/panel.js`,
`#youtube-groups-menu`, ADR 0017) tiene cuatro secciones: Listas, Filtros, Limpieza y Ajustes (con la copia de
seguridad). El menú mide ~360 px, va colgado de la guía (en `/watch` y en ventanas estrechas solo se alcanza abriendo
☰) y se cierra al navegar o al hacer clic fuera. La página de opciones (`options/`, ADR 0014) ya es una pestaña
propia con el editor de grupos y las secciones de canales (sin grupo, ocultos e inactivos).

Cada sección del menú responde a una pregunta distinta:

- **Filtros** (`ctx.state.advancedFilters`, en memoria de la pestaña) y **"Reproducir lo visible"** leen las tarjetas
  de la pestaña: solo tienen sentido dentro de YouTube.
- **Listas**: "Reproducir" navega en la pestaña y el modal "Ver" enlaza vídeos; se usan mientras se navega.
- **Ajustes** (`watchedMode`, `outsideMode`, `autoMarkPercent`, ADR 0003) son preferencias persistentes y globales:
  se guardan en `youtubeSettings` y todas las pestañas ya las aplican al cambiar (`storage.onChanged`, ADR 0006).
- **Copia de seguridad** y **Limpieza** trabajan sobre todo el almacenamiento o todo el árbol, no sobre la pestaña.

Restricciones: sin dependencias, permisos ni red nuevos; reutilizar `modules/settings.js`, `modules/backup.js` y
`YouTubeGroups.analyzeGroups`/`cleanupGroups` sin duplicar lógica; sin `innerHTML` con datos.

## Decisión

1. **Ajustes, Copia de seguridad y Limpieza se mudan a la página de opciones**, cada una en su componente de
   `options/` (como `options/hidden-channels.js`): `options/settings-section.js`, `options/backup-section.js` y
   `options/cleanup-section.js`. El código de `ui/panel.js` que las implementa **se mueve** (no se copia): al terminar
   no queda en el menú.
2. **El menú del engranaje queda con Listas y Filtros**, lo que actúa sobre la pestaña, y un pie con el botón
   **"Más opciones…"**, que envía el mensaje existente `youtube-groups:open-editor` (`background.js` llama a
   `runtime.openOptionsPage()`) y cierra el menú.
3. **La página de opciones pasa a ser "YouTube Groups · Opciones"**: una sola página con **secciones y un índice**
   (`<nav>` con enlaces a anclas) en este orden: Grupos (árbol y panel "Canales"), Canales (sin grupo, ocultos e
   inactivos), Ajustes, Copia de seguridad y Limpieza. Sin pestañas.
4. **El aviso del editor** (`.options__notice`, con "Deshacer") se fija abajo en la ventana (solo CSS) para que se vea
   desde cualquier sección.
5. **Sincronización**: la sección Ajustes escucha `"settings"` en el `storage.onChanged` de `options/options.js`; las
   pestañas de YouTube siguen aplicando los ajustes por su `handleStorageChange`. La limpieza ya no llama a
   `ctx.handleGroupsRemoved`: en YouTube, el cambio de `"groups"` ya ejecuta `refreshActiveSelection`, que quita de la
   selección los grupos borrados.
6. Importar la copia sigue pidiendo `confirm` (fuera del deshacer del ADR 0022: escribe varias claves a la vez).

## Alternativas descartadas

- **Pestañas en la página de opciones** (`role="tablist"`): ocultan las secciones, piden gestión de teclado y de
  estado (qué pestaña está abierta) y sus tests; con cinco secciones, un índice con anclas basta y conserva Ctrl+F,
  el enlace directo (`#ajustes`) y el buscador del editor tal cual.
- **Mover también Listas**: "Reproducir" y "Ver" se usan mientras se navega por YouTube; sacarlas obligaría a cambiar
  de pestaña para reproducir una lista. Se puede reconsiderar si el menú vuelve a crecer.
- **Dejar "Vídeos vistos" y "Vídeos fuera del filtro" en el menú como atajo**: son ajustes persistentes y globales, no
  filtros de la pestaña; duplicarlos en dos sitios obliga a mantener dos controles sincronizados. Si la persona echa
  en falta un conmutador rápido de vistos, será un filtro nuevo en "Filtros", en otro plan.
- **Abrir la página en la sección concreta** (`#ajustes`) desde "Más opciones…": `runtime.openOptionsPage()` no admite
  ancla y `tabs.create` con la URL de la página añadiría lógica en `background.js` para poco; el índice está arriba.
- **Duplicar Ajustes y copia en ambos sitios**: dos implementaciones de lo mismo que se desincronizan.

## Consecuencias

- Se gana: el menú de YouTube es más corto y solo tiene lo que depende de la pestaña; ajustes, copia y limpieza tienen
  sitio en una pestaña propia sin el recorte del cajón de la guía; la limpieza ve el árbol completo junto al editor.
- Se pierde: cambiar un ajuste o exportar la copia exige abrir la página de opciones (un clic más desde el menú). Los
  efectos de un ajuste se ven en las pestañas de YouTube, no en la página donde se cambia.
- A vigilar: la página de opciones crece; si las secciones de canales o el editor siguen creciendo, valorar pestañas.
  La página carga ahora también `watched.js`, `settings.js`, `playlists.js` y `backup.js` (dependencias de
  `backup.js`); su orden en `options.html` debe respetar el del manifiesto.
- Nota (2026-11-22): el índice y el orden de secciones del punto 3 cambian: "Canales" se sustituye por "Canales sin
  grupo", "Canales ocultos" y "Canales inactivos". Ver [ADR 0031](0031-listas-de-canales-en-primer-nivel.md).
- Nota (2026-11-22): Ajustes vuelve al menú de la guía y el menú pierde "Más opciones…"; la página de opciones ya no
  tiene la sección Ajustes. Ver [ADR 0032](0032-ajustes-en-el-menu-y-sin-reproducir-grupo.md).
