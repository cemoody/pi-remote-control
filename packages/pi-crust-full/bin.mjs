#!/usr/bin/env node
// pi-crust-full — thin wrapper that defers to the real `pi-crust` CLI.
//
// Today the four official extensions still ship bundled inside the `pi-crust`
// package itself, so this wrapper has nothing extra to install — it exists so
// that the canonical install command can be the short, stable:
//
//     npx pi-crust-full
//
// Once extensions are extracted into their own packages, they will be added
// as dependencies of `pi-crust-full` (not `pi-crust`), and this same command
// will keep working without users having to change anything.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve as resolvePath } from "node:path";

const require = createRequire(import.meta.url);

let cliPath;
try {
  // Resolve the `pi-crust` package's own `bin` entry via its package.json.
  const pkgPath = require.resolve("pi-crust/package.json");
  const pkg = require("pi-crust/package.json");
  const binField = pkg.bin;
  const relBin = typeof binField === "string" ? binField : binField?.["pi-crust"];
  if (!relBin) {
    throw new Error("pi-crust package has no `bin.pi-crust` entry");
  }
  cliPath = resolvePath(dirname(pkgPath), relBin);
} catch (err) {
  console.error("[pi-crust-full] Failed to locate the `pi-crust` CLI:", err?.message ?? err);
  process.exit(1);
}

const child = spawn(process.execPath, [cliPath, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
