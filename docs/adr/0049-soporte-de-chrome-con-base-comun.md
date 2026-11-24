# 0049 · Soporte de Chrome con una base de código común y manifiesto generado

- Estado: propuesta
- Fecha: 2026-11-24

## Contexto

La extensión es de Firefox (MV3, ADR 0048): usa `browser.*` con promesas, el fondo va en `background.scripts`
(página de eventos), el manifiesto lleva `browser_specific_settings.gecko` y hay piezas solo de Firefox:
`content.fetch` / `window.wrappedJSObject.fetch` + `cloneInto` (ADR 0042), `commands.openShortcutSettings` y la ruta
de `about:addons` (ADR 0026, 0033) y textos que nombran Firefox. Se quiere publicar también en la Chrome Web Store
sin mantener dos copias del código ni añadir un paso de compilación.

En Chrome MV3: el espacio de nombres es `chrome` (con promesas en las API que se usan aquí), el fondo tiene que ser un
service worker (`background.service_worker`, sin DOM y que se suspende), un escuchador de `runtime.onMessage` que
devuelve una promesa no responde de forma fiable (hay que usar `sendResponse` y devolver `true`), el `fetch` del
script de contenido va con el origen de la página (mismo origen que `www.youtube.com`, con sus cookies), no existe
`commands.openShortcutSettings` (los atajos se cambian en `chrome://extensions/shortcuts`), `storage.local` tiene
10 MB de cuota sin `unlimitedStorage` y la tienda exige iconos PNG de 16, 48 y 128 px.

## Decisión

Una sola base de código, con `manifest.json` de Firefox como fuente:

- **Alias mínimo propio**, sin dependencias: `modules/compat.js` (`YouTubeGroupsCompat`), cargado el primero en los
  tres contextos, hace `globalThis.browser ??= globalThis.chrome`, detecta el navegador por el prefijo de
  `runtime.getURL("")` (`moz-extension:` → `firefox`; si no, `chrome`) y aporta `asyncListener` (escuchador de
  mensajes con `sendResponse` y `return true`, que envuelve la respuesta o el error en un sobre marcado) y
  `sendMessage` (desenvuelve el sobre y vuelve a lanzar el error; una respuesta sin sobre pasa tal cual).
- **Detección por capacidad** en lo específico: el adaptador de `fetch` usa `content.fetch` o `wrappedJSObject` si
  existen (Firefox) y, si no, el `fetch` global con `credentials: "include"` (Chrome); "Cambiar atajos" usa
  `commands.openShortcutSettings` si existe y, en Chrome, `tabs.create({ url: "chrome://extensions/shortcuts" })`.
- **Manifiesto de Chrome generado al empaquetar** (`scripts/chrome-manifest.mjs`, funciones puras en Node sin
  dependencias): quita `browser_specific_settings`, cambia `background.scripts` por `background.service_worker`
  (`background-sw.js`, también generado, que hace `importScripts` de la misma lista y en el mismo orden), añade
  `minimum_chrome_version` y el permiso `unlimitedStorage`. `scripts/build-chrome.sh` parte del paquete de Firefox
  (mismas exclusiones de `web-ext-config.mjs`) y deja una carpeta para cargar descomprimida y un `.zip` para la tienda.
- La publicación en la Chrome Web Store la hace una persona, a mano, siguiendo `docs/RELEASE-CHROME.md`; ningún agente
  sube nada (mismo principio que el ADR 0048).

## Alternativas descartadas

- **webextension-polyfill**: resuelve el espacio de nombres y las promesas de `onMessage`, pero es una dependencia de
  ejecución que hay que copiar al paquete, está en mantenimiento y cubre mucho más de lo que se usa (seis API). El
  alias y dos funciones bastan.
- **Un único manifiesto con `scripts` y `service_worker` a la vez**: Firefox y Chrome recientes lo toleran, pero Chrome
  avisa de `browser_specific_settings` desconocido, `web-ext lint` avisa de `service_worker` y no permite añadir
  `unlimitedStorage` ni `minimum_chrome_version` solo para Chrome.
- **Un fichero `background-sw.js` versionado**: obliga a mantener la lista de scripts en dos sitios; generado a partir
  de `background.scripts`, la fuente es una.
- **Detección por `navigator.userAgent`**: frágil (navegadores derivados); el prefijo del URL de la extensión es lo
  que de verdad decide qué API hay.
- **Publicar por la API de la Chrome Web Store desde `make`**: necesita credenciales OAuth en la máquina; se puede
  añadir en un plan aparte sin cambiar esta decisión.

## Consecuencias

- `modules/compat.js` es parte de la arquitectura: todo `onMessage` que responda usa `asyncListener` y todo
  `runtime.sendMessage` que espere respuesta usa `YouTubeGroupsCompat.sendMessage`. Un test estático vigila que no
  aparezcan API solo de Firefox fuera de los puntos con alternativa.
- El fondo en Chrome se suspende a los ~30 s sin eventos: todo el estado que importa ya está en `storage`
  (`youtubeSync.dirtySince`, cerrojos), los escuchadores se registran en el nivel superior y `reconcile()` se ejecuta en
  cada arranque del service worker, más a menudo que en Firefox.
- Los textos que nombraban Firefox pasan a ser neutros o a depender del navegador.
- Misma versión (`manifest.json`) y mismo tag `vX.Y.Z` para las dos tiendas.
- El nombre es el mismo en las dos tiendas (ADR 0050); el generador no sustituye `name`.
- Hay que probar a mano en Chrome antes de cada publicación: el comportamiento del DOM y los estilos de YouTube pueden
  diferir entre navegadores.
