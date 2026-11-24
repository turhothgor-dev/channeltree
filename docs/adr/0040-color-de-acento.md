# 0040 · Color de acento personalizable para el hover de los botones

- Estado: aceptada
- Fecha: 2026-11-23
- Modifica: [0003](0003-formato-almacenamiento-ajustes.md) (nuevo campo opcional `accentColor`, sin subir `version`) y
  [0032](0032-ajustes-en-el-menu-y-sin-reproducir-grupo.md) (Ajustes del menú de la guía añade "Color de acento")

## Contexto

Plan 2026-11-23-fase6-24-opciones-tres-pestanas-y-acento.
El hover de los botones de la extensión es hoy un gris distinto en cada sitio (`rgba(128,128,128,…)` en opciones,
`--yt-spec-badge-chip-background` en la guía, `#e5e5e5`/`#3f3f3f` en el selector de iconos, `#0356bd` en
`.primary-button`/`.secondary-button`) y en algunos (menú ⚙, desplegables, aviso) no hay. La persona quiere un hover
azul común, con el color elegible por ella.

Restricciones: sin dependencias, permisos ni red; los content scripts no deben tocar atributos de `<html>` que
YouTube gestiona; los ajustes ya se sincronizan (ADR 0028) y van en la copia (ADR 0006/0030) a través de
`normalizeSettings`.

## Decisión

1. **Ajuste `accentColor`** en `youtubeSettings.settings`: cadena `#rrggbb` en minúsculas; por defecto `"#1a73e8"`
   (el azul que ya usa la página de opciones). Válido si cumple `/^#[0-9a-f]{6}$/i` (se guarda en minúsculas); si
   falta o no es válido, el de por defecto. Campo opcional nuevo: no sube `version` (ADR 0003). Viaja en la
   sincronización y la copia porque estas usan `normalizeSettings`.
2. **Validación por campo**: `modules/settings.js` pasa de listas de valores permitidos a un validador por clave
   (lista para los tres ajustes actuales, expresión regular para `accentColor`); `updateSettings` rechaza un color no
   válido con el mismo error "Ajuste inválido: accentColor.".
3. **Variables CSS** `--yg-accent` (el color) y `--yg-accent-text` (`getContrastTextColor(accent)`, `#ffffff` o
   `#0f0f0f`), definidas por un `<style id="youtube-groups-accent">` propio (`:root { … }`) que crea y actualiza
   `ui/accent.js` (`YouTubeGroupsAccent.applyAccent(doc, color)`), sin tocar el atributo `style` de `<html>`. El
   valor es un hex validado, así que no hay inyección en el CSS. Se aplica en los content scripts (al leer los ajustes
   y en la rama `"settings"` de `storage.onChanged`) y en la página de opciones (al cargar y en su `storage.onChanged`).
4. **Hover de todos los botones de la extensión** (opciones, menú ⚙ y sus modales, columna de la guía, selector de
   iconos, aviso, botones de tarjeta y del reproductor): `background: var(--yg-accent, #1a73e8)` y
   `color: var(--yg-accent-text, #ffffff)`. El estado seleccionado o pulsado (`aria-pressed`, `aria-selected`) se
   sigue distinguiendo con su estilo propio. No son botones y no cambian: el hover de las filas del árbol y de los
   canales de las listas de opciones y el de las tarjetas atenuadas. Las muestras de color del selector de iconos
   conservan su color y marcan el hover con un contorno del acento.
5. **Control**: en Ajustes del menú ⚙ de la guía, "Color de acento" con un `<input type="color">` que guarda al
   cambiar (evento `change`, no `input`) y un botón "Restablecer" (deshabilitado si ya es el de por defecto), con el
   mismo patrón de guardado de los selectores (deshabilitado mientras guarda; si falla, vuelve atrás y muestra el
   error).

## Alternativas descartadas

- **Un color por tema (claro y oscuro)**: dos ajustes y dos controles para algo que el contraste automático ya
  resuelve.
- **Paleta cerrada de colores**: más sencillo de validar, pero la persona pidió poder personalizarlo; el selector
  nativo admite cualquier color y "Restablecer" vuelve al azul.
- **`style.setProperty` en `document.documentElement`**: YouTube reescribe atributos de `<html>`; un `<style>` propio
  no compite con él.
- **Guardarlo en `localStorage` de la página de opciones**: no llegaría a las pestañas de YouTube ni se sincronizaría.

## Consecuencias

- Se gana: un hover coherente en toda la extensión y un ajuste que se sincroniza y va en la copia sin código nuevo de
  copia ni de sincronización.
- Se pierde: el hover gris discreto de YouTube en la guía; con un acento muy claro u oscuro, el hover destaca mucho
  (el texto mantiene contraste).
- Excepciones: el grupo seleccionado de la guía (`aria-pressed="true"`) y el botón "visto" pulsado conservan su color
  propio en hover, para distinguir el estado activo del hover.
- A vigilar: si el selector de color nativo de Firefox cierra el menú ⚙ al abrirse (foco fuera del documento), pasar
  a una paleta corta + "Restablecer"; reglas `:hover` nuevas deben usar `--yg-accent` (lo comprueba un test).
- Nota (2026-11-23): el [ADR 0041](0041-boton-de-icono-comun.md) saca el bullet de la guía del acento (zoom y flecha) y
  unifica los botones de icono en una clase común con ese hover.
