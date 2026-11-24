# Objetivos del proyecto (Node según `.nvmrc`).
SHELL := /bin/bash

.DEFAULT_GOAL := help
.PHONY: help setup up test lint format build xpi release-check publish sign

# Extensión de Firefox (Manifest V3): web-ext (lint, ejecutar, empaquetar) y Prettier (formato).
WEB_EXT := npx --no-install web-ext
PRETTIER := npx --no-install prettier
EXT_FILES := "**/*.{js,mjs,css,html,json}"

help: ## Muestra los objetivos disponibles
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "} {printf "  %-15s %s\n", $$1, $$2}'

setup: ## Instala dependencias (web-ext y Prettier)
	npm ci --no-fund --no-audit

up: ## Abre Firefox con la extensión cargada y recarga al guardar
	$(WEB_EXT) run --url https://www.youtube.com

test: ## Todos los tests (node --test; ficheros *.test.js)
	node --test

lint: ## Comprobaciones estáticas: web-ext lint y formato (Prettier)
	$(WEB_EXT) lint
	$(PRETTIER) --check $(EXT_FILES)

format: ## Formatea el código de la extensión (Prettier)
	$(PRETTIER) --write $(EXT_FILES)

build: ## Empaqueta la extensión en web-ext-artifacts/
	$(WEB_EXT) build

xpi: ## Empaqueta la extensión como web-ext-artifacts/channeltree-<versión>.xpi
	bash scripts/build-xpi.sh $(ARGS)

release-check: ## Comprueba una release: lint, tests, versión mayor que el último tag v* y .xpi
	$(MAKE) lint
	$(MAKE) test
	bash scripts/build-xpi.sh --check-version

publish: ## Firma y envía la versión a AMO (canal listed); lo ejecuta una persona
	@for a in CLAUDECODE CLAUDE_CODE_ENTRYPOINT CLINE_ACTIVE AI_AGENT; do \
	  if [ -n "$${!a:-}" ]; then \
	    echo "make publish lo ejecuta una persona, no un agente (entorno de agente detectado: $$a). Ver docs/RELEASE.md." >&2; \
	    exit 1; \
	  fi; \
	done; \
	for v in AMO_JWT_ISSUER AMO_JWT_SECRET; do \
	  if [ -z "$${!v:-}" ]; then \
	    echo "Falta la variable $$v. Se obtienen en https://addons.mozilla.org/developers/addon/api/key/ y se exportan en el entorno de usuario (no en .env). Ver docs/RELEASE.md." >&2; \
	    exit 1; \
	  fi; \
	done; \
	bash scripts/build-xpi.sh --require-clean || exit 1; \
	version="$$(node -p "require('./manifest.json').version")"; \
	if ! git tag --points-at HEAD | grep -qx "v$$version"; then \
	  echo "HEAD no tiene el tag v$$version: crea antes el tag v$$version" >&2; \
	  exit 1; \
	fi; \
	WEB_EXT_API_KEY="$$AMO_JWT_ISSUER" WEB_EXT_API_SECRET="$$AMO_JWT_SECRET" $(WEB_EXT) sign --channel=listed --approval-timeout=0

sign: publish ## Alias de publish; lo ejecuta una persona
