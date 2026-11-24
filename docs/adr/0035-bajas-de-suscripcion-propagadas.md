# 0035 · Bajas de suscripción propagadas a grupos y datos derivados

- Estado: aceptada
- Fecha: 2026-11-23
- Modifica: [0018](0018-suscripciones-conocidas-en-clave-aparte.md) (qué hace una baja y cuándo se reconcilia),
  [0016](0016-avatares-de-canal-en-clave-aparte.md), [0019](0019-videos-nuevos-por-grupo-aproximados.md) y
  [0023](0023-actividad-de-canales-observada.md) (se olvidan los datos del canal dado de baja)

## Contexto

La persona deja de suscribirse a un canal y el canal "sigue en todos lados": en sus grupos y subgrupos, en "Canales
sin grupo", en "Canales inactivos" y en el recuento de vídeos nuevos (ROADMAP 6-19, plan
2026-11-23-fase6-19-bajas-de-suscripcion). Hay dos causas:

1. **Por diseño** (ADR 0018), una baja solo borra la entrada de `youtubeSubscriptions`; nunca toca los grupos ni el
   resto de claves.
2. **Por fallo**, la baja ni siquiera llega a `youtubeSubscriptions`:
   - `ui/subscriptions.js` solo reconcilia si ve una mutación de la lista de `/feed/channels` **después** de
     `startVisit()`, que se llama en `yt-navigate-finish`. Si YouTube ya ha pintado la lista antes de ese evento (o
     antes de que cargue el script de contenido, en una carga completa) y la lista no tiene continuación, no llega
     ninguna mutación más y la visita no reconcilia nunca.
   - Tras reconciliar, `reconcile()` saca de `noted` las claves dadas de baja; si la guía de la pestaña sigue
     mostrando el canal (YouTube no la refresca hasta recargar), la siguiente lectura de la guía lo vuelve a anotar
     y lo **da de alta otra vez** a los 2 s.

Restricciones de siempre: sin red ni API, sin permisos nuevos, una escritura por clave en `withLock` (ADR 0005). La
persona no quiere ver nada: ni aviso, ni "Deshacer", ni confirmación.

## Decisión

1. **Baja** = canal que estaba en `youtubeSubscriptions` y no aparece en una **lectura completa** de `/feed/channels`
   (la de ADR 0018: lista sin continuación, todos los renderers anotados y 3 s sin canales nuevos).
2. **Lista fresca**: el estado "la lista de esta visita es nueva" se reinicia en `yt-navigate-start` (no en
   `yt-navigate-finish`) y empieza a `true` en una carga completa de la página, porque entonces no hay lista anterior
   que YouTube pueda reutilizar. Así una lista pintada entre `yt-navigate-start` y `yt-navigate-finish` cuenta.
3. **La guía no resucita bajas**: las claves dadas de baja en la sesión quedan en un conjunto `removedKeys`; la lectura
   de la guía las ignora hasta que `/feed/channels` vuelva a mostrar el canal.
4. **Propagación automática y silenciosa**: cada baja se quita de todos los grupos y subgrupos (`youtubeGroups`), de
   `youtubeChannelActivity`, de los vídeos de `youtubeNewVideos` y de `youtubeAvatars`, y por último de
   `youtubeSubscriptions` ("Canales sin grupo" e inactivos se derivan de ellas). **No** se toca
   `youtubeHiddenChannels` (ADR 0021): ocultar es una elección explícita, independiente de la suscripción.
5. **Orden y atomicidad práctica**: cada clave se lee, se cambia y se escribe una vez en su `withLock`, sin anidar
   bloqueos. `youtubeSubscriptions` se escribe la **última**: si falla una escritura anterior, las bajas siguen ahí y
   la siguiente lectura completa lo reintenta.
6. **Salvaguardas contra lecturas defectuosas**:
   - Sin canales vistos no hay lectura completa (ya lo exige `isChannelListComplete`).
   - **Baja masiva**: si las bajas de una lectura son más de 10 **y** más del 25 % de las suscripciones conocidas, no
     se aplican; se guardan como pendientes en la clave nueva `youtubePendingUnsubscribes`
     (`{ version: 1, keys: [<getChannelKey>], since }`, caduca a los 30 días) y tampoco se borran de
     `youtubeSubscriptions`. La siguiente lectura completa aplica las que sigan faltando (confirmadas dos veces) y
     trata el resto con la regla normal.
   - **Cambio de URL**: si una baja tiene exactamente el mismo nombre (sin mayúsculas ni espacios de más) que un canal
     visto en la lectura con otra clave, se trata como cambio de `@handle`: sale de `youtubeSubscriptions` (como hoy)
     pero **no** se quita de los grupos ni de los demás datos.
7. **Sincronización** (ADR 0028): el cambio en los grupos es un cambio local más y el replicador lo envía. Los demás
   dispositivos reciben los grupos sin el canal; su `youtubeSubscriptions` (que no se sincroniza) se corrige en su
   próxima lectura completa. `youtubePendingUnsubscribes` no se sincroniza ni entra en la copia de seguridad.
   Para que otro dispositivo con la réplica antigua no reintroduzca la baja, `applyUnsubscribes` anota los canales que
   salen de los grupos en `youtubeRecentUnsubscribes` (`{ version: 1, keys: { clave: fechaMs } }`, caduca a los 30
   días, tampoco se sincroniza ni entra en la copia). Al importar grupos remotos (`pull` de `modules/sync.js`) se
   quitan de ellos esas claves; el hash guardado es el de la réplica recibida, así que la diferencia se reenvía
   corregida por el flujo normal. Un canal que vuelve a verse en `/feed/channels` sale de la anotación.
   Además, cada pestaña anota como baja (`removedKeys`) las claves que otra pestaña saca de `youtubeSubscriptions`
   (`storage.onChanged`), y `since` de los pendientes es la lectura que aplazó el lote (se reinicia si el lote cambia).
8. **Sin deshacer**: no hay aviso ni "Deshacer". Un "Deshacer" de otra acción abierto en la página de opciones dirá que
   los grupos han cambiado (ADR 0022). La red de seguridad es la copia de seguridad (ADR 0030).
9. **No se lee el botón "Anular suscripción"** de YouTube: su estado y su diálogo dependen del idioma y del componente
   (motivo ya descartado en el ADR 0018), y un falso positivo borraría el canal de los grupos sin aviso.

## Alternativas descartadas

- Preguntar o avisar con "Deshacer": la persona lo ha descartado.
- Quitar de los grupos cualquier canal agrupado que no esté en la lectura: borraría canales que nunca fueron
  suscripciones (se pueden agrupar canales desde cualquier vídeo).
- Detectar la baja con el botón de suscripción o su diálogo: depende del idioma y del componente; sin red no se puede
  comprobar.
- Bloquear siempre las bajas masivas: si la persona deja de seguir muchos canales a la vez, nunca se aplicarían.
- Guardar el pendiente de baja masiva solo en memoria: se pierde al recargar y la confirmación nunca llegaría.
- Reutilizar `YouTubeGroupsEditor.removeChannelsEverywhere` cargando `modules/group-editor.js` en los scripts de
  contenido: añadiría ~1200 líneas a cada pestaña por una función de 20; la función pura pasa a `modules/groups.js` y
  el editor delega en ella.

## Consecuencias

- Se gana: una baja hecha en YouTube desaparece de toda la extensión tras recorrer `/feed/channels` entera, sin
  pasos manuales.
- Se pierde: la información de grupo de ese canal (si se vuelve a suscribir, hay que reasignarlo); solo se recupera
  con una copia de seguridad.
- A vigilar: en un mismo perfil con dos cuentas de YouTube, basta **una** lectura completa de `/feed/channels` con la
  otra cuenta para quitar de los grupos los canales que no compartan cuando son 10 o menos, o un 25 % o menos de los
  conocidos (la salvaguarda masiva solo aplaza lotes mayores, y entonces exige dos lecturas). Se acepta porque la
  persona pidió quitar sin preguntar; la recuperación es la copia de seguridad. Un canal
  agrupado con una forma de URL distinta de la de `/feed/channels` (`/channel/UC…` frente a `/@handle`) no se quita
  (no hay falso positivo, pero tampoco baja). Si YouTube cambia los selectores de `/feed/channels`, no hay lectura
  completa y no se borra nada.
- Nota (2026-11-23): el [ADR 0042](0042-actualizacion-en-segundo-plano-desde-youtube.md) aplica las mismas
  salvaguardas a las bajas leídas en segundo plano y las pausa si cambia la cuenta de YouTube.
