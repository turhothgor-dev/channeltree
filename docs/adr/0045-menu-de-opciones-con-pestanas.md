# 0045 · Menú de opciones de la guía con pestañas y altura limitada a la ventana

- Estado: aceptada
- Fecha: 2026-11-24
- Modifica: [0017](0017-menu-de-opciones-en-la-guia.md) (punto 1: las secciones dejan de ser `<details>`; punto 2: el
  scroll pasa del menú entero al panel activo), [0032](0032-ajustes-en-el-menu-y-sin-reproducir-grupo.md) (punto 2:
  Listas, Filtros y Ajustes como pestañas) y [0033](0033-atajos-en-el-menu-de-la-guia.md) (punto 3: los atajos siguen
  dentro de Ajustes, ahora una pestaña)

## Contexto

Plan 2026-11-24-fase6-31-menu-en-pestanas-y-cabecera
(ROADMAP 6-31). El menú ⚙ (`#youtube-groups-menu`, `ui/panel.js`) apila tres `<details>` (Listas, Filtros y Ajustes,
con "Atajos de teclado" dentro de Ajustes). Con varias secciones abiertas el menú crece hasta la altura máxima
(`100vh - 16px`) y se desplaza entero: el título de cada sección se pierde al bajar, y como `getMenuPosition` mide el
menú al abrirlo, el contenido que llega después (listas, atajos, estado de la actualización) puede hacerlo pasar del
borde inferior de la ventana. Los ADR 0032 y 0033 ya avisaban de que el menú crecía.

Restricciones: script de contenido sin dependencias; el menú vive en `document.body` de `www.youtube.com`, cuyo
`localStorage` es de YouTube; mismas funciones, carga perezosa y tests de cada sección.

## Decisión

1. **Cabecera fija**: arriba, `h2.youtube-groups__menu-title` "Opciones de visualización" (el diálogo pasa de
   `aria-label` a `aria-labelledby` con su `id`) y debajo un `tablist` con tres pestañas: Listas, Filtros (con
   "Filtros (N)" si hay N criterios activos) y Ajustes.
2. **Pestañas ARIA** (patrón de la APG con activación automática, como el selector de iconos y la página de opciones):
   `button[role=tab]` con `aria-selected`, `aria-controls` y tabulador itinerante; flechas izquierda y derecha
   (circulares), Inicio y Fin cambian de pestaña y mueven el foco, sin propagar el evento (para no activar los atajos
   de YouTube, como el avance del vídeo con las flechas en `/watch`). Cada sección es un `div[role=tabpanel]` con
   `tabindex="0"` y `aria-labelledby`; solo la activa está visible. Las clases de sección
   (`youtube-groups__playlists`, `__filters`, `__settings`) se conservan en los paneles. La lógica de teclado se escribe
   en `ui/panel.js` siguiendo la del selector de iconos; no se carga `options/tabs.js` en los scripts de contenido
   (gestiona hash e historial de la página de opciones).
3. **Altura**: el menú es una columna flexible con `max-height: calc(100vh - 16px)` y sin scroll propio; la cabecera
   no se encoge y solo el panel activo se desplaza (`overflow-y: auto`, `min-height: 0`). `getMenuPosition` no cambia:
   el menú se recoloca al abrirlo, al cambiar de pestaña y, si existe `ResizeObserver`, cada vez que cambia de tamaño
   mientras está abierto (se desconecta al cerrarlo). Así siempre queda dentro de la ventana.
4. **Última pestaña**: se recuerda en `sessionStorage` (`youtubeGroupsMenuTab`, como los traspasos de
   `youtubeGroupsPendingFilter` y `youtubeGroupsExitAcks`): sobrevive a cerrar y abrir el menú y a recargar la pestaña,
   no se comparte entre pestañas ni se sincroniza. Un valor desconocido o un `sessionStorage` que falla abren Listas.
5. **Carga perezosa sin cambios**: el menú se crea al abrirlo por primera vez; Ajustes lee al crearse y los atajos al
   pasar de cerrado a abierto, esté activa la pestaña que esté.

## Alternativas descartadas

- **Mantener `<details>` y solo limitar la altura**: con dos secciones abiertas el scroll sigue mezclándolas y la
  cabecera de cada una se pierde.
- **Recordar la pestaña en `browser.storage.local` o en `youtubeSettings`**: una escritura por clic, una clave o un
  campo más que validar, copiar y sincronizar entre dispositivos para una preferencia de vista; no aporta frente a la
  sesión.
- **`localStorage` de la página**: es el de `www.youtube.com` y persistiría para siempre en el origen de YouTube.
- **Solo en memoria**: se perdería al recargar YouTube, que es frecuente.
- **Reutilizar `options/tabs.js`**: arrastra hash, historial y alias de la página de opciones; las 20 líneas de
  teclado no justifican un módulo compartido en este plan.
- **"Atajos de teclado" como cuarta pestaña**: el ADR 0033 lo dejó dentro de Ajustes a petición de la persona.
- **Altura fija del menú**: dejaría huecos en Filtros, que es corto; recolocar al cambiar de tamaño basta.

## Consecuencias

- Se gana: el menú nunca pasa de la ventana, el título y las pestañas están siempre a la vista y cada sección se ve
  sola.
- Se pierde: ver dos secciones a la vez; un clic más para pasar de Listas a Ajustes.
- A vigilar: el ancho de 360 px debe dar para las tres pestañas con "Filtros (3)"; `ResizeObserver` recoloca también
  cuando cambia el contenido del panel (no cambia el tamaño, así que no hay bucle).
