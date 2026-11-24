# 0044 · Cabecera de la guía en tres filas: encabezado fijo, barra de botones y navegación

- Estado: aceptada
- Fecha: 2026-11-24
- Modifica: [0017](0017-menu-de-opciones-en-la-guia.md) (punto 5: posición de crear, editar, "Limpiar selección" y el
  engranaje) y la presentación de la sección de [0010](0010-seccion-en-la-guia-de-youtube-fija.md) (la mecánica de la
  columna no cambia)

## Contexto

Plan 2026-11-24-fase6-30-cabecera-de-la-guia (ROADMAP 6-30).
Hoy la sección de la guía tiene una cabecera con "‹", un `h3` que dice "YouTube Groups" en la raíz o el nombre del
grupo abierto, y a su derecha crear (+) y editar (lápiz); "Limpiar selección" y "Opciones" (⚙) están en un pie, tras
todos los grupos. El `h3` no tiene ninguna acción: solo rotula la columna. El nombre de la sección desaparece al
entrar en un grupo, los botones están repartidos entre arriba y abajo, y un nombre de grupo largo se corta con "…".

## Decisión

1. **Fila 1, encabezado fijo**: `h3.youtube-groups__guide-heading` con el texto "YouTube Groups", siempre igual y sin
   acción (ni botón, ni enlace, ni `tabindex`). Se mantiene `h3`, el nivel que ya tenía la sección.
2. **Fila 2, barra de botones** (`div.youtube-groups__guide-toolbar`, `role="group"`, `aria-label="Acciones de YouTube
   Groups"`): crear, limpiar selección, editar y opciones (⚙), en ese orden, con las clases, iconos, `aria-label`,
   `title` y estados de hoy (botón de icono común, ADR 0041; limpiar deshabilitado sin selección). El orden de
   tabulación es el del DOM; no hay navegación con flechas. El pie desaparece.
3. **Fila 3, navegación** (`div.youtube-groups__guide-nav`): "‹" (oculto en la raíz) y el rótulo de la columna
   (`span.youtube-groups__guide-nav-title`, no es encabezado): "Suscripciones" en la raíz, el nombre del grupo abierto
   dentro. El rótulo hereda la función del antiguo `h3`, que era solo informativa: **no es un enlace**. Si el nombre no
   cabe, usa la marquesina de los nombres de la guía (`getMarqueeMetrics`) al pasar el ratón por la fila o al enfocar
   "‹"; con `prefers-reduced-motion: reduce` no anima y el nombre completo va en el `title` de la fila.
4. **Formulario de crear** justo bajo la barra de botones, junto al botón que lo abre; después, la navegación y la
   columna.
5. **Foco**: tras "›" el foco pasa a "‹"; tras "‹", al "›" del grupo del que se sale. El menú ⚙ no cambia: se cuelga de
   `document.body` y se coloca con `getMenuPosition` a la derecha del engranaje, ahora arriba de la sección.

## Alternativas descartadas

- **"Suscripciones" como enlace a `/feed/subscriptions`**: el título no tenía acción y la guía de YouTube ya tiene
  ese enlace justo encima; además, en suscripciones no haría nada. Puede añadirse en otro plan si se pide.
- **`role="toolbar"`**: obliga a un tabulador único con flechas (patrón ARIA) por cuatro botones; `role="group"` con
  tabulación normal basta.
- **Rótulo de la columna como `h4`**: crea una jerarquía de encabezados para un texto que cambia con la navegación;
  el `h3` fijo ya da el punto de entrada de la sección.
- **Marquesina siempre activa**: distrae en una guía que está siempre a la vista; se hace como en las filas, a
  demanda.

## Consecuencias

- Se gana: el nombre de la sección siempre visible, todas las acciones en un sitio fijo y arriba, y el nombre del grupo
  abierto legible entero.
- Se pierde: una fila más de altura en la cabecera (la del pie desaparece).
- A vigilar: el menú ⚙ se abre ahora desde arriba; `getMenuPosition` lo alinea con la parte superior del engranaje y lo
  mantiene dentro de la ventana. Con la guía desplazada hacia abajo, el engranaje puede quedar fuera de la vista.

2026-11-24 (6-31): la barra de botones se alinea a la derecha y el rótulo de navegación pasa a 15 px y peso 600.
