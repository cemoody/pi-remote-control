import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  installExtensionPackage,
  packageInstallTarget,
  readPrcSettings,
  removeExtensionPackage,
  resolvePackageExtensions,
  type PackageCommandRunner,
} from "../../src/extensions/packages.js";
import { checkSourceUpdate, defaultCommandOutputRunner } from "../../src/extensions/update-check.js";
import { updateSource } from "../../src/extensions/update-apply.js";
import { loadResolvedExtensionEntries } from "../../src/extensions/loader.js";
import { createPrcExtensionHost } from "../../src/extensions/registry.js";
import { createTempPrcHome, type TempPrcHome } from "../helpers/temp-pi-crust-home.js";

const execFileAsync = promisify(execFile);
let homes: TempPrcHome[] = [];

afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => home.cleanup()));
});

async function makeHome(): Promise<TempPrcHome> {
  const home = await createTempPrcHome();
  homes.push(home);
  return home;
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

async function makeGitExtensionRepo(root: string, body: string): Promise<string> {
  const repo = path.join(root, "git-ext-src");
  await fs.mkdir(repo, { recursive: true });
  await fs.writeFile(path.join(repo, "package.json"), JSON.stringify({ name: "git-ext", version: "0.0.0", piRemoteControl: { extension: "./index.mjs" } }), "utf8");
  await fs.writeFile(path.join(repo, "index.mjs"), body, "utf8");
  await git(repo, "init", "-b", "main");
  await git(repo, "config", "user.email", "test@example.invalid");
  await git(repo, "config", "user.name", "pi-crust Test");
  await git(repo, "add", ".");
  await git(repo, "commit", "-m", "v1");
  return repo;
}

const v1Code = "export default function activate(prc){prc.commands.register({id:'g.v',title:'v',run:()=>'v1'});}\n";
const v2Code = "export default function activate(prc){prc.commands.register({id:'g.v',title:'v',run:()=>'v2'});}\n";

describe("extension update — git lifecycle (real git)", () => {
  it("detects an available update and applies it in place", async () => {
    const home = await makeHome();
    const repo = await makeGitExtensionRepo(home.root, v1Code);

    // Install (clones default branch, no pinned ref).
    const settings = await installExtensionPackage(`git:${repo}`, { configDir: home.configDir });
    const target = packageInstallTarget(`git:${repo}`, home.configDir);
    const installedSha = await git(target, "rev-parse", "HEAD");

    // Initially up to date.
    const before = await checkSourceUpdate({ source: `git:${repo}`, installedSha }, { runner: defaultCommandOutputRunner });
    expect(before.state).toBe("up-to-date");

    // Upstream advances.
    await fs.writeFile(path.join(repo, "index.mjs"), v2Code, "utf8");
    await git(repo, "commit", "-am", "v2");

    const after = await checkSourceUpdate({ source: `git:${repo}`, installedSha }, { runner: defaultCommandOutputRunner });
    expect(after.state).toBe("update-available");

    // Apply the update.
    const result = await updateSource(`git:${repo}`, { configDir: home.configDir });
    expect(result).toMatchObject({ kind: "git", updated: true });

    const updatedSha = await git(target, "rev-parse", "HEAD");
    expect(updatedSha).not.toBe(installedSha);

    // Reload sees the new code.
    const resolved = await resolvePackageExtensions(settings, { cwd: home.configDir });
    const host = createPrcExtensionHost();
    await host.activateAll(await loadResolvedExtensionEntries(resolved.extensions));
    await expect(host.commands.run("g.v")).resolves.toBe("v2");
  });

  it("REGRESSION: removeExtensionPackage does not delete files (why a real update path is required)", async () => {
    const home = await makeHome();
    const repo = await makeGitExtensionRepo(home.root, v1Code);
    await installExtensionPackage(`git:${repo}`, { configDir: home.configDir });
    const target = packageInstallTarget(`git:${repo}`, home.configDir);

    await removeExtensionPackage(`git:${repo}`, { configDir: home.configDir });

    // Settings entry is gone...
    expect((await readPrcSettings(home.configDir)).packages).toEqual([]);
    // ...but the checkout files remain on disk (the gotcha our update path works around).
    await expect(fs.stat(target)).resolves.toBeTruthy();
  });

  it("refuses to update a pinned git ref", async () => {
    const home = await makeHome();
    const repo = await makeGitExtensionRepo(home.root, v1Code);
    const sha = await git(repo, "rev-parse", "HEAD");
    await installExtensionPackage(`git:${repo}@${sha}`, { configDir: home.configDir });

    const result = await updateSource(`git:${repo}@${sha}`, { configDir: home.configDir });
    expect(result).toMatchObject({ updated: false });
    expect(result.reason).toMatch(/pinned/i);
  });
});

describe("extension update — npm execution (simulated registry)", () => {
  it("runs npm install <pkg>@latest and leaves settings untouched", async () => {
    const home = await makeHome();
    const npmPrefix = path.join(home.configDir, "packages", "npm");

    // A runner that simulates npm by writing the "newer" package into node_modules.
    const calls: string[][] = [];
    const runner: PackageCommandRunner = async (command, args) => {
      calls.push([command, ...args]);
      const pkgDir = path.join(npmPrefix, "node_modules", "demo-pkg");
      await fs.mkdir(pkgDir, { recursive: true });
      await fs.writeFile(path.join(pkgDir, "package.json"), JSON.stringify({ name: "demo-pkg", version: "2.0.0" }), "utf8");
    };

    await installExtensionPackage("npm:demo-pkg", { configDir: home.configDir, runner: async () => undefined });
    const before = await readPrcSettings(home.configDir);

    const result = await updateSource("npm:demo-pkg", { configDir: home.configDir, runner });
    expect(result).toMatchObject({ kind: "npm", updated: true });
    expect(calls).toEqual([["npm", "install", "--prefix", npmPrefix, "demo-pkg@latest"]]);

    const installed = JSON.parse(await fs.readFile(path.join(npmPrefix, "node_modules", "demo-pkg", "package.json"), "utf8"));
    expect(installed.version).toBe("2.0.0");

    // settings.json is unchanged by an update.
    expect(await readPrcSettings(home.configDir)).toEqual(before);
  });

  it("leaves settings intact when the update command fails", async () => {
    const home = await makeHome();
    await installExtensionPackage("npm:demo-pkg", { configDir: home.configDir, runner: async () => undefined });
    const before = await readPrcSettings(home.configDir);
    const runner: PackageCommandRunner = async () => { throw new Error("network down"); };

    await expect(updateSource("npm:demo-pkg", { configDir: home.configDir, runner })).rejects.toThrow(/network down/);
    expect(await readPrcSettings(home.configDir)).toEqual(before);
  });
});

describe("extension update — local sources", () => {
  it("is a no-op for local sources", async () => {
    const home = await makeHome();
    const result = await updateSource(path.join(home.configDir, "some-local-ext"), { configDir: home.configDir });
    expect(result).toMatchObject({ kind: "local", updated: false });
  });
});
