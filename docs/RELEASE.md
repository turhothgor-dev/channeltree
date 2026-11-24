# Publicar la extensión en addons.mozilla.org (AMO)

Guía para publicar ChannelTree en el canal **listed** de AMO. La decisión está en el
[ADR 0048](adr/0048-publicacion-en-amo.md).

> Un agente nunca ejecuta `make publish`, `make sign`, `git tag` ni `git push`: lo hace una persona.

## 1. Resumen del flujo

1. Preparar la release (persona, o un asistente que nunca publica): sube la versión, actualiza `CHANGELOG.md`, pasa
   `make release-check` y hace el commit `chore: release vX.Y.Z`.
2. Revisión del commit (persona).
3. `git tag vX.Y.Z` y `git push --follow-tags` (persona).
4. `make publish` (persona), con las credenciales de AMO en su entorno.

La primera versión se sube **a mano** por el Developer Hub (sección 5). A partir de la segunda se puede usar
`make publish` (sección 8).

## 2. Cuenta de desarrollador

1. Crea o usa una cuenta de Mozilla y entra en <https://addons.mozilla.org/developers/>.
2. Acepta el acuerdo de distribución para desarrolladores.
3. Activa la verificación en dos pasos en la cuenta: AMO la exige para enviar extensiones y para generar claves de
   API.

## 3. Listed frente a autodistribución

- **Listed**: la extensión aparece en el catálogo de AMO, pasa su revisión y los usuarios reciben las
  actualizaciones solos. Es lo que usa este proyecto (ADR 0048).
- **Autodistribución (unlisted)**: AMO solo firma el paquete; hay que alojar el `.xpi` y un `update_url` propios y
  distribuirlo por tu cuenta. No se usa aquí.

## 4. Qué preparar antes de la primera subida

Este plan no lo genera; lo prepara la persona (o un plan aparte):

- **Icono** de 128 × 128 PNG para la ficha. Recomendado: añadir también `icons` al `manifest.json` (plan aparte).
- **Capturas**: de 1 a 10 (1280 × 800 recomendado) de la guía con grupos, el menú de opciones y la página de
  opciones.
- **Metadatos**: nombre, resumen (máximo 250 caracteres), descripción, categoría (p. ej. "Fotos, música y vídeos"),
  etiquetas, web y correo de soporte.
- **Licencia**: ya está decidida. En AMO elige "GNU General Public License v3.0 or later"; el texto está en
  `LICENSE.md`.
- **Política de privacidad**: basada en la sección Privacidad del `README.md`.
- **Nombre**: «ChannelTree: YouTube Subscriptions & Groups» (ADR 0050).

## 5. Primera subida manual

1. `make release-check` (lint, tests, versión mayor que el último tag y `.xpi`).
2. En el Developer Hub, "Submit a New Add-on" y "On this site".
3. Sube `web-ext-artifacts/channeltree-X.Y.Z.xpi`.
4. Compatibilidad: Firefox para escritorio.
5. Pregunta sobre código fuente: responde según la sección 6.
6. Rellena los metadatos de la sección 4.
7. Pega las notas de la sección 6 en "Notes to reviewer".
8. Envía la versión.

## 6. Qué contestar en la revisión

Texto listo para pegar en "Notes to reviewer":

- **Permisos**: `storage` (grupos, ajustes y listas en `storage.local`; `storage.sync` solo si se activa la
  sincronización). El acceso a `www.youtube.com` es solo por `content_scripts` (`*://www.youtube.com/*`), sin
  `host_permissions` ni `tabs`. `commands` define dos atajos de teclado.
- **Red**: las únicas peticiones salen del script de contenido a `www.youtube.com` (actualización en segundo plano,
  ADR 0042, desactivable en Ajustes). No hay servidor propio ni de terceros.
- **Cookies de sesión**: `modules/yt-data.js` lee de `document.cookie` las tres cookies `SAPISID`,
  `__Secure-1PAPISID` y `__Secure-3PAPISID` solo para calcular las cabeceras `SAPISIDHASH`, `SAPISID1PHASH` y
  `SAPISID3PHASH` que la propia web de YouTube usa en sus peticiones internas, y únicamente en peticiones a
  `www.youtube.com`. Nunca se guardan, no se registran ni se envían a otro sitio. Se guarda solo una huella SHA-256
  del identificador de cuenta, en local.
- **Datos**: nada se transmite al desarrollador ni a terceros, coherente con
  `data_collection_permissions: { required: ["none"] }`.
- **Código fuente**: no está minificado, concatenado ni transpilado; no hacen falta fuentes adicionales.
  `modules/fxemoji-data.js` son datos transcritos de los SVG de fxemoji (`third_party/fxemoji/`, fuera del paquete;
  `tests/fxemoji.test.js` comprueba que coinciden). Se puede enlazar el repositorio si lo piden.
- **Atribución**: iconos de Mozilla fxemoji (CC BY 4.0) y Material Icons de Google (Apache 2.0), en
  `THIRD_PARTY_NOTICES.md` (incluido en el paquete).

## 7. Versiones y actualizaciones

- Semver `MAJOR.MINOR.PATCH`: `MAJOR` para cambios que rompen datos o uso, `MINOR` para funciones nuevas, `PATCH`
  para correcciones.
- La versión vive solo en `manifest.json`.
- AMO no admite reutilizar ni bajar una versión.
- Cada release lleva el tag `vX.Y.Z`.
- Los usuarios de listed reciben la actualización automáticamente.

## 8. Firma por API (`make publish`)

1. Obtén las claves JWT en <https://addons.mozilla.org/developers/addon/api/key/>.
2. Expórtalas como `AMO_JWT_ISSUER` y `AMO_JWT_SECRET` en tu **entorno de usuario**. Nunca en `.env`, ni en el
   repositorio, ni se las des a un agente.
3. Con el tag `vX.Y.Z` creado en `HEAD`, ejecuta `make publish`.

`make publish` (y `make sign`) se niega a firmar si el entorno tiene `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`
(Claude Code), `CLINE_ACTIVE` o `AI_AGENT` (variable genérica: otras herramientas de IA deberían definirla): lo
ejecuta una persona, no un agente.

Antes de firmar, `make publish` comprueba, en este orden: que no es un agente; que las dos variables existen; que el árbol está limpio y
el paquete tiene el contenido correcto (`scripts/build-xpi.sh --require-clean`); y que `HEAD` tiene el tag
`v<versión>`. Después ejecuta `web-ext sign --channel=listed --approval-timeout=0`: no espera a la revisión, y la
versión aparece en el Developer Hub. `web-ext sign` vuelve a empaquetar la extensión desde el código con la misma
configuración (`web-ext-config.mjs`), así que el paquete firmado es equivalente al `.xpi` de `make xpi`. `make sign` es un alias de `make publish`.

## 9. Lista de comprobación previa

- [ ] `make lint` y `make test` en verde (`make release-check` los incluye).
- [ ] Prueba manual con `make up`: guía, filtro, marcar visto, listas, página de opciones, copia de seguridad y
      actualización en segundo plano con sesión iniciada.
- [ ] Versión mayor que el último tag.
- [ ] `CHANGELOG.md` actualizado.
- [ ] `make xpi` sin avisos de contenido.
- [ ] Árbol limpio y tag creado antes de `make publish`.

## 10. Cambio de id en un Firefox de pruebas

Si tienes instalada la extensión con el id antiguo (`youtube-groups@turhothgor`), como temporal o desde un `.xpi` de
pruebas, no verás sus datos con el id nuevo (`channeltree@turhothgor`). Para conservarlos:

1. "Exportar copia" en la pestaña Datos de las opciones.
2. Quita la extensión antigua en `about:addons` o `about:debugging`.
3. Carga la nueva.
4. "Importar copia".

Si la sincronización estaba activada, vuelve a activarla: la réplica de `storage.sync` va por id y la del id antiguo
no se ve. `make up` usa un perfil temporal nuevo cada vez y no tiene datos que conservar.
