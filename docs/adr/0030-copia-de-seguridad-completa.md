# 0030 · Copia de seguridad completa: suscripciones, vídeos nuevos y actividad

- Estado: aceptada
- Fecha: 2026-11-22
- Modifica: [0006](0006-sincronizacion-pestanas-y-copia.md) (contenido de la copia y límite de tamaño),
  [0018](0018-suscripciones-conocidas-en-clave-aparte.md), [0019](0019-videos-nuevos-por-grupo-aproximados.md) y
  [0023](0023-actividad-de-canales-observada.md) (las tres decían que su clave no entra en la copia)

## Contexto

Plan 2026-11-22-copia-de-todo: la persona pide "backup y exportación de
todo". La copia (ADR 0006, ampliada por 0016 con `avatars`, 0021 con `hiddenChannels` y 0024 con las `keywords` de
los grupos) lleva grupos, vistos, ajustes, listas, avatares y canales ocultos. Quedan fuera tres claves que se
decidió no copiar por ser observaciones que se regeneran: `youtubeSubscriptions` (ADR 0018), `youtubeNewVideos`
(ADR 0019) y `youtubeChannelActivity` (ADR 0023). En la práctica, al cambiar de equipo o reinstalar se pierde la
bandeja "Suscripciones sin grupo" hasta visitar `/feed/channels`, los recuentos de vídeos nuevos y meses de
observación de actividad, que no se pueden recuperar.

Hay además dos datos que son de cada dispositivo: el estado de la sincronización `youtubeSync` (ADR 0028: id del
dispositivo, último hash, estado) y las preferencias de vista de la página de opciones en `localStorage` (ADR 0029).

El fichero se rechaza a partir de 5 MB (ADR 0006). Con muchos vistos (~70 caracteres por vídeo con la sangría
actual), las tres claves nuevas (hasta ~1 MB con miles de canales) acercan una copia grande a ese límite.

## Decisión

1. **La copia incluye tres campos opcionales nuevos**, con el contenido interno de cada clave (sin su envoltorio
   `{ version, ... }`), como `hiddenChannels`:
   - `subscriptions`: mapa `<getChannelKey>` → `{ name, url, firstSeen }` (ADR 0018).
   - `newVideos`: `{ since, videos, visits }` (ADR 0019).
   - `channelActivity`: `{ lastFeedAt, channels }` (ADR 0023).
2. **Validación** con los normalizadores existentes (`normalizeSubscriptions`, `normalizeNewVideos`,
   `normalizeActivity`). Si el campo existe pero no es un objeto (o su mapa interno `videos`, `visits` o `channels`
   no lo es), se rechaza el fichero entero sin escribir nada. Las entradas sueltas que el normalizador descarta se
   cuentan en `dropped` (entradas de entrada menos entradas de salida). Un `since` o `lastFeedAt` no válido pasa a
   `null` sin contar.
3. **Compatibilidad**: la `version` del formato sigue en 1. Una copia antigua sin alguno de los campos no toca esa
   clave al importar. Una versión anterior de la extensión que importe una copia nueva ignora los campos que no
   conoce.
4. **Importar sigue reemplazando con confirmación** (ADR 0006 y 0025), clave a clave en su `withLock`. Las
   suscripciones se escriben antes que los avatares, para que una poda de avatares concurrente (ADR 0016 y 0018) ya
   vea las suscripciones importadas.
5. **Quedan fuera, por ser del dispositivo**: `youtubeSync` (copiarlo duplicaría el `deviceId` y el hash de otro
   equipo) y las preferencias de vista de `localStorage`. Si una copia trae campos desconocidos, se ignoran. La
   sección "Copia de seguridad" lo dice con un texto "Incluye… / No incluye…".
6. **Sincronización**: los campos nuevos no se sincronizan (ADR 0028); el replicador sigue vigilando solo grupos,
   ajustes y canales ocultos, así que importar no lo despierta más que hoy (un envío con debounce por los grupos,
   ajustes y ocultos importados; el hash evita el eco).
7. **Tamaño**: el límite de lectura sube de 5 MB a 20 MB (caracteres del texto) y el mensaje de error lo dice
   ("La copia supera el tamaño máximo (20 MB)."). Exportar comprueba el mismo límite y falla con un mensaje claro en
   lugar de descargar una copia que no se podría importar. Se mantiene la sangría de 2 espacios.

## Alternativas descartadas

- **Subir la versión a 2**: obligaría a mantener dos lectores y rechazaría las copias nuevas en versiones antiguas
  sin necesidad; los campos opcionales ya funcionan para `avatars` y `hiddenChannels`.
- **Mantener fuera las tres claves** (ADR 0018, 0019 y 0023): no cumple "todo"; la actividad acumulada durante meses
  no se regenera.
- **Incluir `youtubeSync` y las preferencias de vista**: son de cada dispositivo; importar el estado de sync de otro
  equipo rompería la detección de eco y la elección traer/enviar.
- **Importar fusionando las claves observadas**: reglas distintas por clave; el ADR 0006 ya eligió reemplazar.
- **Exportar sin sangría para reducir tamaño**: el fichero deja de ser legible a mano por una ganancia que no hace
  falta con el límite nuevo.
- **Sincronizar también las claves nuevas**: no caben en la cuota de `storage.sync` y cambian a cada visita.

## Consecuencias

- Se gana: una copia restaura todo lo que la persona ve en las opciones y en la guía (bandeja sin grupo, recuentos,
  canales inactivos) sin esperar a que se vuelva a observar.
- Se pierde: el riesgo que señalaba el ADR 0018: una copia importada en otro perfil o con otra cuenta trae
  suscripciones ajenas hasta la siguiente visita completa a `/feed/channels`, que da de baja las que no aparecen. Los
  vídeos nuevos y la actividad importados pueden estar desfasados; la poda de 30 días (ADR 0019) y el reinicio de la
  observación tras 30 días sin visitar el feed (ADR 0023) los corrigen solos. El fichero crece.
- A vigilar: si los vistos siguen creciendo y una copia se acerca a 20 MB, reconsiderar exportar sin sangría o
  dividir la copia. Si se añade otra clave en `storage.local`, decidir explícitamente si entra en la copia.
