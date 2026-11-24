// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Javier López Diego

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const ROOT = path.resolve(__dirname, "..");
const skip = process.platform === "win32";

function run(...args) {
  return spawnSync("bash", ["scripts/build-xpi.sh", ...args], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

test(
  "build-xpi.sh --help sale con 0 y documenta las opciones",
  { skip },
  () => {
    const result = run("--help");
    assert.equal(result.status, 0);
    for (const option of ["--require-clean", "--check-version", "--dry-run"]) {
      assert.ok(result.stdout.includes(option), option);
    }
  },
);

test(
  "build-xpi.sh --dry-run imprime versión y destino sin construir",
  { skip },
  () => {
    const { version } = require("../manifest.json");
    const result = run("--dry-run");
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes(`Versión: ${version}`));
    assert.ok(
      result.stdout.includes(`web-ext-artifacts/channeltree-${version}.xpi`),
    );
  },
);

test("build-xpi.sh con una opción desconocida sale con 2", { skip }, () => {
  const result = run("--nope");
  assert.equal(result.status, 2);
  assert.ok(result.stderr.includes("--nope"));
});

function makeRepo(version, tags) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xpi-repo-"));
  fs.mkdirSync(path.join(dir, "scripts"));
  fs.copyFileSync(
    path.join(ROOT, "scripts", "build-xpi.sh"),
    path.join(dir, "scripts", "build-xpi.sh"),
  );
  fs.writeFileSync(
    path.join(dir, "manifest.json"),
    JSON.stringify({ version }),
  );
  const git = (...args) =>
    spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], {
      cwd: dir,
      encoding: "utf8",
    });
  git("init", "-q");
  git("add", ".");
  git("commit", "-q", "-m", "init");
  for (const tag of tags) git("tag", tag);
  return dir;
}

function runIn(dir, ...args) {
  return spawnSync("bash", ["scripts/build-xpi.sh", ...args], {
    cwd: dir,
    encoding: "utf8",
  });
}

test(
  "--check-version falla con versión igual o menor que el último tag",
  { skip },
  () => {
    const equal = makeRepo("1.2.0", ["v1.0.0", "v1.2.0"]);
    assert.equal(runIn(equal, "--check-version", "--dry-run").status, 1);
    const lower = makeRepo("1.9.0", ["v1.10.0"]);
    const result = runIn(lower, "--check-version", "--dry-run");
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes("v1.10.0"));
  },
);

test("--check-version pasa con versión mayor y sin tags", { skip }, () => {
  const greater = makeRepo("1.10.0", ["v1.9.0"]);
  assert.equal(runIn(greater, "--check-version", "--dry-run").status, 0);
  const none = makeRepo("0.1.0", []);
  assert.equal(runIn(none, "--check-version", "--dry-run").status, 0);
});

test(
  "--require-clean falla con el árbol sucio y sin la opción no se comprueba",
  { skip },
  () => {
    const dir = makeRepo("1.0.0", []);
    fs.writeFileSync(path.join(dir, "sucio.txt"), "x");
    const result = runIn(dir, "--require-clean", "--dry-run");
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes("cambios sin commit"));
    assert.equal(runIn(dir, "--dry-run").status, 0);
  },
);

test("web-ext-config.mjs excluye del paquete los ficheros de desarrollo", async () => {
  const config = (
    await import(pathToFileURL(path.join(ROOT, "web-ext-config.mjs")).href)
  ).default;
  for (const entry of [
    "scripts",
    "docs",
    "tests",
    "third_party",
    "README.md",
    "CHANGELOG.md",
  ]) {
    assert.ok(config.ignoreFiles.includes(entry), entry);
  }
});

test("el paquete lleva LICENSE.md y THIRD_PARTY_NOTICES.md y el script los exige", async () => {
  const config = (
    await import(pathToFileURL(path.join(ROOT, "web-ext-config.mjs")).href)
  ).default;
  for (const entry of ["LICENSE.md", "THIRD_PARTY_NOTICES.md"]) {
    assert.ok(!config.ignoreFiles.includes(entry), entry);
  }
  const script = fs.readFileSync(
    path.join(ROOT, "scripts", "build-xpi.sh"),
    "utf8",
  );
  const loop = script.split("\n").find((l) => l.includes("for required in"));
  assert.ok(loop, "bucle de obligatorios");
  assert.ok(loop.includes("LICENSE.md"));
  assert.ok(loop.includes("THIRD_PARTY_NOTICES.md"));
});
