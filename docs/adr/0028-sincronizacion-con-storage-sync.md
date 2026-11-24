# 0028 · Sincronización opcional de grupos y ajustes con `storage.sync`, troceada y desde el fondo

- Estado: aceptada
- Fecha: 2026-11-22
- Modifica: [0006](0006-sincronizacion-pestanas-y-copia.md) (punto 2 y alternativa descartada `storage.sync`: entre
  dispositivos se añade una réplica automática opcional; la copia de seguridad manual se mantiene)

## Contexto

ROADMAP 6-14 (plan 2026-11-22-fase6-14-sincronizacion): "grupos y
ajustes en todos los dispositivos, si cabe en la cuota". El ADR 0006 descartó `storage.sync` y dejó la copia de
seguridad manual como único traslado, con un "A vigilar" que pide un ADR nuevo si se quiere sincronización automática.

Restricciones de Firefox para `browser.storage.sync` (cubierto por el permiso `storage`, sin permisos nuevos):

- Cuota: 102 400 bytes en total, 8 192 bytes por elemento (clave + `JSON.stringify(valor)` en UTF-8) y 512 elementos.
- Solo sincroniza si la persona ha iniciado sesión en Firefox y tiene marcada la sincronización de complementos; si
  no, guarda en local sin avisar. No hay API para saber si está sincronizando.
- Sincroniza cada varios minutos; los conflictos se resuelven por clave, así que dos dispositivos que escriben a la
  vez pueden dejar una mezcla de claves de uno y de otro.

Datos actuales en `storage.local` (ADR 0001 a 0023): los grupos con sus canales y palabras clave (unos 80 B por
canal: con unos cien canales ya superan 8 KB), los ajustes (< 100 B), los canales ocultos (unos 150 B por canal), y
datos que crecen sin límite o son propios del equipo: vistos, listas, avatares, suscripciones conocidas, vídeos nuevos
y actividad de canales.

## Decisión

1. **Qué se sincroniza**: grupos (con `keywords`), ajustes y canales ocultos, ya validados y canónicos con la misma
   validación que la copia de seguridad (`YouTubeGroupsBackup.parseSyncData`). **No** se sincronizan vistos, listas,
   avatares, suscripciones conocidas, vídeos nuevos ni actividad: crecen sin límite o son observaciones de cada
   equipo. Los canales ocultos entran por ser pequeños y porque ocultar un canal en un equipo y verlo en otro
   sorprende.
2. **Opcional y desactivada por defecto**: casilla en la sección nueva "Sincronización" de la página de opciones. Su
   estado es de cada dispositivo y vive en la clave local `youtubeSync` (no se sincroniza ni entra en la copia).
3. **`storage.local` sigue siendo la fuente de verdad**: toda la interfaz sigue leyendo y escribiendo en local como
   hasta ahora. Una **réplica** en `storage.sync` se escribe desde `background.js`, único escritor de `storage.sync`
   y único que importa desde él (la página de opciones le habla con `runtime.sendMessage`).
4. **Formato troceado** en `storage.sync`, versión 1: el texto canónico (JSON con claves ordenadas de `{ groups,
   settings, hiddenChannels }`) se parte en trozos `ygSync:0` … `ygSync:<n-1>` de como mucho 8 000 bytes por elemento
   (con la clave), sin partir caracteres, y una cabecera `ygSync:meta` = `{ format: "youtube-groups-sync", version: 1,
   deviceId, hash, chunks, bytes, updatedAt }`. Cabecera y trozos se escriben en una sola llamada a `set`; los trozos
   sobrantes de una réplica anterior se borran después. `hash` es FNV-1a de 32 bits del texto más su longitud: sirve
   para detectar cambios y réplicas incompletas o mezcladas, no como seguridad.
5. **Presupuesto**: si la réplica (cabecera y trozos) pasa de 97 280 bytes (95 KiB, margen sobre los 100 KiB), o
   `set` falla por cuota, no se escribe nada, la sincronización **se desactiva** en ese dispositivo con estado
   `too-big` y el tamaño, y se avisa (página de opciones y aviso en YouTube). Los datos locales no se tocan y la
   última réplica que cabía se queda como estaba.
6. **Envío**: un cambio local de grupos, ajustes u ocultos con la sincronización activa marca `dirtySince` y, a los
   5 s sin más cambios, se envía si el hash del texto canónico es distinto del último sincronizado (`lastHash`).
7. **Recepción**: un cambio de `ygSync:*` en el área `sync` se ignora si la réplica está incompleta o su hash no
   cuadra (se espera al siguiente cambio), si la escribió este dispositivo (`deviceId`) o si su hash es `lastHash`. Si
   no, **gana el último en escribir, sin fusión**: si hay un cambio local pendiente posterior a `meta.updatedAt`, se
   envía el local; si no, se importa la réplica a local (reemplaza grupos, ajustes y ocultos) y se avisa.
8. **Sin bucles**: al importar, primero se guarda `lastHash` con el hash del texto canónico importado y luego se
   escriben las claves locales; el cambio local resultante produce el mismo hash y no se reenvía. El `deviceId`
   (`crypto.randomUUID()` al activar) evita además procesar el eco de las escrituras propias.
9. **Al activar** con una réplica de otro dispositivo distinta de lo local, la persona elige "Traer los
   sincronizados" (reemplaza lo de este equipo) o "Enviar los de este dispositivo" (reemplaza la réplica). Sin
   réplica, con una igual o con una propia, se activa sin preguntar. Al arrancar el fondo, si está activa, se concilia
   (`reconcile`) con las mismas reglas. Desactivar no borra la réplica.
10. **Protección contra pérdida de datos** (revisión): activar con el árbol local vacío (sin grupos ni ocultos) y sin
    réplica no envía nada hasta que llegue la réplica o haya un cambio local; una importación automática nunca
    sustituye un árbol local con datos por una réplica vacía (se envía lo local); antes de decidir una recepción, un
    cambio local aún sin marcar se marca como pendiente; el temporizador de envío comprueba que siga activa; si falla
    la escritura de una importación, `lastHash` pasa a `null` y el estado a `error`.
11. **Versiones futuras**: una réplica con `format` o `version` distintos de los conocidos se trata como no válida
    (`invalid`): no se importa y, al conciliar, se sobrescribe con la versión propia.

## Alternativas descartadas

- **Sincronizar también vistos y listas**: no caben (ADR 0002 y 0004: crecen sin límite) y obligarían a podar o a
  sincronizar solo una parte, con reglas propias.
- **Fusionar cambios** (por grupo o por canal): exige ids estables de canal, lápidas para borrados y reglas para
  movimientos y fusiones del árbol; mucha lógica para un caso raro (editar a la vez en dos equipos). Gana el último y
  la copia de seguridad sigue disponible.
- **`storage.sync` como almacenamiento principal**: cuota de 100 KB para todo, escrituras limitadas y sincronización
  lenta; además, cambiaría todos los módulos que hoy leen de `storage.local`.
- **Una clave por grupo en `storage.sync`**: un grupo con muchos canales puede superar 8 KB y habría que trocearlo
  igual; el árbol es un todo (orden, padres) y por claves sueltas los conflictos dejarían árboles incoherentes.
- **Replicar desde cada pestaña o desde la página de opciones**: varios escritores de `storage.sync` (el `withLock`
  del ADR 0005 es por contexto) y carreras entre importar y enviar; el script de fondo es uno solo.
- **Comprimir** (quitar `https://www.youtube.com/` de las URL, LZ): ganaría espacio, pero añade formato propio o una
  dependencia; se valora si la cuota se queda corta en la práctica.
- **`crypto.subtle.digest` (SHA-256) como hash**: asíncrono y sin necesidad criptográfica; FNV-1a es síncrono, corto y
  fácil de probar.

## Consecuencias

- Se gana: grupos, palabras clave, ajustes y canales ocultos iguales en todos los Firefox de la persona sin copiar
  ficheros, sin red propia, permisos ni dependencias.
- Se pierde: si se edita en dos equipos antes de que sincronicen, se pierden los cambios del que escribió antes; un
  árbol que no cabe en 95 KiB (del orden de mil canales) no se sincroniza; vistos y listas siguen siendo por equipo
  (copia de seguridad).
- A vigilar: Firefox no informa de si la sincronización de complementos está activa (la sección lo explica); si la
  resolución de conflictos por clave deja réplicas mezcladas a menudo, la siguiente edición las repara, pero puede
  hacer falta reenviar en `reconcile`; si la cuota se queda corta, comprimir las URL.
- Nota (2026-11-23): el [ADR 0035](0035-bajas-de-suscripcion-propagadas.md) hace que `pull` quite de los grupos
  importados los canales dados de baja en los últimos 30 días (`youtubeRecentUnsubscribes`, local); el hash guardado
  sigue siendo el de la réplica recibida y la diferencia se reenvía corregida.
