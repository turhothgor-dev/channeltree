// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

// Configuración de web-ext (make up, make lint, make build): el paquete solo lleva el código de la
// extensión, no la documentación ni las herramientas.
export default {
  ignoreFiles: [
    "Makefile",
    "package.json",
    "package-lock.json",
    "web-ext-config.mjs",
    "docs",
    "scripts",
    "README.md",
    "CHANGELOG.md",
    "tests",
    "third_party",
    "web-ext-artifacts",
  ],
  build: {
    overwriteDest: true,
  },
};
