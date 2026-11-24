# 0037 · Página de opciones con pestañas

- Estado: aceptada
- Fecha: 2026-11-23
- Modifica: [0031](0031-listas-de-canales-en-primer-nivel.md) (puntos 1 y 2: secciones plegables e índice de anclas) y
  [0029](0029-preferencias-de-vista-en-localstorage.md) (`collapsed` se retira; se añade `tab`)

## Contexto

Plan 2026-11-23-fase6-22-opciones-en-pestanas. La página de
opciones tiene siete secciones una tras otra y un índice de anclas (ADR 0031). En "Grupos", la columna "Canales del
grupo" es casi siempre más larga que el árbol y empuja las secciones siguientes muy abajo, dejando un hueco grande
bajo el árbol. Las tres listas de canales son plegables (`<details>`) y lo plegado se recuerda en `localStorage`
(ADR 0029), lo que solo mitiga el problema para esas tres.

## Decisión

1. **Pestañas ARIA**: el índice `<nav>` se sustituye por un `role="tablist"` con siete `role="tab"` (botones) en el
   mismo orden y con los mismos nombres; cada `<section>` existente pasa a ser un `role="tabpanel"` con el mismo `id`.
   Solo hay un panel visible (los demás con `hidden`). Teclado según el patrón de la APG con **activación
   automática**: ←/→ (circular), Inicio y Fin; tabulador rovante (solo la pestaña activa tiene `tabindex="0"`).
2. **Hash**: la pestaña activa se refleja en el hash con el `id` del panel (`#grupos`, `#options-unclassified`,
   `#options-hidden`, `#options-inactive`, `#copia`, `#sincronizacion`, `#limpieza`). Un clic añade una entrada al
   historial (`history.pushState`); las flechas, Inicio y Fin la sustituyen (`replaceState`) para no llenar el
   historial. `hashchange` (atrás/adelante o URL editada) activa la pestaña correspondiente.
3. **Pestaña inicial**: la del hash si existe; si no, la recordada en `localStorage`; si no, "Grupos". Un hash
   desconocido se corrige con `replaceState`.
4. **Preferencias** (`youtubeGroupsOptionsView`, sigue en `version: 1`): `{ version: 1, pageSize, tab }`. `collapsed`
   se ignora al leer y deja de escribirse (migración tolerante). `tab` es una cadena no vacía; la página la valida
   contra las pestañas que existen.
5. **Sin plegado**: las listas de canales dejan de ser `<details>`; conservan su `h2` con el recuento, el selector de
   tamaño de página común (ADR 0031, punto 3) y la paginación.
6. **Lo global sale de los paneles**: el aviso con "Deshacer" (posición fija) se cuelga de `<body>`, no de "Grupos";
   "+ Grupo" y "Ordenar A-Z" pasan a una barra dentro del panel "Grupos"; el buscador sigue en la cabecera y solo se
   muestra en "Grupos", "Canales sin grupo", "Canales ocultos" y "Canales inactivos", que son las que filtra.

## Alternativas descartadas

- **Mantener anclas y plegar "Grupos"**: no resuelve el hueco, solo lo esconde, y añade un cuarto `<details>`.
- **Dos columnas independientes con scroll propio**: resuelve el hueco solo en "Grupos" y complica el diseño estrecho.
- **Activación manual (Enter/Espacio)**: más pasos; los paneles se pintan en memoria y cambiar es instantáneo.
- **Hashes nuevos sin coincidir con los `id`** (`#tab=...`): evitarían el salto al ancla al cargar, pero rompen los
  enlaces existentes y lo que la persona pidió; se mitiga con `scroll-margin-top` en los paneles.
- **Conservar `<details>` dentro de las pestañas**: plegar la única sección visible no aporta nada.
- **Contadores en las pestañas**: el recuento ya está en el `h2` de cada lista; duplicarlo exige un aviso nuevo
  desde cada lista. Se deja para más adelante.

## Consecuencias

- Se gana: cada sección empieza arriba, sin huecos; enlaces directos y atrás/adelante por sección; una preferencia
  menos que mantener (`collapsed`).
- Se pierde: no se ven dos secciones a la vez; el índice deja de ser de enlaces (sin "abrir en pestaña nueva" desde él).
- A vigilar: una sección nueva de la página va como pestaña y panel nuevos. Si algo debe llevar a otra sección (por
  ejemplo, un aviso que apunte a "Sincronización"), debe usar el hash del panel, no `scrollIntoView`.
- Nota (2026-11-23): las siete pestañas pasan a tres (Grupos, Canales, Datos) y los hashes antiguos son alias. Ver
  [ADR 0039](0039-opciones-en-tres-pestanas.md).
- Nota (2026-11-24): el buscador sale de la cabecera; hay uno dentro de "Grupos" y otro dentro de "Canales", cada uno
  con su texto. Ver [ADR 0047](0047-un-buscador-por-pestana-en-opciones.md).
