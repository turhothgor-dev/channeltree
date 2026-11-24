# 0046 · Botón de texto común en el menú de opciones

- Estado: aceptada
- Fecha: 2026-11-24
- Amplía: [0041](0041-boton-de-icono-comun.md) (la forma común de los botones de icono se lleva a los botones de texto
  del menú de opciones; los botones de miniatura siguen congelados)

## Contexto

Plan 2026-11-24-fase6-32-botones-del-menu-de-opciones
(ROADMAP 6-32). Dentro de las pestañas del menú ⚙ (ADR 0045) conviven cuatro estilos de botón de texto: `.action-button`
con `.primary-button` (azul, "Crear"), con `.secondary-button` (gris claro, "Ver", "Quitar filtros"...), con
`.noaction-button` (gris oscuro, "Eliminar", "Vaciar lista", "Quitar") y `.mini-action-button` (relleno de 2 × 3 px,
radio 6 px: "Restablecer", "Actualizar ahora", "Usar esta cuenta"). Ninguno fija el alto, el tamaño de letra ni el foco,
y no se parecen a los botones de la cabecera de la guía (36 px, radio 10 px, fondo de chip; ADR 0041) ni a los de texto
del formulario de la guía ("Guardar", "Cancelar": 36 px, radio 10 px, fondo de chip). Los campos (nombre de lista,
selectores, color) tienen otro radio (6 px) y alto libre.

Esas clases compartidas también las usan los botones de las miniaturas (+G, visto, lista), cuyas reglas fija una
instantánea (`tests/fixtures/overlay-buttons-css.json`, ADR 0041): no se pueden cambiar.

## Decisión

1. **Clase compartida** `youtube-groups__text-button` en `ui/buttons.css`, con la forma de `youtube-groups__icon-button`
   llevada a texto: alto `var(--yg-text-button-height, 36px)`, relleno horizontal 12 px, sin borde, radio 10 px, fondo
   de chip (`--yt-spec-badge-chip-background`, `#f2f2f2` / `#272727` en `html[dark]`), color de texto primario, letra
   heredada (Roboto del menú) a 14 px y peso 500, `line-height: 1`, sin subrayado (sirve para el enlace "Reproducir"),
   hover con el acento (ADR 0040), `:focus-visible` con contorno azul (`#065fd4` / `#3ea6ff`), `:disabled` con opacidad
   0,4 y `[hidden]` con `display: none`. Variante `youtube-groups__text-button--small` (28 px, relleno 8 px, 13 px) para
   los botones dentro de una fila: acciones de cada lista, "Quitar" de cada vídeo y "Restablecer" junto al color.
2. **Sin variantes de color**: todos los botones de texto del menú son neutros (fondo de chip). "Crear" deja de ser
   azul y "Eliminar", "Vaciar lista" y "Quitar" dejan de ser gris oscuro; todos se deshacen con "Deshacer" (ADR 0022),
   así que no hace falta marcarlos como peligrosos.
3. **Los botones del menú dejan las clases compartidas** (`action-button`, `mini-action-button`, `primary-button`,
   `secondary-button`, `noaction-button`) y usan solo la común más su clase propia de gancho. Las reglas propias no
   redefinen caja, borde, fondo ni tipografía (solo márgenes y posición).
4. **Campos del menú** (nombre de lista, selectores de Filtros y Ajustes, color de acento) con el mismo radio (10 px),
   la misma letra heredada y el alto del botón con el que se alinean: 36 px el nombre de lista (junto a "Crear"), 28 px
   los selectores y el color (en filas, junto a "Restablecer"). Conservan su borde de 1 px.
5. **Fuera del menú no cambia nada**: botones de miniatura (instantánea intacta), desplegables, selector de iconos,
   aviso con "Deshacer" y página de opciones siguen con sus clases.

## Alternativas descartadas

- **Cambiar `.action-button` y compañía**: alcanza a los botones de miniatura, que no deben cambiar (ADR 0041).
- **Reglas en `panel.css` por selector agrupado**: no sirve para otros componentes ni para la página de opciones, que
  no carga `panel.css`, y obliga a mantener la lista a mano.
- **Variante primaria o de peligro**: más reglas y más estados para un menú en el que todo se puede deshacer; si se
  pide, se añade como modificador sobre la clase común.
- **Todo a 36 px**: las filas de listas, con cuatro acciones, y las filas de ajustes crecerían mucho en un menú de
  360 px de ancho.

## Consecuencias

- Se gana: un solo sitio para la forma de los botones de texto, coherente con los de icono y el formulario de la guía;
  foco visible y tema oscuro en todos.
- Se pierde: el color distintivo de "Crear" y de los botones de quitar o eliminar.
- A vigilar: `buttons.css` se carga después de `panel.css`, así que una regla propia con la misma especificidad que
  declare caja o tipografía perdería sin avisar; un test lo impide. Los demás botones de texto (desplegables, selector
  de iconos, aviso, página de opciones) pueden pasar a la clase común en otro plan.
