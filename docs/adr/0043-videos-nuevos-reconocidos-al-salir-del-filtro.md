# 0043 · Vídeos nuevos reconocidos al salir del filtro, con sus subgrupos, y marca "Nuevo" en la miniatura

- Estado: aceptada
- Fecha: 2026-11-23
- Modifica: [0038](0038-videos-nuevos-reconocidos-por-grupo.md) (puntos 1 y 2: qué grupos reconoce un filtro y cuándo)
  y, a través de él, el apartado "Reconocer" del [0019](0019-videos-nuevos-por-grupo-aproximados.md)

## Contexto

Plan 2026-11-23-fase6-28-videos-nuevos-al-salir-del-filtro-y-marca.
Con el ADR 0038 el número de vídeos nuevos ya aparece, pero:

1. Aplicar el filtro de un grupo lo pone a 0 **al momento** y lo renueva en cada volcado mientras sigue seleccionado.
   La persona no llega a ver qué vídeos eran los nuevos: el número desaparece justo cuando los tiene delante.
2. El filtro de un grupo muestra también los vídeos de sus subgrupos, pero solo reconoce al propio grupo: los
   subgrupos siguen marcando como nuevos vídeos que ya se han mostrado.
3. En las tarjetas no hay nada que diga qué vídeo es nuevo; solo el número de la guía.

La selección vive en memoria de la pestaña (`ctx.state.activeSelection`) y persiste entre navegaciones SPA; solo se
traspasa por `sessionStorage` cuando la extensión navega a suscripciones con una carga completa (ADR 0007). Una
recarga o el cierre de la pestaña la pierden.

## Decisión

1. **Se reconoce al salir, no al entrar.** Aplicar el filtro de un grupo no cambia `visits`. Mientras sigue
   seleccionado, el número del grupo y las marcas siguen a la vista (y pueden subir con lo que llegue). Se reconoce
   cuando la selección deja de ser ese grupo: quitarlo, pulsar otro grupo, un canal o "Sin grupo", "Limpiar
   selección", el atajo `Alt+Shift+X` o que el grupo se borre. Se elimina el reconocimiento continuo (cada volcado ya
   no renueva la visita del grupo seleccionado).
2. **Alcance: el grupo y sus descendientes.** Al salir del filtro de `G` en el instante `t`, `visits[X] = max(visits[X],
   t)` para `G` y para cada subgrupo de su subárbol. Aplicar un subgrupo y salir de él no toca a su padre ni a sus
   hermanos. Entre grupos sin relación de parentesco sigue sin haber herencia (dos grupos con un canal en común se
   reconocen por separado). `t` es el momento de salida, no el del volcado: se guarda con el reconocimiento.
3. **Las visitas solo avanzan**: un reconocimiento con un instante anterior al guardado no lo retrasa (necesario para
   recuperar reconocimientos tardíos sin pisar los de otra pestaña).
4. **Navegar no reconoce.** Con el filtro activo, ir a otra página (SPA) no reconoce nada: la selección sigue y lo
   que se ve sigue con el filtro.
5. **Recargar o cerrar con el filtro activo.** En `pagehide`, la pestaña reconoce la salida del grupo seleccionado
   (salvo que haya un traspaso de selección pendiente: la selección continúa en la página siguiente), escribe de
   forma síncrona en `sessionStorage` los reconocimientos aún no guardados (`{ version: 1, acks: { <id>: ms } }`) e
   intenta volcarlos (sin garantía: la escritura es asíncrona). Al arrancar, la pestaña lee y borra esa entrada y
   aplica los reconocimientos con su instante original. Así una recarga nunca los pierde; al cerrar la pestaña se
   pierden si el volcado no llega a terminar (limitación aceptada: esos vídeos siguen siendo nuevos).
6. **Marca "Nuevo" en la miniatura.** Una tarjeta lleva la marca si su vídeo es nuevo para **algún grupo que contiene
   directamente su canal** (en sus `channels`, no por un subgrupo) con el reconocimiento de ese grupo
   (`getNewVideoIds`). Es un elemento propio (`.youtube-groups__new-badge`, texto "Nuevo") en la esquina superior
   derecha de la miniatura, con el color de acento, fuera de la columna de botones y sin tocar sus reglas (ADR 0041,
   instantánea `tests/fixtures/overlay-buttons-css.json`). Se pone y se quita sin recargar al cambiar el recuento
   (salir del filtro, marcar visto, otra pestaña, actualización en segundo plano). Solo en las páginas de
   `shouldNoteNewVideos` (inicio, suscripciones, búsqueda, recomendaciones de `/watch` y canal) y no en las tarjetas
   de Shorts ni en `/shorts`. La persona puede desactivarla con el ajuste `showNewBadge` (6-29); el número de la guía
   no cambia.
7. El formato de `youtubeNewVideos` no cambia (`version: 1`), ni la copia de seguridad, ni la réplica, ni la
   actualización en segundo plano (sigue sin reconocer ningún grupo).

## Alternativas descartadas

- **Reconocer al aplicar (ADR 0038)**: el número y las marcas desaparecen justo cuando la persona quiere verlos.
- **Reconocer solo los vídeos que se han pintado con el filtro** (lista de ids por grupo): exacto, pero cambia el
  formato de la clave y crece con cada vídeo; el instante de salida basta para lo que se pide.
- **Reconocer al navegar con el filtro activo**: la selección persiste entre páginas a propósito; cada navegación
  vaciaría el número sin que la persona haya terminado con el grupo.
- **Marca para cualquier grupo que contenga el canal, también por sus subgrupos**: tras salir del filtro de un
  subgrupo la marca seguiría puesta porque el padre (que no se reconoce) aún lo cuenta; la persona vería marcas que
  ya ha revisado.
- **Marca solo para el grupo del filtro activo**: sin filtro no se vería ninguna, que es donde más ayuda (inicio).
- **Clave aparte en `storage.local` escrita a ciegas en `pagehide`** para no perder el cierre de pestaña: más
  claves y una fusión al arrancar para un caso de borde; se acepta la limitación.

## Consecuencias

- Se gana: la persona ve qué vídeos son nuevos mientras mira el grupo, en la miniatura y en el número; al salir, el
  grupo y sus subgrupos quedan al día.
- Se pierde: al salir se reconoce todo lo anotado hasta ese momento para el grupo y sus descendientes, aunque no se
  haya pintado (por ejemplo, lo que trajo la actualización en segundo plano mientras el filtro estaba puesto). El
  padre sigue contando lo que se revisó con el filtro de un hijo (ya aceptado en el ADR 0038), pero esos vídeos ya no
  llevan marca.
- A vigilar: cerrar la pestaña con el filtro activo puede no reconocer; si Firefox restaura la página desde la caché
  de historial (`pageshow` persistente), el filtro sigue en pantalla ya reconocido. La marca tarda hasta un volcado
  (2 s) en aparecer en un vídeo visto por primera vez.
