# 0022 · Deshacer por instantánea de la clave en lugar de `confirm`

- Estado: aceptada
- Fecha: 2026-11-21

## Contexto

ROADMAP 6-8 (plan 2026-11-21-fase6-8-deshacer-listas-y-limpieza):
borrar sin miedo y sin diálogos de confirmación. Hoy el menú de opciones (`ui/panel.js`) usa `confirm()` al eliminar
una lista y al aplicar la "Limpieza"; quitar un vídeo de una lista no pide nada y no se puede deshacer. `confirm()`
bloquea la pestaña, se acepta por reflejo y no protege de verdad.

El editor ya deshace fusionar y ordenar con una instantánea del árbol (`revertGroups` en `modules/group-editor.js`, plan
6-6): guarda `{ before, after }` y, al deshacer, solo restaura `before` si el valor actual es exactamente `after`. Ese
módulo no se carga en los content scripts. El aviso flotante con "Deshacer" (`ui/toast.js`, ADR 0021) ya existe en
YouTube.

Restricciones: sin dependencias, permisos ni red nuevos; escrituras en `withLock` (ADR 0005); formatos de
almacenamiento sin cambios (ADR 0001 y 0004).

## Decisión

Toda acción destructiva del menú de opciones se ejecuta al momento, sin `confirm()`, y muestra el aviso de
`ui/toast.js` con "Deshacer" durante 10 s. Deshacer usa **una instantánea de la clave completa afectada**
(`{ before, after }`, `before` leído y `after` escrito dentro del mismo `withLock`) y solo restaura si el valor
guardado sigue siendo `after` (comparación con `JSON.stringify`); si ya es `before` no escribe ("Ya estaba deshecho"),
y si es otro, no toca nada ("No se puede deshacer: … han cambiado desde entonces").

La comparación y la escritura condicional viven en un módulo nuevo sin DOM, `modules/undo.js`
(`YouTubeGroupsUndo`), cargado tras `storage.js` en content scripts, página de opciones y tests. `revertGroups` y
`revertGroupsAndSave` del editor pasan a usarlo sin cambiar su interfaz, de modo que hay un único patrón.

## Alternativas descartadas

- Mantener `confirm()`: es lo que la hoja de ruta quiere quitar.
- Deshacer dirigido (reinsertar solo la lista o el vídeo quitados, como `restoreGroup`): una función inversa por
  operación (borrar lista, quitar vídeo, vaciar, cada tipo de limpieza) y casos raros de posición e identidad; la
  instantánea es una sola función para todo.
- Restaurar `before` sin comprobar: pisaría cambios hechos entre medias en otra pestaña o en el editor.
- Papelera persistente (clave nueva con lo borrado): más formato, más almacenamiento y más interfaz para una
  prioridad baja.

## Consecuencias

- Se gana: borrar es inmediato y reversible; un solo patrón en editor y menú; sin cambios de formato.
- Se pierde: cualquier cambio en la misma clave durante los 10 s (por ejemplo, guardar un vídeo en otra lista)
  impide deshacer; el aviso lo explica. La instantánea vive en memoria de la pestaña: recargar o cerrar la pestaña
  pierde el "Deshacer".
- A vigilar: el tamaño de la instantánea (dos copias de la clave en memoria durante 10 s) es aceptable con los
  tamaños actuales; si una clave crece mucho, revisar.
