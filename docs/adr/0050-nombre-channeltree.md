# 0050 · Nombre ChannelTree e id `channeltree@turhothgor`

- Estado: aceptada
- Fecha: 2026-11-24

## Contexto

La extensión se llamaba "YouTube Groups", con el id gecko `youtube-groups@turhothgor`. Un nombre que empieza por una
marca de terceros se arriesga a que AMO lo rechace (ADR 0048) y la política de marcas de la Chrome Web Store lo
desaconseja (ADR 0049). La versión 1.0.0 todavía no se ha publicado en ninguna tienda, así que cambiar el nombre y el id
ahora no afecta a ningún usuario.

## Decisión

- **Nombre largo** (`manifest.json` `name`, fichas de AMO y de la Chrome Web Store, licencia, README y CHANGELOG):
  "ChannelTree: YouTube Subscriptions & Groups" (43 caracteres; AMO admite 50 y Chrome 75). Mismo nombre en las dos
  tiendas.
- **Nombre corto** (`manifest.json` `short_name`, y donde el largo no cabe o sobra): "ChannelTree". Se usa en el
  encabezado de la sección de la guía, en el título de la página de opciones ("ChannelTree · Opciones"), en la etiqueta
  ARIA de la barra de botones de la guía ("Acciones de ChannelTree"), en los mensajes de error que nombran la
  extensión, en el prefijo de la consola (`[ChannelTree]`) y en los ficheros que genera: la copia de seguridad
  (`channeltree-AAAA-MM-DD.json`) y el paquete (`channeltree-<versión>.xpi`).
- **Id gecko**: `channeltree@turhothgor`. Es permanente desde la primera publicación.
- **No cambian** los identificadores internos: claves de almacenamiento (`youtubeGroups`, `youtubeSettings`…), clases
  CSS e ids del DOM (`youtube-groups__…`, `#youtube-groups-guide`…), tipos de mensaje (`youtube-groups:…`), objetos
  JavaScript (`YouTubeGroups*`), el campo `format: "youtube-groups-backup"` de la copia de seguridad y el nombre de la
  carpeta del repositorio de trabajo. Las copias exportadas antes del cambio se siguen importando sin conversión.

## Alternativas descartadas

- **"Groups for YouTube"**: evita la marca al principio, pero es genérico y se confunde con otras extensiones.
- **Nombres distintos por tienda**: obliga a mantener una sustitución en el empaquetado de Chrome y a explicar dos
  nombres; con uno que vale en las dos tiendas no hace falta.
- **Renombrar también los identificadores internos**: miles de líneas, una migración de datos de `storage.local` y
  `storage.sync`, y un formato de copia nuevo, sin ninguna ventaja visible para quien la usa.
- **Mantener el id `youtube-groups@turhothgor`**: posible, pero quedaría para siempre con el nombre antiguo; como no se
  ha publicado, cambiarlo hoy es gratis.

## Consecuencias

- Una instalación de pruebas con el id antiguo no ve los datos de la nueva (Firefox guarda `storage.local` y
  `storage.sync` por id): hay que exportar la copia antes, quitar la extensión y volver a importarla. Lo explica
  `docs/RELEASE.md`.
- En el código conviven el nombre visible nuevo y los identificadores internos antiguos: un test impide que "YouTube
  Groups" vuelva a aparecer en textos visibles, código y documentación pública, y los identificadores internos no se
  tocan.
- Resuelve el aviso sobre el nombre del ADR 0048 y la decisión del nombre en Chrome del ADR 0049.
