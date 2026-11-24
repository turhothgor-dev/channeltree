# ChannelTree: YouTube Subscriptions & Groups

Extensión de Firefox para organizar tus suscripciones de YouTube en grupos y subgrupos y filtrar sus vídeos por grupo.

## Privacidad

La extensión guarda todo en tu navegador (`browser.storage.local`; `browser.storage.sync` solo si activas la
sincronización) y no tiene servidores propios ni envía nada a terceros.

Con "Actualizar en segundo plano" activado (Ajustes del menú de la guía; está activado por defecto), una pestaña de
YouTube visible con sesión iniciada hace peticiones a `www.youtube.com`, y solo a `www.youtube.com`, como las haría la
propia página con tu sesión:

- **Qué se pide**: la lista de tus suscripciones (`/feed/channels`, con sus páginas siguientes) y las primeras páginas
  de tu feed de suscripciones (`/feed/subscriptions`).
- **Cada cuánto**: como mucho una vez por hora y desde una sola pestaña, a partir de unos 20 segundos después de
  cargar YouTube; con 1,5 segundos de pausa entre peticiones.
- **Qué se guarda**: nombre, dirección, descripción y avatar de tus suscripciones, los vídeos nuevos de tus canales
  agrupados y la fecha del último vídeo de cada canal, más el estado de la última actualización y una huella (hash) de
  tu cuenta para detectar si cambias de cuenta. La cookie de sesión y el identificador de tu cuenta no se guardan ni se
  escriben en la consola.
- **Nada sale de youtube.com**: la extensión no pide permisos nuevos.
- **Cómo desactivarlo**: desmarca "Actualizar en segundo plano" en Ajustes; sin él, la extensión no hace ninguna
  petición y solo aprende de lo que ves en YouTube.

## Desarrollo

Requisitos: Node (versión de `.nvmrc`) y Firefox.

- `make setup`: instala las dependencias.
- `make up`: abre la extensión en Firefox para probarla.
- `make test`: ejecuta los tests.
- `make lint`: comprueba el código.
- `make xpi`: empaqueta la extensión en `web-ext-artifacts/`.

## Publicación

Publicar en AMO: ver `docs/RELEASE.md`.

## Créditos

Los iconos de los grupos son de [Firefox Emoji (fxemoji)](https://github.com/mozilla/fxemoji), de Mozilla
Foundation, con licencia [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Se han convertido de SVG a
datos JavaScript sin cambiar el dibujo. Detalle en `THIRD_PARTY_NOTICES.md`.

## Licencia

Copyright (C) 2026 Javier López Diego

Dirección, arquitectura, diseño, lógica y estructura del proyecto: Javier López Diego. Desarrollado con
asistencia de inteligencia artificial.

Licencia GPL-3.0-or-later, ver [`LICENSE.md`](LICENSE.md).
