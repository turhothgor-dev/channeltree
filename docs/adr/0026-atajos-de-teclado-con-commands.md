# 0026 · Atajos de teclado con `commands` del manifiesto

- Estado: aceptada
- Fecha: 2026-11-22

## Contexto

ROADMAP 6-12 (plan 2026-11-22-fase6-12-atajos-de-teclado):
abrir el editor de grupos y limpiar la selección sin ratón. Hoy solo se puede con el lápiz "Editar grupos" y el botón
"Limpiar selección" de la sección de la guía (`ui/guide-section.js`), que no se ven si la guía está cerrada (fuera de
`/feed/subscriptions` o por debajo de 792 px, ADR 0012). La hoja de ruta pide pocos atajos y que no choquen con los de
YouTube (teclas sueltas y `Shift+N`/`Shift+P`, `k`, `j`, `l`, `f`, `m`, `/`, números…).

Restricciones: sin dependencias, red ni permisos nuevos (`tests/manifest.test.js` comprueba
`permissions == ["storage"]`). `background.js` ya abre la página de opciones con `youtube-groups:open-editor`
(ADR 0014) y la selección activa vive en memoria de cada pestaña (`ctx.state.activeSelection`, ADR 0007/0011).

## Decisión

1. Los atajos se declaran en la clave **`commands`** de `manifest.json` y los recibe `background.js` con
   `browser.commands.onCommand`:
   - `open-editor` · "Abrir el editor de grupos" · `suggested_key.default` **`Alt+Shift+G`** → `runtime.openOptionsPage()`
     (lo mismo que el mensaje `youtube-groups:open-editor`).
   - `clear-selection` · "Limpiar la selección de grupos de la pestaña" · **`Alt+Shift+X`** → `tabs.query({ active:
     true, currentWindow: true })` y `tabs.sendMessage(id, { type: "youtube-groups:clear-selection" })`. Si la pestaña
     activa no tiene el script de contenido (no es YouTube), el envío se rechaza y se ignora en silencio.
2. **Sin permisos nuevos**: en Firefox, `tabs.query` sin el permiso `tabs` devuelve las pestañas sin `url` ni `title`
   (solo se usa el `id`), y `tabs.sendMessage` no exige permiso; el destino lo filtra el propio mensaje, que solo
   escucha `content.js` en `*://www.youtube.com/*`. No hace falta `activeTab`.
3. `content.js` escucha `browser.runtime.onMessage` y, con `youtube-groups:clear-selection`, si hay selección llama a
   `setActiveSelection([])` (igual que el botón, sin navegar) y avisa con `ctx.toast.show("Selección limpiada")`; sin
   selección no hace nada.
4. Los atajos se documentan donde se pueden leer de verdad: una sección **"Atajos de teclado"** de la página de
   opciones lista los actuales con `browser.commands.getAll()` (los que la persona haya cambiado, o "Sin asignar") y
   ofrece "Cambiar atajos" con `browser.commands.openShortcutSettings()` si existe (si no, explica la ruta
   `about:addons` → engranaje → "Gestionar atajos de teclado de extensiones").

## Alternativas descartadas

- **`keydown` en `content.js`**: chocaría con los atajos de YouTube y de la página (habría que excluir campos de texto,
  el reproductor y el modo de pantalla completa), no sería configurable por la persona y solo funcionaría con el foco
  dentro de la página de YouTube.
- **Permiso `tabs` o `activeTab`**: no hacen falta para enviar el mensaje a la pestaña activa; añadir `tabs` mostraría
  al instalar "Acceder a las pestañas del navegador" para nada.
- **Poner el atajo en el `title` del lápiz y del botón de limpiar**: el script de contenido no puede leer
  `commands.getAll()` y el atajo es configurable; un texto fijo quedaría desfasado en cuanto la persona lo cambiara.
  Pedírselo a `background.js` por mensaje añadiría estado asíncrono a la guía para poco.
- **Más atajos** (siguiente grupo, abrir el menú, marcar visto): fuera del alcance pedido; el mecanismo permite
  añadirlos después con una entrada en `commands` y un `case` en `background.js`.

## Consecuencias

- Se gana: los dos atajos funcionan con el foco en cualquier parte del navegador (también en campos de texto y en el
  reproductor), no chocan con YouTube y la persona puede cambiarlos o quitarlos en `about:addons`.
- Se pierde: si Firefox u otra extensión ya usa `Alt+Shift+G` o `Alt+Shift+X`, el atajo sugerido no se asigna y queda
  "Sin asignar" hasta que la persona elija otro (la sección de opciones lo muestra). En macOS, `Alt` es `Option` y
  `Option+Shift+letra` escribe caracteres; el atajo los tapa mientras esté asignado.
- A vigilar: `background.js` deja de ser solo de mensajes; si crece, separar los manejadores. Limpiar la selección
  solo afecta a la pestaña activa (la selección es por pestaña).
- Nota (2026-11-22): la lista de atajos pasa de la página de opciones a Ajustes del menú de la guía y se lee por
  mensaje a `background.js`. Ver [ADR 0033](0033-atajos-en-el-menu-de-la-guia.md).
