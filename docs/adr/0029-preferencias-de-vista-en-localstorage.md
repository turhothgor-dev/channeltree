# 0029 · Preferencias de vista de la página de opciones en `localStorage`

- Estado: aceptada
- Fecha: 2026-11-22

## Contexto

Plan 2026-11-22-opciones-paginacion-canales: la sección
"Canales" de la página de opciones pagina sus tres listas y las hace plegables. La persona quiere que el tamaño de
página (10, 20, 50 o 100) y qué está plegado se recuerden. Son preferencias de presentación de una sola página,
de este dispositivo, sin efecto en YouTube.

Hasta ahora todo lo persistente va en `browser.storage.local` (ADR 0001 a 0006), y los ajustes en `youtubeSettings`
(ADR 0003), que entra en la copia de seguridad (ADR 0006) y en la sincronización (ADR 0028).

## Decisión

Guardar estas preferencias en el `localStorage` de la página de opciones, en una sola entrada
`youtubeGroupsOptionsView` con JSON `{ version: 1, pageSize, collapsed: [<id>...] }` (ids `channels`, `unclassified`,
`hidden`, `inactive`). Se lee y se escribe solo desde `options/view-prefs.js`, siempre con `try/catch`: si
`localStorage` no está disponible, lanza o tiene un valor no válido, se usan los valores por defecto (20 por página,
todo desplegado) sin mostrar error. No entra en la copia de seguridad ni en la sincronización.

## Alternativas descartadas

- Un campo nuevo en `youtubeSettings`: viajaría en la copia y en `storage.sync` y cambiaría `normalizeSettings`,
  `parseBackup` y `parseSyncData` por algo puramente visual; cada cambio de tamaño despertaría al replicador.
- Una clave nueva en `storage.local` (`youtubeOptionsView`): sería coherente con el resto, pero dispararía
  `storage.onChanged` en todas las pestañas de YouTube y en el fondo por un dato que solo lee una página, y la
  lectura sería asíncrona (la página pintaría primero con los valores por defecto y saltaría después).
- No recordar nada: con muchas suscripciones habría que elegir el tamaño y plegar las listas en cada visita.

## Consecuencias

- Se gana: lectura síncrona al arrancar, cero escrituras en `storage.local` y nada que tocar en copia, sincronización
  ni formatos existentes.
- Se pierde: la preferencia no viaja entre dispositivos ni en la copia, y Firefox puede borrarla si la persona borra
  los datos de sitios; vuelve a los valores por defecto, sin más efecto.
- A vigilar: es el primer uso de `localStorage` en la extensión; si aparecen más preferencias de interfaz que deban
  sincronizarse, revisar esta decisión. Dos pestañas de opciones abiertas no se avisan entre sí del cambio.
- Nota (2026-11-22): `collapsed` ya no admite `channels` (se migra a las tres listas) y hay un selector de tamaño por
  lista con una sola preferencia. Ver [ADR 0031](0031-listas-de-canales-en-primer-nivel.md).
- Nota (2026-11-23): `collapsed` se retira y se añade `tab` (pestaña activa de la página de opciones). Ver
  [ADR 0037](0037-pagina-de-opciones-con-pestanas.md).
