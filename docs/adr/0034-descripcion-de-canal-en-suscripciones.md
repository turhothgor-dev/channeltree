# 0034 · Descripción del canal como campo opcional de las suscripciones conocidas

- Estado: aceptada
- Fecha: 2026-11-22
- Modifica: [0018](0018-suscripciones-conocidas-en-clave-aparte.md) (formato de la entrada de suscripción)

## Contexto

Plan 2026-11-22-fase6-18-descripcion-de-canal: la persona pide
ver, en las listas "Canales sin grupo", "Canales ocultos" y "Canales inactivos" de la página de opciones, la
descripción de cada canal, truncada a 240 caracteres.

Hoy no se guarda ninguna descripción: `youtubeSubscriptions` (ADR 0018) tiene por canal `{ name, url, firstSeen }`.
Restricciones de siempre: sin peticiones de red, sin API de YouTube, sin permisos nuevos. La única fuente es lo que
YouTube ya pinta: en `/feed/channels` cada `ytd-channel-renderer` trae un `#description` con la descripción (a veces
recortada por YouTube o vacía), y `ui/subscriptions.js` ya recorre esos renderers para anotar suscripciones.

## Decisión

1. La entrada de suscripción gana un campo **opcional** `description` (cadena no vacía):
   `{ name, url, firstSeen, description? }`. La `version` de `youtubeSubscriptions` sigue en 1.
2. **Normalización** al anotar y al leer (`normalizeSubscriptions`): espacios colapsados (`/\s+/` → un espacio),
   recortada y con un **tope de almacenamiento de 500 caracteres** (puntos de código; si se supera, 499 + "…"). Si
   el valor no es una cadena o queda vacío, la entrada se conserva **sin** `description` (nunca se descarta la
   entrada por la descripción ni cuenta como `dropped` en la copia).
3. **Fuente**: solo los `ytd-channel-renderer` de `/feed/channels` (la guía no la tiene; los resultados de búsqueda
   no son suscripciones y no se anotan, como hoy). Selector tolerante en una constante de `ui/subscriptions.js`
   (`#description` dentro del renderer): si no existe o está vacío, no se anota descripción.
4. **Fusión**: una descripción observada no vacía y distinta de la guardada la sustituye; una observación sin
   descripción (guía, renderer sin `#description` o vacío) **no** borra la guardada. La reconciliación (bajas) no
   cambia.
5. **Mostrar**: la página de opciones busca la descripción por clave de canal en las suscripciones conocidas; los
   canales ocultos o agrupados que no son suscripciones conocidas no muestran nada. Visualmente se trunca a 240
   caracteres + "…" con el texto completo guardado en `title`.
6. **Copia de seguridad** (ADR 0030): viaja dentro de `subscriptions` sin cambios de formato. Una copia antigua (sin
   descripciones) se importa igual; una versión anterior de la extensión que importe una copia nueva descarta el
   campo (su `normalizeSubscriptions` solo copia `name`, `url` y `firstSeen`).
7. **Sincronización** (ADR 0028): sin cambios; `youtubeSubscriptions` no se sincroniza, así que la cuota de
   `storage.sync` no se ve afectada.

## Alternativas descartadas

- **Clave aparte `youtubeChannelDescriptions`** (para cualquier canal, también de búsquedas): otra clave que podar,
  copiar y validar, y otro recolector; la única fuente fiable (`/feed/channels`) ya es la de las suscripciones.
- **Guardar sin tope**: con miles de suscripciones y descripciones largas la clave crecería sin límite. 500
  caracteres dejan margen para el `title` (más de los 240 visibles) y acotan el peor caso a ~1 MB.
- **Borrar la descripción cuando el renderer llega vacío**: YouTube rellena el renderer en varias pasadas; un vacío
  momentáneo borraría y reescribiría la descripción. Se acepta que un canal que quite su descripción conserve la
  anterior.
- **Subir la `version`**: el campo es opcional y los lectores antiguos lo ignoran.

## Consecuencias

- Se gana: descripción en las tres listas sin red ni permisos, con la misma frecuencia de escritura de hoy (como
  mucho una cada 2 s, en `withLock`, solo si algo cambia).
- Se pierde: hasta visitar `/feed/channels` no hay descripciones; los canales ocultos que no son suscripciones nunca
  la tienen; una descripción quitada en YouTube no se borra.
- A vigilar: si YouTube cambia el renderer de `/feed/channels`, deja de leerse sin romper nada (no se borra lo
  guardado). La verificación manual del plan comprueba el selector.
- Nota (2026-11-23): el [ADR 0042](0042-actualizacion-en-segundo-plano-desde-youtube.md) lee también la descripción en
  segundo plano (JSON de `/feed/channels`), sin visitar la página.
