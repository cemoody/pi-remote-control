/**
 * Update execution — actually re-fetch a source to its latest code.
 *
 * IMPORTANT (the gotcha this module exists for): `removeExtensionPackage` only
 * drops the settings entry, and the git install path skips cloning when the
 * target directory already exists. So a naive remove+install does NOT update a
 * git checkout. This module performs a real in-place update instead:
 *   - npm:   `npm install <pkg>@latest --prefix <managed-npm-prefix>`
 *   - git:   `git fetch` + `git pull --ff-only` in the managed checkout
 *   - local: no-op (nothing to fetch)
 * Pinned sources are refused so we never move a deliberate pin.
 */
import path from "node:path";
import { packageInstallTarget, parsePackageSource, type PackageCommandRunner } from "./packages.js";
import { isPinned, type SourceKind } from "./update-status.js";

export interface UpdateApplyOptions {
  readonly configDir: string;
  readonly cwd?: string;
  readonly runner?: PackageCommandRunner;
}

export interface UpdateApplyResult {
  readonly source: string;
  readonly kind: SourceKind;
  readonly updated: boolean;
  /** Why an update was skipped (local / pinned / etc). */
  readonly reason?: string;
}

export async function updateSource(source: string, options: UpdateApplyOptions): Promise<UpdateApplyResult> {
  const parsed = parsePackageSource(source);
  const runner = options.runner ?? defaultPackageRunner;
  const cwd = options.cwd ?? options.configDir;

  if (parsed.type === "local") {
    return { source, kind: "local", updated: false, reason: "Local sources are edited in place and cannot be auto-updated." };
  }
  if (isPinned(source)) {
    return { source, kind: parsed.type, updated: false, reason: "Source is pinned to a specific version/ref; refusing to move it." };
  }

  if (parsed.type === "npm") {
    const prefix = path.join(options.configDir, "packages", "npm");
    const spec = hasVersionSpecifier(parsed.spec) ? parsed.spec : `${parsed.packageName}@latest`;
    await runner("npm", ["install", "--prefix", prefix, spec], { cwd: options.configDir });
    return { source, kind: "npm", updated: true };
  }

  // git: fetch + fast-forward in place.
  const target = packageInstallTarget(source, options.configDir, cwd);
  await runner("git", ["fetch", "--tags", "--prune"], { cwd: target });
  await runner("git", ["pull", "--ff-only"], { cwd: target });
  return { source, kind: "git", updated: true };
}

function hasVersionSpecifier(spec: string): boolean {
  const withoutScope = spec.startsWith("@") ? spec.slice(1) : spec;
  return withoutScope.includes("@");
}

const defaultPackageRunner: PackageCommandRunner = async (command, args, options) => {
  const { spawn } = await import("node:child_process");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...args], { cwd: options.cwd, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))));
  });
};
