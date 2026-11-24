# 0032 · Ajustes de vuelta en el menú de la guía, sin "Más opciones…" y sin "Reproducir un grupo"

- Estado: aceptada
- Fecha: 2026-11-22
- Modifica: [0025](0025-ajustes-copia-y-limpieza-en-opciones.md) (punto 1: Ajustes vuelve al menú; punto 2: el menú
  ya no tiene "Más opciones…"; punto 3: la página de opciones pierde la sección Ajustes),
  [0017](0017-menu-de-opciones-en-la-guia.md) (el menú tiene Listas, Filtros y Ajustes) y
  [0031](0031-listas-de-canales-en-primer-nivel.md) (el índice pasa de 9 a 8 enlaces)
- Sustituye: [0027](0027-reproducir-un-grupo-con-lo-observado.md) (la función se retira)

## Contexto

Tras probar en Firefox (2026-11-22, plan
2026-11-22-ajustes-al-menu-y-quitar-reproducir), la
persona pide:

1. Que los tres ajustes (`watchedMode`, `outsideMode`, `autoMarkPercent`, ADR 0003) vuelvan al menú ⚙ de la guía,
   junto a Listas y Filtros, y salgan de la página de opciones. Su efecto se ve en la pestaña de YouTube, no en la
   página de opciones (ADR 0025 ya lo apuntaba como pérdida: "un clic más").
2. Que se quite "Más opciones…" del menú. La página de opciones sigue abriéndose con el lápiz de la guía
   (`youtube-groups:open-editor`), con el atajo `Alt+Shift+G` (ADR 0026) y desde `about:addons`.
3. Que se quite el botón ▶ de cada fila de grupo de la guía (ADR 0027). "Reproducir lo visible" del menú y
   "Reproducir" de las listas se quedan.

Restricciones: sin dependencias, permisos ni red; no duplicar la lógica de la sección de ajustes; sin `innerHTML`
con datos.

## Decisión

1. **El componente de ajustes se mueve (no se copia) de `options/settings-section.js` a `ui/settings-section.js`**
   (`YouTubeGroupsSettingsSection`), como componente de `ui/` con DOM y **sin `ctx`** (igual que
   `ui/icon-picker.js`): `create(container)` → `{ load, applyStoredValue }`. Conserva su comportamiento: los
   selectores empiezan deshabilitados y se habilitan al leer; al cambiar, el selector se deshabilita hasta terminar el
   guardado (`updateSettings`) y `applyStoredValue` no lo rehabilita mientras tanto; si guardar falla, vuelve al valor
   anterior y muestra el error; si no se pueden leer, muestra el error y los deja deshabilitados. Pasa a clases y
   atributos `youtube-groups__*` (sin `id`, para no chocar con el DOM de YouTube), sin título propio (lo da el
   `<summary>`) y **sin aviso "Ajuste guardado"**: el efecto se ve al momento en la propia pestaña.
2. **El menú (`ui/panel.js`) tiene tres secciones: Listas, Filtros y Ajustes**, cada una en su `<details>`. La sección
   Ajustes se crea con el menú (al abrirlo por primera vez) y llama a `load()`. `ctx.panel.applyStoredSettings(raw)`
   delega en `applyStoredValue` si el menú existe; `content.js` lo llama en la rama `"settings"` de
   `handleStorageChange`, junto a lo que ya hace (caché y visibilidad).
3. **"Más opciones…" y el pie del menú desaparecen.** El mensaje `youtube-groups:open-editor` se queda en
   `background.js`: lo usa el lápiz. El `title` del engranaje pasa a "Opciones: listas, filtros y ajustes".
4. **La página de opciones pierde la sección Ajustes** (sección `#ajustes`, enlace del índice y carga del script).
   Sigue cargando `modules/settings.js`, que necesita `modules/backup.js`.
5. **"Reproducir un grupo" se retira por completo**: botón ▶ y su CSS, icono de interfaz `play` (nadie más lo usa),
   `ui/new-videos.js` `getGroupQueueIds` y `modules/new-videos.js` `selectGroupQueue` (sin otros usos; no se deja
   código muerto). `youtubeNewVideos` y el contador de vídeos nuevos (ADR 0019) no cambian.

## Alternativas descartadas

- **Un componente compartido cargado en el menú y en la página de opciones**: la persona pide quitarlo de la página;
  mantenerlo en los dos sitios es lo que el ADR 0025 descartó (dos controles que sincronizar).
- **Copiar el código a `ui/panel.js` (como antes del ADR 0025)**: alarga `panel.js` y pierde el componente probado;
  moverlo conserva la lógica y sus tests casi tal cual.
- **Que la sección lea `ctx.state.settings` en lugar de `getSettings()`**: acoplaría el componente a `ctx` y
  perdería el error de lectura propio; leer una vez al abrir el menú es barato.
- **Mantener el aviso "Ajuste guardado" con `ctx.toast`**: el aviso flotante de 10 s tapa la página para confirmar
  algo que ya se ve.
- **Dejar `selectGroupQueue` y `getGroupQueueIds` por si vuelve la función**: código sin uso que mantener y probar; si
  vuelve, está en el historial y en el ADR 0027.

## Consecuencias

- Se gana: cambiar un ajuste y ver su efecto ocurre en la misma pestaña; el menú pierde un botón y la guía un control
  por fila.
- Se pierde: sin "Más opciones…", la página de opciones solo se abre con el lápiz, el atajo o `about:addons`; sin ▶,
  no hay cola por grupo (queda seleccionar el grupo en suscripciones y "Reproducir lo visible").
- A vigilar: el menú vuelve a crecer (ADR 0017: ~360 px y recortable en el cajón); si no cabe, valorar plegar por
  defecto. Los ajustes solo se alcanzan si la sección de la guía aparece (riesgo del ADR 0007 y 0017).
- Nota (2026-11-22): Ajustes incluye también el subapartado "Atajos de teclado". Ver
  [ADR 0033](0033-atajos-en-el-menu-de-la-guia.md).
- Nota (2026-11-23): Ajustes incluye también "Color de acento". Ver [ADR 0040](0040-color-de-acento.md).

2026-11-24: el ADR 0045 pasa las secciones del menú a pestañas con título fijo y limita su altura a la ventana; los
atajos siguen dentro de Ajustes.
