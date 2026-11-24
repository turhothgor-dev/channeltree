// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

test(".env.example documenta las variables de AMO vacías", () => {
  const env = read(".env.example");
  assert.match(env, /^AMO_JWT_ISSUER=$/m);
  assert.match(env, /^AMO_JWT_SECRET=$/m);
});

test("el Makefile declara los objetivos de release con comentario ##", () => {
  const makefile = read("Makefile");
  for (const target of ["xpi", "release-check", "publish", "sign"]) {
    assert.match(makefile, new RegExp(`^${target}:.*## .+`, "m"), target);
  }
  for (const target of ["publish", "sign"]) {
    const line = makefile.match(new RegExp(`^${target}:.*## .+`, "m"))[0];
    assert.ok(line.includes("lo ejecuta una persona"), target);
  }
});

const hasMake =
  process.platform !== "win32" &&
  spawnSync("make", ["--version"], { stdio: "ignore" }).status === 0;

const agentVars = [
  "CLAUDECODE",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLINE_ACTIVE",
  "AI_AGENT",
];

function envWithoutAgent(extra) {
  const env = { ...process.env };
  for (const v of agentVars) delete env[v];
  return { ...env, ...extra };
}

test(
  "make publish sin credenciales falla y nombra la variable que falta",
  { skip: !hasMake },
  () => {
    const res = spawnSync("make", ["-s", "publish"], {
      cwd: root,
      encoding: "utf8",
      env: envWithoutAgent({ AMO_JWT_ISSUER: "", AMO_JWT_SECRET: "" }),
    });
    assert.notStrictEqual(res.status, 0);
    assert.match(res.stderr, /AMO_JWT_ISSUER/);
  },
);

for (const agentVar of agentVars) {
  test(
    `make publish se niega a firmar con ${agentVar} aunque haya credenciales`,
    { skip: !hasMake },
    () => {
      const res = spawnSync("make", ["-s", "publish", "WEB_EXT=echo FIRMADO"], {
        cwd: root,
        encoding: "utf8",
        env: envWithoutAgent({
          [agentVar]: "1",
          AMO_JWT_ISSUER: "falso-issuer",
          AMO_JWT_SECRET: "falso-secret",
        }),
      });
      assert.notStrictEqual(res.status, 0);
      assert.match(res.stderr, /lo ejecuta una persona, no un agente/);
      assert.ok(!res.stdout.includes("FIRMADO"));
    },
  );
}
