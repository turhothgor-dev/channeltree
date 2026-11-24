# 0036 · Selección única en la guía y bullet del grupo como control de despliegue

- Estado: aceptada
- Fecha: 2026-11-23
- Sustituye a: [0011](0011-seleccion-de-hermanos.md) (selección de hermanos)
- Modifica: [0020](0020-filtro-sin-grupo-excluyente.md) (la exclusividad de "Sin grupo" pasa a ser la regla general) y
  la presentación del bullet de [0019](0019-videos-nuevos-por-grupo-aproximados.md) (el cálculo no cambia)

## Contexto

En la columna "YouTube Groups" de la guía (ROADMAP 6-21, plan
2026-11-23-fase6-21-guia-bullet-y-seleccion-unica) la
persona pide: filtros excluyentes (un solo grupo, subgrupo, canal o "Sin grupo" a la vez), quitar los iconos ▸/▾ de
desplegar la lista de canales y usar para eso el bullet de color, que debe verse siempre (gris si el grupo no tiene
color) y llevar dentro el número de vídeos nuevos.

Hoy la selección es un array de claves con la regla de hermanos del ADR 0011, el bullet está **dentro** del botón del
grupo (no puede ser otro botón: no se anidan botones) y solo aparece si el grupo tiene color o vídeos nuevos.

## Decisión

1. **Selección única**: la selección sigue siendo un array de claves (`group:<id>`, `channel:<contenedor>:<url>`,
   `ungrouped`), con **como mucho un elemento**. `toggleSelection`: si la clave pulsada es la seleccionada, la selección
   queda vacía; si no, pasa a ser `[clave]`. `resolveSelection` conserva solo la **primera** clave que existe. El
   traspaso por `sessionStorage` no cambia de formato (`version: 3`): una selección antigua con varias claves se queda
   con la primera que existe. Desaparece la regla de hermanos.
2. **Bullet como botón**: el bullet sale del botón del grupo y es un botón hermano (`aria-expanded`, `aria-controls` a
   la lista de canales, `aria-label` "Mostrar canales de X" / "Ocultar canales de X") que despliega o pliega la lista
   de canales del grupo, como hacía ▸/▾. Si el grupo no tiene canales propios, el bullet es decorativo (`aria-hidden`).
   El número de vídeos nuevos se describe con `aria-description` en el botón del grupo y en el del bullet.
3. **Siempre visible**: sin color, el bullet es gris (`#909090`); con vídeos nuevos muestra el número (suma del grupo
   y sus descendientes, sin repetir vídeos, como ya calcula `countNewVideos`), con "99+" si pasa de 99 y el color de
   texto de mayor contraste (`getContrastTextColor`). Es más grande que hoy.
4. **Subgrupos**: se siguen viendo entrando con "›" (columna única con desplazamiento, ADR 0010); el bullet solo
   despliega canales.
5. Los filtros avanzados del menú (duración, fecha, visualizaciones) no son parte de la selección y no cambian.

## Alternativas descartadas

- Mantener varios seleccionados con la regla de hermanos: es lo que la persona pide quitar.
- Cambiar la selección a una cadena o `null`: obligaría a tocar el traspaso, `content.js`, `new-videos` y los tests
  sin ganar nada; un array de 0 o 1 elementos basta.
- Bullet dentro del botón del grupo con `stopPropagation`: un control interactivo dentro de otro no es accesible.
- Desplegar también los subgrupos en línea con el bullet: rompe la columna única del ADR 0010.

## Consecuencias

- Se gana: un filtro claro (lo que se ve es un solo grupo, canal o "Sin grupo") y una fila más limpia, con el número
  de novedades siempre a la vista.
- Se pierde: combinar varios grupos hermanos o varios canales de un grupo en el mismo filtro.
- A vigilar: el ancla de "crear subgrupo" sigue siendo el grupo seleccionado; con selección única ya no hay "último
  pulsado". "Limpiar selección" deja de mostrar un número (siempre sería 1).
- Nota (2026-11-23): el [ADR 0038](0038-videos-nuevos-reconocidos-por-grupo.md) mantiene la suma del grupo y sus
  descendientes en el bullet, pero cada grupo con su propio reconocimiento.
- Nota (2026-11-23): el [ADR 0041](0041-boton-de-icono-comun.md) cambia la presentación del bullet (zoom y flecha al
  pasar el ratón o con la lista abierta); el comportamiento no cambia.
