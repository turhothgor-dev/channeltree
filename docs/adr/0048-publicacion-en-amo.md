# 0048 · Publicación en addons.mozilla.org (canal listed, firma por API)

- Estado: aceptada
- Fecha: 2026-11-24

## Contexto

La extensión solo se ha probado con `make up` y `make build`, que deja un `.zip` sin firmar. Para que cualquiera pueda
instalarla en Firefox de forma estable, la extensión tiene que estar firmada por Mozilla. Las reglas del proyecto
impiden que un agente haga nada irreversible o hacia fuera (firmar, enviar a AMO, `git push`), y las credenciales no
pueden pasar por `.env` (los agentes no lo leen y un hook lo bloquea).

## Decisión

Se publica en AMO en el canal **listed** (catálogo público, con revisión y actualizaciones automáticas para quien la
instale). La **primera** versión se sube a mano por el Developer Hub (fichas, capturas, licencia y política de
privacidad); las siguientes, con `make publish`, que ejecuta `web-ext sign --channel=listed` con las credenciales JWT
de AMO tomadas del entorno de la persona (`AMO_JWT_ISSUER`, `AMO_JWT_SECRET`). La única fuente de la versión es
`manifest.json` (semver `X.Y.Z`); cada versión publicada lleva un tag `vX.Y.Z`. Los agentes preparan la release
(versión, `CHANGELOG.md`, comprobaciones, paquete `.xpi` y commit) con el flujo de `docs/RELEASE.md`; firmar, etiquetar y
`git push` los hace una persona.

## Alternativas descartadas

- **Autodistribución (unlisted)**: también firma, pero obliga a alojar el `.xpi` y a mantener un `update_url`; no da
  visibilidad ni actualizaciones sin infraestructura propia.
- **Publicar desde CI (GitHub Actions) con secretos**: automatiza más, pero el proyecto no tiene CI de release y
  añade secretos fuera de la máquina de la persona; se puede añadir después sin cambiar este flujo.
- **Versión también en `package.json`**: `package.json` es privado y no se publica; mantener dos versiones sincronizadas
  solo añade errores. Su campo `version` no se usa.

## Consecuencias

- `make release-check` y `scripts/build-xpi.sh` comprueban lo que AMO rechazaría (versión no mayor que la última
  publicada, ficheros que no deben ir en el paquete) antes de subir nada.
- AMO no deja reutilizar un número de versión, ni aunque se borre la subida: una versión mal publicada obliga a subir
  la siguiente.
- El nombre "YouTube Groups" empieza por una marca de terceros; si la revisión lo pide, habrá que renombrarla (p. ej.
  "Groups for YouTube") en un plan aparte. Resuelto en el ADR 0050: «ChannelTree: YouTube Subscriptions & Groups».
- Windows nativo no es objetivo del script de empaquetado (bash); allí se usa WSL.
