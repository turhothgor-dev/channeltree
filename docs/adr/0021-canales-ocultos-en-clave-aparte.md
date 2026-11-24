# 0021 · Canales ocultos en una clave aparte, aplicados en inicio, búsqueda y recomendaciones

- Estado: aceptada
- Fecha: 2026-11-21

## Contexto

ROADMAP 6-7 (plan 2026-11-21-fase6-7-canales-ocultos): la persona
quiere dejar de ver vídeos de ciertos canales en inicio, búsqueda y recomendaciones. Hoy solo hay el filtro por grupos
(que actúa en suscripciones) y los ajustes `watchedMode` y `outsideMode` (ADR 0003), que son valores de una lista
cerrada.

Restricciones: sin red propia, sin API de YouTube, sin permisos nuevos, sin automatizar acciones de la cuenta (no se
pulsa "No recomendar el canal" de YouTube), datos en `browser.storage.local`.

## Decisión

1. Los canales ocultos se guardan en una **clave nueva**, `youtubeHiddenChannels`:

   ```json
   {
     "youtubeHiddenChannels": {
       "version": 1,
       "channels": {
         "https://www.youtube.com/@ejemplo": {
           "name": "Ejemplo",
           "url": "https://www.youtube.com/@Ejemplo",
           "hiddenAt": 1763712000000
         }
       }
     }
   }
   ```

   - Clave del mapa: `YouTubeGroups.getChannelKey(url)`; `url`: igual a `normalizeChannelUrl(url)`; `name`: texto
     recortado, como mucho 100 caracteres (puede quedar vacío); `hiddenAt`: milisegundos de cuando se ocultó.
   - Escrituras en `withLock` de su clave (ADR 0005), una lectura y como mucho una escritura, solo si algo cambia.
   - `storage.onChanged` (ADR 0006) con `"hiddenChannels"` repinta en todas las pestañas y en el editor.
2. **Dónde se aplica**: solo en `home`, `search` y `watch` (`YouTubeGroupsPages.shouldHideChannels`). En `/watch`
   afecta a las tarjetas de la página (recomendaciones), nunca al vídeo que se reproduce. **No** se aplica en
   `/feed/subscriptions` (el feed que la persona eligió; ahí manda el filtro por grupos), en la página del propio canal
   ni en el resto de páginas.
3. **Cómo se aplica**: la tarjeta de un canal oculto recibe siempre `youtube-groups--hidden` (`display: none`), sin
   depender de `outsideMode` ni de `watchedMode`; en `getCardVisibility` gana a todo lo demás.
4. **Identificación**: por la URL del canal de la tarjeta; si la tarjeta no enlaza al canal (recomendaciones de
   `/watch`), por nombre exacto con el índice de nombres de `ui/cards.js`, que pasa a incluir también los canales
   ocultos (`buildChannelNameIndex(groups, extraChannels)`; un nombre con dos canales distintos no se usa).
5. **Copia de seguridad** (modifica el ADR 0006): la copia incluye el campo opcional `hiddenChannels` (contenido
   interno de la clave). Es una decisión de la persona, como los grupos, y no se regenera sola. Las copias antiguas,
   sin el campo, no tocan la clave al importar; la `version` de la copia sigue en 1. Las entradas no válidas se
   descartan y se cuentan.
6. El formato de grupos (ADR 0001) y de ajustes (ADR 0003) no cambia.

## Alternativas descartadas

- **Campo en `youtubeSettings`**: los ajustes son valores de listas cerradas que `normalizeSettings` y
  `updateSettings` validan con `ALLOWED_VALUES`; meter un mapa que crece obliga a cambiar esa validación, hace que
  cada cambio de ajuste reescriba la lista y que cada ocultación reaplique todos los ajustes.
- **Grupo especial dentro de `youtubeGroups`**: aparecería en la guía, el filtro, el editor, "Sin grupo", los vídeos
  nuevos y la limpieza; cada ocultación repintaría el árbol en todas las pestañas.
- **Ocultar también en suscripciones**: el feed de suscripciones es lo que la persona eligió ver y ya tiene el filtro
  por grupos; si no quiere ver un canal suscrito, lo natural es darse de baja. Se puede reconsiderar si se pide.
- **Pulsar "No recomendar el canal" de YouTube**: automatiza acciones de la cuenta, depende del idioma y del menú y no
  cubre la búsqueda.
- **Atenuar según `outsideMode`**: un canal oculto es una decisión explícita de no verlo; atenuarlo no la cumple.

## Consecuencias

- Se gana: ocultar canales sin red ni permisos, sin tocar el árbol de grupos, sincronizado entre pestañas y
  conservado en la copia de seguridad.
- Se pierde: una tarjeta cuyo canal no se puede identificar (sin enlace y con un nombre ambiguo o desconocido) no se
  oculta; un canal guardado como `/@handle` no casa con una tarjeta que enlaza a `/channel/UC…` (como en el ADR 0001).
  Hasta leer la clave al arrancar, las tarjetas pueden verse un instante.
- A vigilar: si YouTube cambia el marcado de las recomendaciones y deja de haber nombre de canal en la zona de
  metadatos, los canales ocultos sin enlace dejan de detectarse. Los avatares de canales ocultos que no están en
  grupos ni en suscripciones conocidas se podan (ADR 0016 y 0018): en el editor se ve la inicial.
