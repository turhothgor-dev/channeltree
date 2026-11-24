# 0041 · Botón de icono común, bullet sin acento y botones de miniatura congelados

- Estado: aceptada
- Fecha: 2026-11-23
- Modifica: [0040](0040-color-de-acento.md) (el bullet de la guía deja de usar el acento en hover) y la presentación
  del bullet de [0036](0036-seleccion-unica-y-bullet-desplegable-en-la-guia.md) (zoom y flecha; el comportamiento no
  cambia)

## Contexto

Plan 2026-11-23-fase6-25-bullet-y-botones-de-icono.
Con el hover de acento (ADR 0040) se ve que los botones de solo icono no comparten forma: crear (+) y editar (lápiz) de
la cabecera de la guía son rectángulos de 28 × 36 px sin radio, "‹" y "›" tienen radio 8 px, "Limpiar selección" y
"Opciones" (⚙) son 36 × 36 px con radio 10 px y fondo de chip, las acciones de fila de las opciones son 28 × 28 px con
borde y radio 0,375 rem, y la "×" del modal de listas no tiene caja. Cada fichero repite tamaño, radio y fondo.

Además, el acento en el bullet de la guía tapa su color, que es justo la información que da. Y los botones sobre las
miniaturas (+G, visto, lista), que también comparten clases con otros botones (`.action-button`, `.primary-button`,
`.secondary-button`), deben quedarse exactamente como están.

## Decisión

1. **Clase compartida** `youtube-groups__icon-button` en `ui/buttons.css` (que cargan los content scripts y la página
   de opciones), con el estilo de referencia de "Limpiar selección" y "Opciones": caja cuadrada de
   `var(--yg-icon-button-size, 36px)`, relleno 0, sin borde, radio 10 px, fondo de chip (`--yt-spec-badge-chip-background`,
   `#f2f2f2` / `#272727` en `html[dark]`), color de texto primario, hover con el acento (ADR 0040), `:disabled` con
   opacidad 0,4 y `[hidden]` con `display: none`. Variante `youtube-groups__icon-button--small` (28 px, mismo radio)
   para los botones dentro de una fila: "›" de la guía, acciones de fila y plegar/desplegar del árbol de opciones y
   "Dejar de ocultar" de la lista de canales ocultos.
2. **Todo botón de solo icono** de la extensión usa la clase; las reglas propias de cada componente no redefinen
   tamaño, relleno, borde, radio ni fondo de su estado base (solo tipografía del glifo y posición). Las celdas del
   selector de iconos conservan el tamaño de su rejilla y marcan la seleccionada con `box-shadow` interior.
3. **Bullet de la guía**: fuera del acento. Al pasar el ratón o con `:focus-visible` crece (`scale(1.15)`, transición
   corta, sin transición con `prefers-reduced-motion`) y el número se sustituye visualmente por una flecha hacia abajo
   (dibujada en CSS con el color de contraste `--yg-bullet-text`, que pasa a escribirse siempre); con la lista
   desplegada (`aria-expanded="true"`) se ve la flecha sin zoom. El número sigue en el DOM y en `aria-description`.
   El bullet decorativo (`span`, grupo sin canales) no cambia.
4. **Botones de miniatura congelados**: las reglas CSS que alcanzan a los botones de `.youtube-groups__card-actions--overlay`
   (tarjetas, reproductor y Shorts) no se tocan; un test las compara con una instantánea y comprueba que esos botones
   no llevan la clase compartida.

## Alternativas descartadas

- **Cambiar `.action-button`** para unificar: alcanza a los botones de miniatura, que no deben cambiar.
- **Regla por selector agrupado** (`.a, .b, .c { … }`) en cada fichero CSS: no sirve para la página de opciones, que
  no carga `guide-section.css`, y obliga a mantener la lista a mano.
- **Flecha con un carácter** ("↓", "▾"): depende de la fuente; un chevrón dibujado con bordes se ve igual en todas.
- **Flecha como SVG insertado por `setGroupBullet`**: más DOM y más estado para algo que resuelve CSS con
  `:hover`, `:focus-visible` y `aria-expanded`.

## Consecuencias

- Se gana: un solo sitio para la forma de los botones de icono y un hover coherente; el bullet conserva su color.
- Se pierde: las filas del árbol de opciones pasan de botones con borde a botones con fondo de chip; "›" y las
  acciones de fila tienen fondo en reposo.
- A vigilar: cambiar `.action-button`, `.primary-button` o `.secondary-button` rompe la instantánea de los botones de
  miniatura a propósito; si de verdad hay que cambiarlos, se actualiza la instantánea con un plan que lo diga.

2026-11-24 (6-32): el ADR 0046 lleva esta forma a los botones de texto del menú de opciones con
`youtube-groups__text-button`; la instantánea de los botones de miniatura no cambia.
