# 0033 · Atajos de teclado en la sección Ajustes del menú de la guía, leídos por mensaje

- Estado: aceptada
- Fecha: 2026-11-22
- Modifica: [0026](0026-atajos-de-teclado-con-commands.md) (punto 4: la lista de atajos pasa de la página de opciones
  al menú de la guía y se lee a través de `background.js`),
  [0032](0032-ajustes-en-el-menu-y-sin-reproducir-grupo.md) (la sección Ajustes del menú incluye el subapartado
  "Atajos de teclado") y [0031](0031-listas-de-canales-en-primer-nivel.md) (el índice de la página de opciones pasa de
  8 a 7 enlaces)

## Contexto

Tras mover los ajustes al menú ⚙ de la guía (ADR 0032), la persona pide (2026-11-22, plan
2026-11-22-atajos-al-menu) mover también "Atajos de teclado" a ese menú,
dentro de Ajustes, y quitarlo de la página de opciones.

Hoy `options/shortcuts-section.js` llama directamente a `browser.commands.getAll()` y
`browser.commands.openShortcutSettings()`. En el menú eso no es posible: es un script de contenido y **los scripts de
contenido no tienen `browser.commands`** (solo `runtime`, `storage`, `i18n`, `dom`...). Sí pueden hablar con
`background.js` por `runtime.sendMessage`, como ya hacen con `youtube-groups:open-editor`.

`commands.openShortcutSettings()` (Firefox 137+) abre `about:addons` en la página de atajos. No está claro que funcione
fuera de un gesto de la persona cuando se llama desde el fondo en respuesta a un mensaje (el gesto no se propaga por
`runtime.sendMessage`). Restricciones: sin dependencias, permisos ni red; no duplicar la lógica; sin `innerHTML` con
datos.

## Decisión

1. **`background.js` atiende dos mensajes nuevos**:
   - `youtube-groups:get-shortcuts` → `{ commands: [{ name, description, shortcut }], canOpenSettings }`: los comandos
     de `commands.getAll()` copiados a objetos planos con cadenas (`shortcut` vacío si no está asignado) y si existe
     `commands.openShortcutSettings`. Si `getAll()` falla, la promesa se rechaza.
   - `youtube-groups:open-shortcut-settings` → `{ opened }`: `true` si `openShortcutSettings` existe y se resuelve;
     `false` si no existe o rechaza (se registra con `console.error`, sin rechazo sin capturar).
2. **El componente se mueve (no se copia) de `options/shortcuts-section.js` a `ui/shortcuts-section.js`**
   (`YouTubeGroupsShortcutsSection`), componente de `ui/` con DOM y **sin `ctx`** (como `ui/settings-section.js`):
   `create(container)` → `{ load }`. Pide los atajos por mensaje en lugar de usar `browser.commands`. Clases
   `youtube-groups__*`, sin `id`.
3. **El subapartado vive dentro de la sección Ajustes del menú** (`ui/panel.js`), bajo los tres selectores, con el
   título "Atajos de teclado". **Lectura perezosa**: no se pide nada al cargar la página; `load()` se llama cada vez que
   el menú pasa de cerrado a abierto (así refleja un atajo cambiado en `about:addons` sin recargar YouTube). Si llegan
   respuestas desordenadas, solo se pinta la de la última petición. Si el fondo no responde (respuesta vacía o con
   forma inesperada) o rechaza, se muestra "No se pudieron leer los atajos: …".
4. **Texto de ruta siempre visible**: "Se cambian en about:addons → ⚙ → Gestionar atajos de teclado de extensiones."
   El botón "Cambiar atajos" se añade solo con `canOpenSettings`; si la respuesta es `opened: false` o falla, muestra
   un error que remite a esa ruta. Así, si Firefox exige un gesto y la llamada desde el fondo no abre nada, la persona
   tiene siempre el camino manual (se comprueba a mano, V2 del plan).
5. **La página de opciones pierde la sección Atajos** (sección `#atajos`, enlace del índice, script y estilos): el
   índice queda en **siete** enlaces.

## Alternativas descartadas

- **Sección propia "Atajos" en el menú**: la persona prefiere que esté dentro de Ajustes; un cuarto `<details>` alarga
  el menú (ADR 0017, ~360 px) para dos líneas de contenido.
- **Mantener la sección en las dos páginas**: es lo que el ADR 0032 descartó para los ajustes (dos sitios que
  mantener); la persona pide quitarla de opciones.
- **Abrir la página de atajos con `tabs.create({ url: "about:addons" })`**: las extensiones no pueden abrir URL
  `about:` privilegiadas; `openShortcutSettings` es la única vía.
- **Leer los atajos una sola vez al crear el menú**: quedaría desfasado si la persona cambia un atajo con la pestaña de
  YouTube abierta; un mensaje por apertura es barato.
- **Escuchar `commands.onChanged` y avisar a las pestañas**: más mensajes y estado para un dato que se ve rara vez;
  releer al abrir basta.
- **Permiso nuevo o `tabs`**: no hace falta; `runtime.sendMessage` no exige permisos.

## Consecuencias

- Se gana: ajustes y atajos en el mismo sitio, en la pestaña de YouTube; la página de opciones queda centrada en
  grupos, canales, copia, sincronización y limpieza.
- Se pierde: abrir el menú hace un viaje de mensajes al fondo; sin fondo disponible, los atajos muestran un error (los
  ajustes siguen funcionando). Si `openShortcutSettings` no funciona sin gesto, el botón muestra un error y queda la
  ruta manual.
- A vigilar: el menú crece (ADR 0032); si no cabe, plegar Ajustes por defecto. `background.js` suma dos mensajes (ADR
  0026 ya avisaba): si crece más, separar los manejadores.

2026-11-24: el ADR 0045 pasa las secciones del menú a pestañas con título fijo y limita su altura a la ventana; los
atajos siguen dentro de Ajustes.
