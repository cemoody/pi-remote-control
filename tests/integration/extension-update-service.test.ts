import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { installExtensionPackage, packageInstallTarget } from "../../src/extensions/packages.js";
import { buildSourceCheckEntries, checkExtensionUpdates, readInstalledIdentity } from "../../src/extensions/update-service.js";
import type { CommandOutputRunner } from "../../src/extensions/update-check.js";
import { createTempPrcHome, type TempPrcHome } from "../helpers/temp-pi-crust-home.js";

const execFileAsync = promisify(execFile);
let homes: TempPrcHome[] = [];
afterEach(async () => { await Promise.all(homes.splice(0).map((h) => h.cleanup())); });
async function makeHome() { const h = await createTempPrcHome(); homes.push(h); return h; }

const ok = (stdout: string) => ({ stdout, stderr: "", exitCode: 0 });

describe("update-service — building entries from settings", () => {
  it("reads installed npm version from the managed package", async () => {
    const home = await makeHome();
    // Simulate an installed npm package by writing its manifest.
    const pkgDir = path.join(home.configDir, "packages", "npm", "node_modules", "demo");
    await fs.mkdir(pkgDir, { recursive: true });
    await fs.writeFile(path.join(pkgDir, "package.json"), JSON.stringify({ name: "demo", version: "1.1.0" }), "utf8");
    await installExtensionPackage("npm:demo", { configDir: home.configDir, runner: async () => undefined });

    const identity = await readInstalledIdentity("npm:demo", home.configDir);
    expect(identity.version).toBe("1.1.0");

    const entries = await buildSourceCheckEntries({ packages: [{ source: "npm:demo", installedPath: "packages/npm/node_modules/demo", kind: "npm" }] }, home.configDir);
    expect(entries).toEqual([{ source: "npm:demo", installedVersion: "1.1.0" }]);
  });

  it("reads the git HEAD sha of a managed checkout", async () => {
    const home = await makeHome();
    const repo = path.join(home.root, "src-repo");
    await fs.mkdir(repo, { recursive: true });
    await fs.writeFile(path.join(repo, "package.json"), JSON.stringify({ name: "g", version: "0.0.0", piRemoteControl: { extension: "./i.mjs" } }), "utf8");
    await fs.writeFile(path.join(repo, "i.mjs"), "export default function(){}", "utf8");
    await execFileAsync("git", ["init", "-b", "main"], { cwd: repo });
    await execFileAsync("git", ["config", "user.email", "t@e.invalid"], { cwd: repo });
    await execFileAsync("git", ["config", "user.name", "t"], { cwd: repo });
    await execFileAsync("git", ["add", "."], { cwd: repo });
    await execFileAsync("git", ["commit", "-m", "i"], { cwd: repo });
    await installExtensionPackage(`git:${repo}`, { configDir: home.configDir });

    const target = packageInstallTarget(`git:${repo}`, home.configDir);
    const realSha = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: target })).stdout.trim();
    const identity = await readInstalledIdentity(`git:${repo}`, home.configDir);
    expect(identity.sha).toBe(realSha);
  });

  it("runs the full check with an injected runner", async () => {
    const home = await makeHome();
    const pkgDir = path.join(home.configDir, "packages", "npm", "node_modules", "demo");
    await fs.mkdir(pkgDir, { recursive: true });
    await fs.writeFile(path.join(pkgDir, "package.json"), JSON.stringify({ name: "demo", version: "1.0.0" }), "utf8");

    const runner: CommandOutputRunner = async () => ok("1.5.0\n");
    const updates = await checkExtensionUpdates(
      { packages: [{ source: "npm:demo", installedPath: "packages/npm/node_modules/demo", kind: "npm" }] },
      { configDir: home.configDir, runner },
    );
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ source: "npm:demo", state: "update-available", installed: "1.0.0", latest: "1.5.0" });
  });
});
