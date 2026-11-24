# 0042 · Actualización en segundo plano desde la pestaña de YouTube

- Estado: aceptada
- Fecha: 2026-11-23
- Modifica: el principio "sin peticiones de red" de [0016](0016-avatares-de-canal-en-clave-aparte.md),
  [0018](0018-suscripciones-conocidas-en-clave-aparte.md), [0019](0019-videos-nuevos-por-grupo-aproximados.md),
  [0023](0023-actividad-de-canales-observada.md), [0034](0034-descripcion-de-canal-en-suscripciones.md),
  [0035](0035-bajas-de-suscripcion-propagadas.md) y [0038](0038-videos-nuevos-reconocidos-por-grupo.md) (nueva fuente
  de datos, además del DOM), y [0003](0003-formato-almacenamiento-ajustes.md) (ajuste nuevo `backgroundRefresh`)

## Contexto

Plan 2026-11-23-fase6-26-actualizacion-en-segundo-plano
(ROADMAP 6-26). Hasta ahora la extensión solo aprende lo que YouTube pinta en la pestaña: suscripciones, bajas,
descripciones y avatares exigen recorrer `/feed/channels` entera (ADR 0018, 0034, 0035, 0016); los vídeos nuevos y la
actividad de los canales, que las tarjetas pasen por delante (ADR 0019, 0038, 0023). Si la persona no visita esas
páginas, la bandeja "Canales sin grupo", las bajas, el número de vídeos nuevos y "Canales inactivos" se quedan viejos.

La persona decide relajar el principio "sin peticiones de red" con límites estrictos: **solo a `www.youtube.com`,
solo desde el script de contenido de una pestaña de YouTube**, como lo haría la propia página; sin servidores propios
ni de terceros, sin API de datos ni OAuth y **sin permisos nuevos** en `manifest.json`.

Restricciones técnicas (Firefox MV3):

- El `fetch` del script de contenido no es el de la página: para que la petición vaya con el origen y las cookies de
  la sesión de `www.youtube.com` se usa, por orden, `content.fetch` si existe y, si no (caso de las extensiones MV3
  de Firefox, donde `content` no está), `window.wrappedJSObject.fetch` llamado con `this` = `window.wrappedJSObject`;
  si ninguno existe, la actualización queda en `error/unsupported`. Los objetos que se le pasan cruzan del ámbito de
  la extensión al de la página: se clonan con `cloneInto(init, window)` si existe. La respuesta (objeto de la página)
  se copia a `{ ok, status, text() }` propio; `text()` se espera con `await` y se interpreta con `JSON.parse` en el
  ámbito de la extensión (nunca `innerHTML`, `eval` ni objetos de la página).
- Los datos están en el HTML como JSON incrustado (`var ytInitialData = {…};` y `ytcfg.set({…});`). Las páginas
  siguientes (continuaciones) se piden con `POST /youtubei/v1/browse` con el `INNERTUBE_CONTEXT` y la clave del
  `ytcfg`, y con sesión exigen la cabecera `Authorization: SAPISIDHASH …` (SHA-1 de `"<ts> <SAPISID> <origen>"`,
  con `crypto.subtle`) más `X-Origin`, como hace el cliente web.
- Varias pestañas de YouTube abiertas no deben repetir el trabajo; `withLock` (ADR 0005) solo serializa dentro de una
  pestaña.

## Decisión

1. **Actualizador en el script de contenido** (`ui/background-refresh.js`, lógica en `modules/background-refresh.js`
   y extracción en `modules/yt-data.js`, funciones puras). Con el ajuste activado, la pestaña visible lo comprueba a
   los 20 s de cargar (más 0–10 s al azar, para no competir con la página ni con otras pestañas), cada 5 min y al
   volver a la pestaña (`visibilitychange`); solo actúa si la pestaña está visible y han pasado **60 min** desde el
   último intento de cualquier pestaña.
2. **Cerrojo entre pestañas**: clave nueva `youtubeBackgroundRefresh` en `storage.local`
   (`{ version: 1, lease, lastAttemptAt, lastSuccessAt, lastResult, lastError, accountHash }`). Para ejecutar, la
   pestaña escribe `lease: { owner: <uuid>, until: ahora + 10 min }` y `lastAttemptAt`, espera 1 s y vuelve a leer;
   solo sigue si el `owner` es el suyo. Al terminar libera el cerrojo y anota el resultado. La clave no se sincroniza
   (ADR 0028) ni entra en la copia de seguridad (ADR 0030).
3. **Fuentes**, en este orden y con 1,5 s de pausa entre peticiones (tope de 30 s por petición):
   - (a) **Suscripciones**: `GET /feed/channels` y continuaciones hasta agotar la lista, con un tope de 40 páginas o
     2000 canales. De cada `channelRenderer`/`gridChannelRenderer` se toman nombre, URL (`canonicalBaseUrl`, o
     `/channel/<id>`), descripción y avatar, que se guardan con las funciones de hoy (`saveObservedSubscriptions`,
     `saveObservedAvatars`). Si la lista se ha leído **entera** (sin continuación pendiente y sin tocar el tope), se
     llama a `applyUnsubscribes` con las mismas salvaguardas del ADR 0035 (baja masiva aplazada a una segunda lectura
     completa, cambio de `@handle` por nombre). Con el tope alcanzado se guardan altas, descripciones y avatares, pero
     no bajas.
   - (b) **Feed de suscripciones**: `GET /feed/subscriptions` y hasta 3 continuaciones, parando antes si el vídeo más
     antiguo de la página es anterior a la última actualización correcta. De cada `videoRenderer`,
     `gridVideoRenderer` o `lockupViewModel` de vídeo se toman id, canal y antigüedad (`parseAge`), y se guardan con
     `saveFeedBatch` (sin reconocer ningún grupo) y `saveObservations` (con `feedVisited: true`: leer el feed cuenta
     como visitarlo, ADR 0023).
4. **Si algo falla, no se escribe nada de esa fuente**: un error de red o HTTP, un JSON que no se encuentra o una
   estructura en la que no se reconoce ningún canal o vídeo detienen la ejecución sin escribir lo que quedaba de esa
   fuente; lo ya guardado de la fuente anterior se conserva. Se anota `lastResult: "error"` y un código
   (`network`, `http`, `unrecognized`, `unsupported`). Las recolecciones por visita (ADR 0018, 0019, 0023, 0038) se
   mantienen como respaldo.
5. **Sin sesión no hace nada**: si `ytcfg` no indica sesión iniciada o no hay cookie `SAPISID`, no pide nada más ni
   escribe datos (`lastResult: "no-session"`).
6. **Misma cuenta**: la primera ejecución correcta guarda `accountHash` (SHA-256 del `DATASYNC_ID` del `ytcfg`, nunca
   el identificador en claro). Si después la cuenta es otra, no se escribe nada (`lastResult: "account-mismatch"`) y
   Ajustes ofrece "Usar esta cuenta", que borra `accountHash`. Sin esto, cambiar de cuenta en YouTube vaciaría los
   grupos en dos horas sin que la persona hiciera nada (riesgo del ADR 0035, ahora automático).
7. **Ajuste `backgroundRefresh`** (booleano, `true` por defecto) en `youtubeSettings` (ADR 0003), con su casilla
   "Actualizar en segundo plano" y una línea de estado (última actualización correcta o motivo del fallo) en Ajustes
   del menú de la guía (ADR 0032). Se sincroniza y entra en la copia como el resto de ajustes. Desactivarlo detiene una
   ejecución en curso antes de su siguiente petición.
8. **Privacidad**: nada sale de `www.youtube.com`; las peticiones son las mismas que haría la página con la sesión de
   la persona. La cookie `SAPISID` solo se lee para calcular la cabecera y no se guarda ni se registra.

## Alternativas descartadas

- **Peticiones desde el script de fondo** (`background.js`): necesitan permiso de host para `www.youtube.com` (permiso
  nuevo) y no llevan el contexto de la página; la persona pide no añadir permisos.
- **`fetch` del ámbito de la extensión en el script de contenido**: en Firefox no va como la página (origen y cookies);
  `content.fetch` sí.
- **RSS por canal** (`/feeds/videos.xml?channel_id=…`): una petición por canal y necesita el id `UC…`; con cientos de
  canales es mucha más carga que el feed de suscripciones.
- **YouTube Data API con OAuth**: credenciales, cuota y permisos de identidad (ADR 0004).
- **Abrir `/feed/channels` en una pestaña o un `iframe` oculto y leer el DOM**: visible para la persona o frágil, y
  carga la página entera con sus scripts.
- **Ejecutar en todas las pestañas o también en segundo plano**: multiplica peticiones; con el cerrojo y la
  visibilidad, una sola pestaña visible lo hace como mucho una vez por hora.
- **Escribir lo leído aunque la lectura sea parcial por un error**: una lectura a medias de `/feed/channels` no puede
  dar bajas, y escribir la mitad de un feed confunde el diagnóstico; se prefiere "todo o nada" por fuente.

## Consecuencias

- Se gana: suscripciones, bajas, descripciones, avatares, vídeos nuevos y actividad al día con solo tener YouTube
  abierto, sin pasos manuales ni permisos nuevos.
- Se pierde: la extensión ya no es "sin red": hace hasta ~45 peticiones por hora a `www.youtube.com` con listas
  grandes (normalmente 2–6). Depende de estructuras internas de YouTube (`ytInitialData`, `ytcfg`, `youtubei`,
  `SAPISIDHASH`) que cambian sin aviso.
- A vigilar: si YouTube cambia la estructura, el estado lo dice ("YouTube ha cambiado su página") y no se escribe nada;
  la extensión sigue como antes, con las recolecciones por visita. Si YouTube empieza a rechazar las continuaciones
  (401/403), no hay bajas en segundo plano, pero sí lo leído de la primera página. Las URL de canal leídas del JSON
  deben coincidir con las del DOM (`/@handle` o `/channel/UC…`); si no, la salvaguarda de baja masiva y la de cambio
  de nombre del ADR 0035 frenan el daño, y los tests lo fijan. La antigüedad sigue dependiendo del idioma (español o
  inglés).
