# 0023 · Actividad de canales observada localmente, en una clave aparte

- Estado: aceptada
- Fecha: 2026-11-21

## Contexto

ROADMAP 6-9 (plan 2026-11-21-fase6-9-canales-inactivos): detectar
canales que ya no publican para sacarlos de los grupos. Restricciones: sin peticiones de red (ni RSS ni API), sin
permisos nuevos, datos en `browser.storage.local`.

Lo que ya hay no sirve tal cual:

- `youtubeNewVideos` (ADR 0019) solo guarda vídeos de canales agrupados vistos en `/feed/subscriptions`, y los poda a
  los 30 días y a 1000 vídeos: no dice nada de "hace 6 meses".
- `youtubeSubscriptions` (ADR 0018) dice qué canales sigue la persona y desde cuándo se conocen (`firstSeen`), no
  cuándo publicaron.
- YouTube no muestra la fecha del último vídeo en `/feed/channels` (`ytd-channel-renderer` da nombre, suscriptores y
  descripción) ni en la cabecera del canal. Sí la da, como antigüedad ("hace 3 meses"), cada tarjeta de vídeo, también
  en la pestaña "Vídeos" del canal; esas tarjetas ya pasan por `ui/cards.js`.

El problema de fondo es distinguir "inactivo" de "no observado": no haber visto un vídeo de un canal solo significa
algo si se ha estado mirando el feed de suscripciones durante todo el plazo.

## Decisión

1. Clave nueva `youtubeChannelActivity`:

   ```json
   {
     "youtubeChannelActivity": {
       "version": 1,
       "lastFeedAt": 1763712000000,
       "channels": {
         "https://www.youtube.com/@ejemplo": {
           "trackedSince": 1763452800000,
           "lastPublished": 1760000000000
         }
       }
     }
   }
   ```

   - Clave del mapa: `getChannelKey`. Solo canales **conservados** (agrupados o suscripciones conocidas,
     `YouTubeGroupsAvatars.getKeptChannelKeys`); el resto se poda en cada escritura.
   - `trackedSince`: desde cuándo se observa el canal (se añade al escribir si falta).
   - `lastPublished`: la publicación más reciente vista, estimada como `ahora − antigüedad` de cualquier tarjeta de
     vídeo del canal en cualquier página (suscripciones, inicio, búsqueda, recomendaciones, pestañas del canal), o
     `null`. Solo avanza si la nueva estimación supera a la guardada en más de 1 día. Con antigüedades gruesas ("hace
     1 año", "hace 3 meses") la estimación deriva a diario hacia el presente, así que un canal puede escribirse
     aproximadamente cada 2 días, no solo cuando hay un vídeo nuevo; sigue acotado por el volcado de 2 s y por
     escribir solo si algo cambia.
   - `lastFeedAt`: última visita observada a `/feed/subscriptions`, renovada como mucho cada 12 h.
2. **Cobertura**: si al visitar suscripciones `lastFeedAt` es `null` o tiene más de 30 días, la observación se reinicia
   (`trackedSince` = ahora en todos los canales; `lastPublished` se conserva). Un hueco largo sin mirar el feed no se
   interpreta como inactividad.
3. **Canal inactivo** (umbral `U` de 3, 6 o 12 meses de 30 días; 6 por defecto, elegido en el editor y no guardado):
   está en algún grupo, es una suscripción conocida, `lastFeedAt` tiene como mucho 30 días, `ahora − max(trackedSince,
   firstSeen de la suscripción) ≥ U` y `lastPublished` es `null` o `ahora − lastPublished ≥ U`.
4. Escrituras: el recolector `ui/channel-activity.js` anota en memoria y vuelca como mucho cada 2 s en `withLock` de su
   clave (ADR 0005), con una lectura y solo si algo cambia.
5. No entra en la copia de seguridad (ADR 0006), como `youtubeNewVideos`: es observación local y se regenera.
6. Se muestra en el editor (página de opciones), sección "Canales inactivos", con quitar de todos los grupos en bloque y
   "Deshacer" por instantánea del árbol (ADR 0022). Nada se quita sin una acción de la persona.

## Alternativas descartadas

- **Ampliar `youtubeNewVideos`**: su poda (30 días, 1000 vídeos, solo agrupados) es la que la hace barata; guardar
  meses de vídeos para deducir la última publicación crece sin límite y mezcla dos significados.
- **Campo en cada canal de `youtubeGroups`**: cada observación reescribiría el árbol y repintaría guía, filtro y editor
  en todas las pestañas (mismo motivo que los ADR 0016 y 0019).
- **Leer la fecha del DOM de `/feed/channels` o de la cabecera del canal**: YouTube no la muestra ahí; las tarjetas de
  la pestaña "Vídeos" del canal ya se cubren con la observación general de tarjetas.
- **RSS o API de YouTube**: red, descartado en el ROADMAP.
- **Marcar inactivo sin exigir el plazo de observación**: el primer día todos los canales saldrían inactivos.
- **Umbral guardado en `youtubeSettings`**: añade un ajuste a la lista cerrada del ADR 0003 y a su interfaz para algo
  que solo se usa al revisar la lista; se puede añadir si se pide.
- **Mostrarlo en "Limpieza" del menú de YouTube** (idea inicial de la hoja de ruta): el menú es estrecho y la lista
  necesita selección, avatar, grupos y búsqueda, que ya están en el editor.

## Consecuencias

- Se gana: una lista de candidatos razonable sin red ni permisos, con escrituras acotadas y reversible.
- Se pierde: es aproximado. Un canal que publica poco puede no aparecer en lo que se carga del feed si no se baja; la
  antigüedad es gruesa ("hace 1 año" puede ser 23 meses) y se usa el límite favorable a "activo". Un canal agrupado que
  no es suscripción conocida, o guardado como `/@handle` y suscrito como `/channel/UC…` (ADR 0001), no se evalúa. En
  la página de un canal, una tarjeta sin enlace se atribuye a ese canal (lo hace parecer activo, nunca inactivo). Tras
  instalar o tras un hueco de más de 30 días hay que esperar el plazo completo.
- A vigilar: si YouTube cambia el texto de la antigüedad, o está en otro idioma, `lastPublished` deja de avanzar. Si
  ningún canal evaluado tiene `lastPublished`, `listInactiveChannels` devuelve el estado `no-data` y el editor explica
  que no se ha podido leer la antigüedad de ningún vídeo, sin listar nada. Si solo falla en parte, un canal sin
  ningún vídeo visto (`lastPublished` `null`) puede ser uno que solo publica Shorts o directos, o que se ve con
  otro enlace; la fila lo distingue ("Nunca se ha visto un vídeo suyo ... revisa antes de quitar") del que tiene
  "Último vídeo visto hace N meses". La persona revisa la lista antes de quitar nada y puede deshacer.
- Nota (2026-11-22): el [ADR 0030](0030-copia-de-seguridad-completa.md) incluye `youtubeChannelActivity` en la copia
  de seguridad; ya no queda fuera de ella.
- Nota (2026-11-23): el [ADR 0035](0035-bajas-de-suscripcion-propagadas.md) quita la actividad de un canal dado de baja.
- Nota (2026-11-23): el [ADR 0042](0042-actualizacion-en-segundo-plano-desde-youtube.md) añade como fuente el feed de
  suscripciones leído en segundo plano, que cuenta como visita al feed.
