# 0039 · Página de opciones en tres pestañas y "Grupos" en una columna

- Estado: aceptada
- Fecha: 2026-11-23
- Modifica: [0037](0037-pagina-de-opciones-con-pestanas.md) (puntos 1, 2, 3 y 6: número de pestañas, hashes, pestaña
  inicial y dónde se ve el buscador) y [0031](0031-listas-de-canales-en-primer-nivel.md) (punto 3: un selector de
  tamaño por lista pasa a uno solo para las tres)

## Contexto

Plan 2026-11-23-fase6-24-opciones-tres-pestanas-y-acento.
Tras usar la página de opciones con siete pestañas (ADR 0037), la persona pide agruparlas en tres: "Grupos",
"Canales" (las tres listas de canales, una tras otra) y "Datos" (copia de seguridad, sincronización y limpieza). En
"Grupos", el panel "Canales del grupo" pasa debajo del árbol en todos los anchos y pagina de 20 en 20.

Hay enlaces y preferencias guardadas con los `id` de las siete pestañas antiguas (`#options-unclassified`,
`#options-hidden`, `#options-inactive`, `#copia`, `#sincronizacion`, `#limpieza`; `tab` en `youtubeGroupsOptionsView`,
ADR 0029). Nada del código abre la página con hash (`runtime.openOptionsPage()` va sin él).

## Decisión

1. **Tres pestañas** en este orden: "Grupos" (panel `#grupos`), "Canales" (panel `#canales`) y "Datos" (panel
   `#datos`), con `id` de pestaña `options-tab-grupos`, `options-tab-canales` y `options-tab-datos`. Se conserva el
   patrón ARIA, el teclado, el historial y la preferencia `tab` del ADR 0037.
2. **Contenido**: `#canales` contiene, en este orden, las secciones `#options-unclassified`, `#options-hidden` y
   `#options-inactive` (mismos `id`, clases y componentes; dejan de ser `tabpanel`) con sus títulos `h2`. `#datos`
   contiene `#copia`, `#sincronizacion` y `#limpieza` (mismos `id` y componentes).
3. **Un solo selector de tamaño** "Mostrar N canales por página" (10, 20, 50 o 100; 20 por defecto; misma preferencia
   `pageSize`) en una barra al principio de `#canales`, que repinta las tres listas. Las listas dejan de recibir
   `pageSizeControl` (la opción sigue siendo opcional en sus `create`).
4. **Alias de los `id` antiguos**: `options-unclassified`, `options-hidden` y `options-inactive` → `canales`;
   `copia`, `sincronizacion` y `limpieza` → `datos`. Un hash antiguo (al cargar o en `hashchange`) activa la pestaña
   nueva, sustituye el hash por el de la pestaña (`replaceState`) y desplaza la vista hasta esa sección
   (`scrollIntoView`). Una preferencia `tab` antigua activa la pestaña nueva, sin desplazar. Lo demás desconocido
   sigue llevando a "Grupos" con el hash corregido.
5. **Buscador** visible en "Grupos" y "Canales" (las dos filtran); oculto en "Datos".
6. **"Grupos" en una columna**: el panel "Canales del grupo" va siempre debajo del árbol (sin rejilla de dos
   columnas) y pagina de 20 en 20 (antes 10), sin selector ni preferencia.

## Alternativas descartadas

- **Mantener un selector por lista dentro de "Canales"**: tres controles iguales en la misma vista, que además se
  cambian a la vez; uno arriba es más claro.
- **Sub-pestañas dentro de "Canales" y "Datos"**: vuelve a esconder secciones, que es lo que se quiere evitar.
- **Conservar el hash de la sección (`#options-hidden`) en la URL**: la pestaña activa dejaría de corresponder a un
  hash único y el historial mezclaría hashes de pestaña y de sección; basta con desplazar al llegar.
- **Ignorar los hashes y preferencias antiguos**: quien tenga un marcador o la última pestaña guardada caería en
  "Grupos" sin explicación.
- **Dos columnas solo en pantallas anchas**: es lo que había; la persona pide una columna siempre.

## Consecuencias

- Se gana: menos pestañas y relacionadas por tema; "Canales" permite repasar las tres listas seguidas; el panel de
  canales del grupo tiene todo el ancho.
- Se pierde: en "Canales" y "Datos" hay que desplazarse para llegar a la última sección; con un grupo seleccionado,
  su panel de canales queda debajo de un árbol largo.
- A vigilar: si se añade otra sección, decidir si va en una pestaña existente o en una nueva, y si necesita alias.
- Nota (2026-11-24): el buscador sale de la cabecera; hay uno dentro de "Grupos" y otro dentro de "Canales", cada uno
  con su texto. Ver [ADR 0047](0047-un-buscador-por-pestana-en-opciones.md).
