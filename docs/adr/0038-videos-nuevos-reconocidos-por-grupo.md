# 0038 · Vídeos nuevos reconocidos por grupo y observados en cualquier página

- Estado: aceptada
- Fecha: 2026-11-23
- Modifica: [0019](0019-videos-nuevos-por-grupo-aproximados.md) (qué se observa, cuándo se reconoce y cómo se cuenta)
  y el punto 3 de [0036](0036-seleccion-unica-y-bullet-desplegable-en-la-guia.md) (el número sigue sumando el grupo y
  sus descendientes, pero cada grupo con su propio reconocimiento)

## Contexto

Plan 2026-11-23-fase6-23-videos-nuevos-e-iconos-de-la-guia.
Con la versión del ADR 0036 instalada (pestañas de opciones y bullet de color visibles), la persona sigue sin ver
nunca un número en el bullet de los grupos. Leyendo el código salen tres causas que, juntas, dejan el contador casi
siempre a 0:

1. **Reconocimiento heredado**: `countNewVideos` usa para cada canal la visita **más reciente de toda la cadena** de
   grupos que lo contiene (el grupo, sus antepasados y, de hecho, cualquier otro grupo con el mismo canal). Aplicar un
   subgrupo pone a 0 al padre y a los grupos que comparten canales; aplicar el padre pone a 0 a todos sus subgrupos.
   El test actual `countNewVideos cuenta en el subárbol y se pone a 0 al visitar` lo fija así.
2. **Reconocimiento continuo**: mientras un grupo está seleccionado en `/feed/subscriptions`, cada volcado (cada 2 s
   con tarjetas nuevas) renueva su visita. Como la guía solo está fija en suscripciones (ADR 0012), lo habitual es
   tener algo seleccionado allí, y por el punto 1 eso vacía también a padres, hijos y grupos con canales compartidos.
3. **Solo se observa `/feed/subscriptions`**: los vídeos que aparecen en inicio, búsqueda, recomendaciones o la página
   de un canal nunca se anotan. Y si la antigüedad de la tarjeta se pinta después del primer volcado, el vídeo queda
   con `publishedBefore: null` para siempre (`noteVideo` no la reintenta) y no cuenta nunca.

La persona pide esta semántica: el número de un grupo son los vídeos nuevos vistos en tarjetas por la extensión, de
canales del grupo y de sus subgrupos, desde la última vez que se aplicó **el filtro de ese grupo**; solo pasa a 0 al
aplicar ese filtro; aplicar el padre no pone a 0 a los hijos ni al revés; visitar inicio sin filtro no reconoce nada.

## Decisión

1. **Reconocimiento propio de cada grupo**: `ack(G) = visits[G]` si existe; si no, `since`. Un vídeo `v` cuenta para
   `G` si su canal está en el subárbol de `G` (el grupo o cualquier descendiente), no está en `youtubeWatched`,
   `seenAt > ack(G)` y `publishedBefore` no es `null` y es `> ack(G)`. No se mira la visita de ningún otro grupo:
   - aplicar el padre `P` pone a 0 solo a `P`; sus subgrupos conservan su número;
   - aplicar el subgrupo `H` pone a 0 solo a `H`; `P` sigue contando los vídeos de `H` posteriores a `ack(P)`;
   - aplicar `A` no cambia el número de `B` aunque compartan canales.
   El número sigue siendo de vídeos distintos (un vídeo de un canal que está en dos subgrupos cuenta una vez en el
   padre).
2. **Cuándo se aplica el filtro de un grupo**: al seleccionarlo en la guía (o al recuperar la selección pendiente tras
   navegar a suscripciones), y mientras siga seleccionado, en cada volcado, **en cualquier página** (lo que se ve con
   el filtro puesto no es nuevo para ese grupo). Seleccionar un canal suelto, "Sin grupo", limpiar la selección o
   navegar sin selección (inicio, `/watch`, etc.) no reconoce nada.
3. **Qué se observa**: los vídeos de canales agrupados de las tarjetas que la extensión procesa en inicio,
   suscripciones, búsqueda, `/watch` (recomendaciones) y páginas de canal (`YouTubeGroupsPages.shouldNoteNewVideos`).
   No en `/feed/channels` (no hay vídeos), Shorts ni otras páginas. La condición `publishedBefore > ack(G)` sigue
   impidiendo que vídeos antiguos (de una página de canal o de recomendaciones) cuenten como nuevos.
4. **Antigüedad tardía**: si un vídeo se anotó sin antigüedad y ya se volcó, un procesado posterior de su tarjeta con
   antigüedad legible la vuelve a anotar; `applyFeedBatch` completa `publishedBefore` del vídeo existente (ya lo
   hace) sin cambiar `seenAt`.
5. El formato de `youtubeNewVideos` no cambia (`version: 1`, `since`, `videos`, `visits`), ni la poda, ni el tope, ni
   la copia de seguridad (ADR 0030), ni las bajas (ADR 0035). No hay migración: las visitas guardadas se reinterpretan
   como reconocimiento propio de cada grupo.

## Alternativas descartadas

- **Mantener la herencia y quitar solo el reconocimiento continuo**: aplicar un subgrupo seguiría vaciando al padre y
  a los grupos con canales compartidos; es justo lo que la persona pide quitar.
- **Que el padre herede el reconocimiento de sus hijos solo para los vídeos de esos hijos**: es la alternativa a la
  regla 1 que la persona dejó a elección; se descarta porque el padre perdería números sin haberse aplicado su filtro.
- **Reconocer solo al pulsar (sin renovar mientras está seleccionado)**: los vídeos que se cargan mientras se mira el
  grupo (desplazarse en suscripciones) aparecerían como nuevos de ese mismo grupo justo al quitar el filtro.
- **Observar solo suscripciones, como antes**: quien navega sobre todo por inicio no vería nunca un número.
- **Contar sin la antigüedad (`seenAt` solo)**: al observar páginas de canal y recomendaciones, contarían vídeos de
  hace meses.

## Consecuencias

- Se gana: cada grupo y subgrupo muestra sus novedades hasta que se aplica su propio filtro; el número aparece aunque
  la persona no abra suscripciones sin filtro.
- Se pierde: el número del padre puede incluir vídeos que ya se vieron con el filtro del hijo (se aceptan: la persona
  lo pidió así). Más tarjetas observadas implican más volcados (siguen siendo como mucho uno cada 2 s y solo con
  vídeos de canales agrupados).
- A vigilar: la antigüedad sigue siendo aproximada ("hace 1 día" puede ser 47 h); un grupo creado después cuenta desde
  `since`; si YouTube cambia el texto de la antigüedad, no cuenta nada (ya en ADR 0019).
- Nota (2026-11-23): el [ADR 0043](0043-videos-nuevos-reconocidos-al-salir-del-filtro.md) cambia qué grupos reconoce
  un filtro (también sus subgrupos) y cuándo (al salir del filtro, no al aplicarlo).
- Nota (2026-11-23): el [ADR 0042](0042-actualizacion-en-segundo-plano-desde-youtube.md) añade la lectura del feed en
  segundo plano como fuente de vídeos, sin reconocer ningún grupo.
