// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { loadOptionsDom } = require("./helpers/load-dom");

test('el panel de canales del editor tiene aria-label "Canales del grupo"', async () => {
  const dom = loadOptionsDom({ store: {} });
  await dom.flush();
  assert.strictEqual(
    dom.document.getElementById("options-channels").getAttribute("aria-label"),
    "Canales del grupo",
  );
  // "canales" es ahora la pestaña de listas (ADR 0039) y no contiene el panel
  // de canales del grupo, que sigue en "Grupos".
  const canales = dom.document.getElementById("canales");
  assert.strictEqual(canales.getAttribute("role"), "tabpanel");
  assert.strictEqual(
    canales.contains(dom.document.getElementById("options-channels")),
    false,
  );
});
