# 0047 · Un buscador por pestaña en la página de opciones

- Estado: aceptada
- Fecha: 2026-11-24
- Modifica: [0037](0037-pagina-de-opciones-con-pestanas.md) (punto 6: el buscador sale de la cabecera) y
  [0039](0039-opciones-en-tres-pestanas.md) (punto 5: un buscador común visible en "Grupos" y "Canales")

## Contexto

Plan 2026-11-24-fase6-33-separador-y-buscadores-por-pestana
(ROADMAP 6-33). La página de opciones tiene un solo buscador, "Buscar grupos y canales", en la cabecera. Se muestra en
"Grupos" y "Canales" (`SEARCH_TABS`) y el mismo texto filtra a la vez el árbol, el panel de canales del grupo y las
tres listas de "Canales". Buscar un grupo en "Grupos" deja filtradas las listas de "Canales" sin que se vea por qué al
cambiar de pestaña, y el control vive lejos de lo que filtra.

## Decisión

1. **Dos buscadores, cada uno dentro de su pestaña**:
   - En `#grupos`, "Buscar grupos y canales" (`#options-search-groups`), entre la barra "+ Grupo" / "Ordenar A-Z" y el
     árbol. Filtra el árbol y el panel de canales del grupo exactamente como hoy (`searchGroups`; oculta mover,
     fusionar, ordenar y arrastre mientras hay texto; vacía la selección del panel).
   - En `#canales`, "Buscar canales" (`#options-search-channels`), debajo del selector "Mostrar N canales por página" y
     antes de "Canales sin grupo". Filtra las tres listas (sin grupo, ocultos, inactivos).
2. **Independientes**: cada uno tiene su propio texto; escribir en uno no filtra lo de la otra pestaña. El texto se
   conserva al cambiar de pestaña (los campos siguen en el DOM dentro de su panel oculto) y no se guarda entre
   recargas, como hasta ahora.
3. **Paginación**: cambiar el texto vuelve a la página 1 de las listas que ese buscador filtra (la paginación ya
   reinicia cuando cambia la consulta); las de la otra pestaña no cambian de página.
4. **Sin lógica de visibilidad**: se retiran el buscador de la cabecera, `SEARCH_TABS` y la regla
   `.options__search[hidden]`; cada buscador se ve porque se ve su panel.
5. **Estilo común**: los dos usan `<label class="options__search">` con el texto visible y el `input type="search"`
   dentro (nombre accesible por la etiqueta), y el campo comparte regla con `.options__input` (misma letra, borde y
   radio), en tema claro y oscuro.

## Alternativas descartadas

- **Un solo texto compartido por los dos campos**: mantiene el problema de filtros "invisibles" en la otra pestaña.
- **Buscador común en la cabecera con etiqueta que cambie según la pestaña**: sigue lejos de lo que filtra y obliga a
  mantener la lógica de visibilidad por pestaña.
- **Guardar el texto en `localStorage`**: un filtro olvidado al volver a abrir la página esconde datos; no se ha
  pedido.

## Consecuencias

- Se gana: cada pestaña filtra solo lo suyo, el campo está junto a lo que filtra y desaparece la lógica de mostrar u
  ocultar el buscador.
- Se pierde: no se puede buscar un mismo texto en grupos y listas de una vez; hay que escribirlo en cada pestaña.
- A vigilar: si una pestaña nueva necesita filtrar, lleva su propio buscador dentro del panel con la misma clase.
