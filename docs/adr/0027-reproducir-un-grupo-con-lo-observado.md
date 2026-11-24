# 0027 · Reproducir un grupo con los vídeos observados y `watch_videos`

- Estado: sustituida por [0032](0032-ajustes-en-el-menu-y-sin-reproducir-grupo.md) (2026-11-22): función retirada
- Fecha: 2026-11-22

## Contexto

ROADMAP 6-13 (plan 2026-11-22-fase6-13-reproducir-un-grupo):
"un clic para ver en cola lo último de un grupo". La hoja de ruta proponía un botón ▶ en la fila del grupo que lo
seleccionara, abriera suscripciones y lanzara "Reproducir lo visible".

Restricciones: sin red propia, sin API de YouTube, sin permisos nuevos ni dependencias. Datos disponibles sin red:

- `youtubeNewVideos` (ADR 0019): vídeos vistos en `/feed/subscriptions` de canales agrupados en los últimos 30 días
  (como mucho 1000), con canal (`getChannelKey`), `seenAt` y `publishedBefore` (cota de la publicación o `null`).
- `youtubeWatched` (ADR 0002) y los canales ocultos (`youtubeHiddenChannels`, ADR 0021).
- Las tarjetas del feed; las de `/feed/subscriptions` de canales agrupados ya se anotan en `ui/new-videos.js` (en
  memoria y, cada 2 s, en `youtubeNewVideos`).

La extensión ya reproduce colas con `https://www.youtube.com/watch_videos?video_ids=ID1,ID2,...` ("Reproducir" de las
listas propias, ADR 0004, y "Reproducir lo visible"): YouTube crea una lista anónima temporal y abre el primero. No
está documentado, pero lleva años funcionando, acepta unos 50 ids y se salta los no disponibles.

## Decisión

1. **La cola sale de lo observado, no del DOM**: `YouTubeGroupsNewVideos.selectGroupQueue(state, groups, groupId,
   { watched, hiddenKeys, max })` (pura) toma los vídeos de `youtubeNewVideos` cuyo canal está en el subárbol del grupo
   (`getGroupChannelUrls` + `getChannelKey`), descarta los vistos, los de canales ocultos y los de `publishedBefore`
   `null` (directos, estrenos y tarjetas sin fecha, a menudo no reproducibles aún), los ordena del más reciente al más
   antiguo (`publishedBefore` desc, luego `seenAt` desc, luego id) y devuelve como mucho 50 ids.
2. `ui/new-videos.js` expone `getGroupQueueIds(groupId)`, que aplica antes en memoria (`applyFeedBatch`, sin escribir)
   los vídeos de esta pestaña aún no volcados: lo visible en el feed filtrado entra aunque no se haya guardado.
3. **No reconoce el grupo**: reproducir no cambia `visits` (el número de vídeos nuevos no se pone a 0); los vídeos
   bajan del contador cuando se marcan como vistos (marcado automático o manual).
4. **Botón ▶ en la fila de cada grupo y subgrupo de la guía**, entre el botón del grupo y "›"; no cambia la selección
   ni navega a suscripciones. Con cola, vuelca lo pendiente (`flushPending`) y navega en la misma pestaña a
   `buildWatchVideosUrl(ids)` (la de `modules/playlists.js`, ya probada). Sin cola, aviso (`ctx.toast`) sin navegar.
5. **`watch_videos` como único mecanismo de reproducción**, el mismo que ya usan las listas; si YouTube lo retira, se
   cambia en un sitio (`buildWatchVideosUrl`) para las tres funciones.

## Alternativas descartadas

- **Seleccionar el grupo, ir a suscripciones y "Reproducir lo visible"** (hoja de ruta): depende de esperar a que
  YouTube cargue y filtre las tarjetas (tiempos frágiles, navegación SPA), solo ve lo cargado en pantalla, cambia la
  selección de la persona y, al seleccionar, reconoce el grupo y vacía su contador.
- **Solo los vídeos "nuevos" del contador (ADR 0019)**: seleccionar el grupo los reconoce, así que la cola quedaría
  vacía justo después de mirar el grupo; "lo último sin ver" es más útil y sigue sin red.
- **Lista de YouTube con `&list=`**: exige una lista real de la cuenta (API y OAuth, o automatizar la interfaz de
  YouTube); descartado por red y permisos.
- **Volcar el grupo en una lista propia (ADR 0004)**: escribiría listas que la persona no ha creado y se reproducen
  igualmente con `watch_videos`; no aporta nada.
- **Abrir solo el primer vídeo**: no hay cola.

## Consecuencias

- Se gana: un clic desde cualquier página de YouTube con la guía visible, sin red ni permisos, sin cambiar la
  selección ni el contador, con la misma URL de cola que el resto de la extensión.
- Se pierde: la cola solo contiene lo que se ha visto en `/feed/subscriptions` en los últimos 30 días (si no se ha
  bajado por el feed, faltan los más antiguos; si nunca se visita, está vacía); la antigüedad es aproximada, así que
  el orden entre vídeos del mismo día puede no ser exacto; un vídeo borrado o privado lo salta YouTube.
- A vigilar: `watch_videos` no está documentado; si deja de funcionar, fallan también "Reproducir" de las listas y
  "Reproducir lo visible". Alternativa mínima entonces: abrir el primero con `buildVideoUrl`.

Nota (2026-11-22): la función se retira (botón ▶, `getGroupQueueIds` y `selectGroupQueue`). Ver
[ADR 0032](0032-ajustes-en-el-menu-y-sin-reproducir-grupo.md).
