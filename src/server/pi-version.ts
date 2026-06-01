import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Resolve the `pi` command pi-crust spawns for its `pi --mode rpc` workers.
 *
 *   1. `PI_CRUST_PI_COMMAND` override (test/orchestration seam, and the
 *      "always use the globally-installed latest pi" knob).
 *   2. The locally-bundled `node_modules/.bin/pi`, if present.
 *   3. Bare `pi` from PATH.
 *
 * Kept here (rather than private to the pirpc adapter) so /api/health can
 * report the version of the *same* binary that actually runs sessions —
 * otherwise the help dialog would lie when the override points elsewhere.
 */
export function resolvePiCommand(env: NodeJS.ProcessEnv = process.env, cwd: string = process.cwd()): string {
  const override = env.PI_CRUST_PI_COMMAND;
  if (override && override.length > 0) return override;
  const local = path.resolve(cwd, "node_modules", ".bin", process.platform === "win32" ? "pi.cmd" : "pi");
  return existsSync(local) ? local : "pi";
}

export type PiVersionRunner = (command: string) => string | null;

const defaultRunner: PiVersionRunner = (command) => {
  // `pi --version` prints the semver to STDERR, so capture both streams and
  // concatenate — reading stdout alone yields an empty string and a bogus
  // "unknown".
  const result = spawnSync(command, ["--version"], { encoding: "utf8", timeout: 3_000 });
  if (result.error || typeof result.status !== "number") return null;
  const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return combined.trim() ? combined : null;
};

export interface ResolvePiVersionOptions {
  readonly command?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly cwd?: string;
  readonly runner?: PiVersionRunner;
}

/**
 * Best-effort version string of the running pi binary. Runs `<pi> --version`
 * once (the caller is expected to cache the result for the process lifetime —
 * see the startup snapshot in http-api-server.ts). Returns "unknown" rather
 * than throwing if pi is missing or the probe times out, so /api/health never
 * fails just because version detection did.
 */
export function resolvePiVersion(options: ResolvePiVersionOptions = {}): string {
  const command = options.command ?? resolvePiCommand(options.env, options.cwd);
  const runner = options.runner ?? defaultRunner;
  const out = runner(command);
  if (!out) return "unknown";
  // `pi --version` prints just the semver (e.g. "0.78.0"); be defensive about
  // any "pi 0.78.0" prefix or trailing newline by taking the last token of the
  // first non-empty line.
  const firstLine = out.split("\n").map((line) => line.trim()).find((line) => line.length > 0);
  if (!firstLine) return "unknown";
  const token = firstLine.split(/\s+/).pop() ?? "";
  return token || "unknown";
}
