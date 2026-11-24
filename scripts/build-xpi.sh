#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Javier López Diego

# Empaqueta la extensión como web-ext-artifacts/channeltree-<versión>.xpi y verifica su contenido.
#
# Uso: bash scripts/build-xpi.sh [--require-clean] [--check-version] [--dry-run] [--help]
#
#   --require-clean  Falla si el árbol de trabajo tiene cambios sin commit.
#   --check-version  Falla si la versión de manifest.json no es estrictamente mayor que el último tag v*.
#   --dry-run        Hace las comprobaciones, imprime versión y destino y sale sin construir.
#   --help, -h       Muestra esta ayuda.
#
# Windows nativo no es objetivo: usa WSL.
# Ver docs/adr/0048-publicacion-en-amo.md.

set -euo pipefail

cd "$(dirname "$0")/.."

usage() {
  cat <<'EOF'
Uso: bash scripts/build-xpi.sh [--require-clean] [--check-version] [--dry-run] [--help]

  --require-clean  Falla si el árbol de trabajo tiene cambios sin commit.
  --check-version  Falla si la versión de manifest.json no es mayor que el último tag v*.
  --dry-run        Hace las comprobaciones, imprime versión y destino y sale sin construir.
  --help, -h       Muestra esta ayuda.
EOF
}

require_clean=0
check_version=0
dry_run=0

for arg in "$@"; do
  case "$arg" in
    --help | -h)
      usage
      exit 0
      ;;
    --require-clean) require_clean=1 ;;
    --check-version) check_version=1 ;;
    --dry-run) dry_run=1 ;;
    *)
      echo "Opción desconocida: $arg" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [ "$require_clean" -eq 1 ] && [ -n "$(git status --porcelain)" ]; then
  echo "El árbol de trabajo tiene cambios sin commit" >&2
  exit 1
fi

version="$(node -p "require('./manifest.json').version")"
if ! printf '%s' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "La versión de manifest.json (\"$version\") no tiene el formato X.Y.Z" >&2
  exit 1
fi

if [ "$check_version" -eq 1 ]; then
  last_tag="$(git tag -l 'v*' | sort -V | tail -n 1)"
  if [ -n "$last_tag" ]; then
    last_version="${last_tag#v}"
    highest="$(printf '%s\n%s\n' "$last_version" "$version" | sort -V | tail -n 1)"
    if [ "$version" = "$last_version" ] || [ "$highest" != "$version" ]; then
      echo "La versión de manifest.json ($version) no es mayor que el último tag ($last_tag)." >&2
      echo "Súbela en manifest.json antes de publicar." >&2
      exit 1
    fi
  fi
fi

zip_path="web-ext-artifacts/channeltree-${version}.zip"
xpi_path="web-ext-artifacts/channeltree-${version}.xpi"

if [ "$dry_run" -eq 1 ]; then
  echo "Versión: $version"
  echo "Destino: $xpi_path"
  exit 0
fi

if ! command -v unzip >/dev/null 2>&1; then
  echo "Falta 'unzip' para verificar el paquete. Instálalo (p. ej. sudo apt install unzip)." >&2
  exit 1
fi

npx --no-install web-ext build --filename "channeltree-${version}.zip"
cp "$zip_path" "$xpi_path"

entries="$(unzip -Z1 "$xpi_path")"

extra="$(printf '%s\n' "$entries" | grep -E '^(docs/|tests/|third_party/|scripts/|ai/|node_modules/)|^(package\.json|package-lock\.json|Makefile|web-ext-config\.mjs)$' || true)"
missing=""
for required in manifest.json THIRD_PARTY_NOTICES.md LICENSE.md; do
  if ! printf '%s\n' "$entries" | grep -Fxq "$required"; then
    missing="${missing}${required}"$'\n'
  fi
done

if [ -n "$extra" ] || [ -n "$missing" ]; then
  if [ -n "$extra" ]; then
    echo "El paquete lleva ficheros que no deberían estar:" >&2
    printf '%s\n' "$extra" >&2
  fi
  if [ -n "$missing" ]; then
    echo "Al paquete le faltan ficheros obligatorios:" >&2
    printf '%s' "$missing" >&2
  fi
  exit 1
fi

size="$(wc -c <"$xpi_path" | tr -d ' ')"
if command -v sha256sum >/dev/null 2>&1; then
  sum="$(sha256sum "$xpi_path" | cut -d ' ' -f 1)"
else
  sum="$(shasum -a 256 "$xpi_path" | cut -d ' ' -f 1)"
fi
human="$(awk -v b="$size" 'BEGIN { printf "%.1f KiB", b / 1024 }')"

echo "Paquete: $xpi_path"
echo "Tamaño: $size bytes ($human)"
echo "SHA-256: $sum"
