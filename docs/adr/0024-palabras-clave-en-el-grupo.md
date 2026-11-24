# 0024 · Palabras clave de autoasignación como campo opcional del grupo

- Estado: aceptada
- Fecha: 2026-11-21

## Contexto

ROADMAP 6-10 (plan 2026-11-21-fase6-10-reglas-de-autoasignacion):
sugerir un grupo a las suscripciones de la bandeja "Suscripciones sin grupo" (ADR 0018) a partir de palabras clave que
la persona escribe para cada grupo. Hay que decidir dónde se guardan esas palabras clave y cómo se comparan con el
único dato que hay de cada suscripción: su nombre visible.

Restricciones: sin dependencias, permisos ni red nuevos; escrituras en `withLock` (ADR 0005); el formato de los grupos
(ADR 0001) ya admite campos opcionales (`type`, `icon`, `color`, `subgroups`) y todas las operaciones del editor copian
los grupos con `structuredClone` o `{ ...group }`, así que un campo nuevo sobrevive a mover, fusionar, ordenar o
deshacer. La importación de la copia (ADR 0006, `parseGroups`) en cambio reconstruye cada grupo campo a campo.

## Decisión

1. **Formato**: campo opcional `keywords` en cada grupo y subgrupo de `youtubeGroups`: array de textos (recortados,
   espacios colapsados, de 1 a 40 caracteres, con al menos una letra o número, sin repetidos al comparar sin
   mayúsculas ni acentos, como mucho 20). Sin el campo o con un array vacío, el grupo no tiene palabras clave; al
   guardar una lista vacía se quita el campo. `version` sigue en 1: es un campo opcional nuevo, compatible hacia
   atrás.
2. **Validación** en un único sitio, `YouTubeGroups.normalizeKeywords` (`modules/groups.js`, cargado en content
   scripts y en la página de opciones), que usan la escritura (`setGroupKeywords`), la importación de la copia
   (`parseGroups`, que descarta las no válidas y las cuenta en `dropped`) y la lógica de sugerencias (que ignora lo
   que no sea válido).
3. **Copia de seguridad**: entra sola, porque exporta el árbol tal cual; al importar se conserva el campo normalizado.
4. **Coincidencia**: con el **nombre** del canal, por **palabra completa** y sin distinguir mayúsculas ni acentos.
   Nombre y palabra clave se pasan a minúsculas sin diacríticos y se parten en palabras por todo lo que no sea letra
   ni número (`[^\p{L}\p{N}]+`); hay coincidencia si la secuencia de palabras de la clave aparece seguida en la del
   nombre: "Música" coincide con "MUSICA en directo"; "lo-fi" coincide con "Lo Fi Beats" pero no con "Lofi Girl";
   "art" no coincide con "Smarter Every Day". Sin expresiones regulares construidas con el texto de la persona.
5. **Solo sugiere**: nunca asigna sola. Cada suscripción sin grupo recibe como mucho un grupo sugerido: el de la
   palabra clave coincidente más larga (más palabras y, a igualdad, más caracteres); a igualdad, el primero del árbol
   en preorden. Aplicar una sugerencia (una o todas las visibles) es una acción explícita con "Deshacer" 10 s por
   instantánea del árbol (ADR 0022).

## Alternativas descartadas

- Clave aparte (`youtubeKeywordRules`, `{ <groupId>: [...] }`): habría que podarla al borrar grupos, restaurarla al
  deshacer un borrado o una fusión y añadirla a la copia; el árbol ya resuelve todo eso.
- Reglas con expresiones regulares o con comodines: más potentes, pero más difíciles de escribir y de explicar, y una
  expresión mal escrita puede bloquear la página; para una prioridad baja basta la palabra completa.
- Coincidencia por subcadena: "art" sugeriría el grupo a "Smarter Every Day"; la palabra completa da menos falsos
  positivos.
- Comparar también con la URL (`/@handle`): los handles suelen ir sin espacios ("lofigirl") y la palabra completa no
  funcionaría; se puede reconsiderar si el nombre resulta insuficiente.
- Asignar automáticamente al detectar la suscripción: la hoja de ruta exige confirmar; el nombre del canal es una
  señal pobre.

## Consecuencias

- Se gana: sin clave nueva ni migración; las palabras clave viajan con el grupo al moverlo, fusionarlo, deshacer o
  copiarlo, y en la copia de seguridad.
- Se pierde: guardar palabras clave reescribe el árbol y repinta la guía en las pestañas abiertas (como renombrar);
  es una acción rara. Una copia exportada con esta versión e importada en una versión anterior pierde el campo
  (`parseGroups` lo descartaba).
- A vigilar: si las sugerencias resultan pobres solo con el nombre, valorar la URL o la descripción del canal (esta
  exigiría leer más DOM de YouTube).
