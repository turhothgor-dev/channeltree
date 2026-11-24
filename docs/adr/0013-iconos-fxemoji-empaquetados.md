# 0013 · Iconos de grupo de fxemoji empaquetados como datos JavaScript

- Estado: aceptada
- Fecha: 2026-11-16

## Contexto

Los iconos de grupo eran 12 rutas SVG monocromas escritas a mano en `modules/icons.js`. Se quieren sustituir por
los emoji de Mozilla fxemoji (<https://github.com/mozilla/fxemoji>): SVG multicolor de 512×512 con `fill` en línea,
dibujo con licencia CC BY 4.0 y repositorio sin cambios desde 2019. Restricciones: la extensión no hace peticiones
de red, no expone recursos a la página, pinta sin `innerHTML` y sus reglas no permiten scripts que escriban
ficheros. El grupo guarda solo el id del icono (ADR 0001).

## Decisión

Los SVG originales se copian sin modificar a `third_party/fxemoji/` (fuera del paquete) y su contenido se transcribe a
un script clásico empaquetado, `modules/fxemoji-data.js`, como listas de formas `{ tag, attrs }` con una lista
blanca de etiquetas y atributos; un test comprueba que los datos coinciden con los SVG de `third_party/`. Los ids de
icono no cambian, así que no hay migración de datos. El color del grupo deja de teñir el icono y se muestra como una
banda vertical en el borde derecho de la fila del grupo. `THIRD_PARTY_NOTICES.md`, incluido en el paquete, cumple la atribución de CC BY 4.0.

## Alternativas descartadas

- `<img>` con `moz-extension://`: necesita `web_accessible_resources` para `youtube.com` y expone los ficheros.
- `fetch(runtime.getURL())` y `DOMParser` al pintar: asíncrono en un pintado síncrono y necesita recursos accesibles.
- Script generador que escriba el módulo: lo prohíben las reglas del proyecto; el test de coincidencia da la misma
  garantía.
- Cargar los SVG desde la red (CDN o GitHub): rompe "sin peticiones de red" y la privacidad.
- Ids nuevos por emoji con migración en `getGroups`: no aporta nada mientras la correspondencia sea 1 a 1.

## Consecuencias

- Se gana: iconos multicolor reconocibles, sin red ni recursos expuestos, sin migración y con origen trazable.
- Se pierde: el color ya no tiñe el icono; el módulo de datos pesa unos KB por icono.
- A vigilar: al añadir iconos, copiar el SVG a `third_party/`, transcribirlo y que el test pase; si un SVG necesita
  degradados o `transform`, elegir otro antes de ampliar la lista blanca. Mantener `THIRD_PARTY_NOTICES.md` en el
  paquete.

## Actualización (2026-11-16)

El aro y el fondo claro en tema oscuro se sustituyeron por la banda lateral (plan `2026-11-16-iconos-banda-color`).
El punto de color de los grupos sin icono desaparece, porque la banda ya muestra el color.

## Actualización (2026-11-22)

Con el plan `2026-11-22-fase6-17-iconos-de-grupo` los iconos pasan de 12 a 60, con la misma decisión: SVG sin cambios en
`third_party/fxemoji/`, transcripción a `modules/fxemoji-data.js` con la herramienta de edición y test de coincidencia.
Cambios: cada entrada de `ICON_SET` lleva una `category` (`general`, `media`, `sports`) que el selector muestra como
pestañas; el `viewBox` de cada icono es el de su SVG (no siempre `0 0 512 512`); la copia en `third_party/` se guarda
con fin de línea LF aunque el original tenga CRLF. El módulo de datos ronda los 200 KB y un test impide que pase de
300 KB. Los ids anteriores no cambian, así que sigue sin haber migración.

Iconos por capas: cuando el SVG completo de un emoji no cumple la lista blanca (por ejemplo `u1F3BE-tennisball.svg`, con
`<style>`, `transform` y una fuente incrustada), pero fxemoji publica sus capas (`uXXXX.layerN.svg`, una forma cada una,
sin `style` ni `transform`), la entrada de `ICONS` lleva `layers: [<ficheros en orden>]` en lugar de `file`. Las capas se
copian sin modificar a `third_party/fxemoji/` y el test compara las formas del icono con la concatenación de las de sus
capas. Se usa solo para el tenis; motos (21 capas) y surf con persona siguen fuera.
