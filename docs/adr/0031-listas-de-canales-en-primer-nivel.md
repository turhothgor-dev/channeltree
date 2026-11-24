# 0031 · Listas de canales como secciones de primer nivel de la página de opciones

- Estado: aceptada
- Fecha: 2026-11-22
- Modifica: [0025](0025-ajustes-copia-y-limpieza-en-opciones.md) (punto 3: índice y orden de secciones) y
  [0029](0029-preferencias-de-vista-en-localstorage.md) (ids de `collapsed`)

## Contexto

Plan 2026-11-22-unificar-canales-sin-grupo. Tras el plan
2026-11-22-opciones-paginacion-canales, la sección "Canales"
(`#canales`) es un `<details>` con un `<h2>` "Canales", el selector "Mostrar N canales por lista" y tres listas
plegables con su propio `<h2>`: "Suscripciones sin grupo", "Canales ocultos" y "Canales inactivos". Hay dos niveles de
plegado y dos `h2` seguidos ("Canales" y "Suscripciones sin grupo") que nombran lo mismo. La persona pide que sean un
solo nivel y que la lista pase a llamarse "Canales sin grupo".

Las listas de ocultos e inactivos no se ocultan cuando están vacías (pintan "No hay canales ocultos." o el estado de la
actividad), pero quedan debajo de hasta 100 filas de la primera lista, dentro de la misma sección.

## Decisión

1. **Sin sección contenedora**: desaparecen `<section id="canales">`, `#options-channels-details` y su `h2`. Las tres
   listas (`#options-unclassified`, `#options-hidden`, `#options-inactive`, mismos `id`) son secciones hermanas de
   primer nivel dentro de `<main>`, cada una plegable una sola vez con su `<details>` y su `h2` con el recuento.
2. **Índice**: "Canales" se sustituye por tres enlaces, en este orden: Grupos, **Canales sin grupo**
   (`#options-unclassified`), **Canales ocultos** (`#options-hidden`), **Canales inactivos** (`#options-inactive`),
   Ajustes, Atajos, Copia de seguridad, Sincronización, Limpieza. Se usan los `id` existentes como anclas (los usan
   los estilos, `aria-labelledby` y unos 50 tests). Cada enlace despliega su lista si está plegada.
3. **Tamaño de página**: una preferencia común (`pageSize`, ADR 0029) con un selector **en cada lista**, entre el
   título y el contenido, fuera de lo que se repinta; cambiar uno cambia los tres, guarda y repinta las tres listas.
   Lo crea una sola función de `options/options.js`.
4. **Nombre**: la lista se llama "Canales sin grupo" (título, índice, `aria-label` y textos que la nombran). Los
   textos que hablan de la fuente de datos ("suscripciones conocidas") no cambian.
5. **Preferencias**: `collapsed` admite `unclassified`, `hidden` e `inactive`. Un valor antiguo con `channels` (la
   sección contenedora plegada) se migra al leer a las tres listas plegadas, para que la página se vea igual que la
   persona la dejó; la siguiente escritura ya no lo guarda. El formato sigue en `version: 1`.

## Alternativas descartadas

- **Mantener `#canales` como contenedor sin plegar** (solo quitar su `details`): sigue habiendo dos títulos para lo
  mismo y un enlace "Canales" que no dice qué hay dentro.
- **Meter ocultos e inactivos dentro de "Canales sin grupo"**: no son canales sin grupo (los inactivos están en
  grupos por definición).
- **Un único selector de tamaño suelto encima de las tres secciones**: sin contenedor no queda claro a qué listas
  afecta y se pliega con ninguna.
- **Tres preferencias de tamaño independientes**: la persona pidió un solo tamaño (plan de paginación, decisión 2).
- **Anclas nuevas en español** (`#sin-grupo`...): obligaría a cambiar `id` usados por estilos y tests sin ganancia
  visible.

## Consecuencias

- Se gana: un solo nivel de plegado, títulos `h2` que ya no se anidan bajo otro `h2`, y acceso directo desde el índice
  a ocultos e inactivos.
- Se pierde: el índice pasa de 7 a 9 enlaces; ya no hay un botón para plegar las tres listas a la vez; hay tres
  controles de tamaño que muestran el mismo valor.
- A vigilar: si se añade otra lista de canales, va como sección hermana con su enlace y su selector.
- Nota (2026-11-22): el índice pasa de 9 a 8 enlaces al salir Ajustes de la página. Ver
  [ADR 0032](0032-ajustes-en-el-menu-y-sin-reproducir-grupo.md).
- Nota (2026-11-22): el índice pasa de 8 a 7 enlaces al salir Atajos de la página. Ver
  [ADR 0033](0033-atajos-en-el-menu-de-la-guia.md).
- Nota (2026-11-23): las secciones plegables y el índice de anclas se sustituyen por pestañas; las listas ya no se
  pliegan. Ver [ADR 0037](0037-pagina-de-opciones-con-pestanas.md).
- Nota (2026-11-23): un único selector de tamaño sustituye al de cada lista. Ver
  [ADR 0039](0039-opciones-en-tres-pestanas.md).
