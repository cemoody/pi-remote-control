import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createPrcExtensionRuntime } from "../../src/extensions/runtime.js";
import { createHttpApiServer } from "../../src/server/http-api-server.js";
import { installExtensionPackage } from "../../src/extensions/packages.js";
import { MockPiAdapter } from "../../src/server/pi/mock-pi-adapter.js";
import { PathPolicy } from "../../src/server/security/path-policy.js";
import { SessionRegistry } from "../../src/server/session/session-registry.js";
import type { CommandOutputRunner } from "../../src/extensions/update-check.js";
import type { PackageCommandRunner } from "../../src/extensions/packages.js";

const servers: http.Server[] = [];
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((resolve, reject) => s.close((e) => (e ? reject(e) : resolve())))));
  await Promise.all(roots.splice(0).map((r) => fs.rm(r, { recursive: true, force: true })));
});

interface ServerHandle {
  readonly baseUrl: string;
  readonly configDir: string;
}

async function makeServer(opts: {
  checkRunner?: CommandOutputRunner;
  applyRunner?: PackageCommandRunner;
} = {}): Promise<ServerHandle> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prc-ext-updates-"));
  roots.push(root);
  const configDir = path.join(root, "config");
  const projectRoot = path.join(root, "project");
  const sessionRoot = path.join(root, "sessions");
  await Promise.all([configDir, projectRoot, sessionRoot].map((d) => fs.mkdir(d, { recursive: true })));
  const registry = new SessionRegistry({
    adapter: new MockPiAdapter({ sessionRoot }),
    pathPolicy: new PathPolicy({ allowedProjectRoots: [projectRoot], allowedSessionRoots: [sessionRoot] }),
  });
  const extensionRuntime = await createPrcExtensionRuntime({ configDir, cwd: projectRoot });
  const server = createHttpApiServer({
    registry,
    adapterKind: "test",
    projectRoot,
    sessionRoot,
    defaultCwd: projectRoot,
    extensionRuntime,
    ...(opts.checkRunner ? { extensionUpdateCheckRunner: opts.checkRunner } : {}),
    ...(opts.applyRunner ? { extensionUpdateApplyRunner: opts.applyRunner } : {}),
  });
  servers.push(server);
  const baseUrl = await new Promise<string>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("no bind"));
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
  return { baseUrl, configDir };
}

async function seedNpmPackage(configDir: string, name: string, version: string): Promise<void> {
  const pkgDir = path.join(configDir, "packages", "npm", "node_modules", name);
  await fs.mkdir(pkgDir, { recursive: true });
  await fs.writeFile(path.join(pkgDir, "package.json"), JSON.stringify({ name, version }), "utf8");
  await installExtensionPackage(`npm:${name}`, { configDir, runner: async () => undefined });
}

const ok = (stdout: string) => ({ stdout, stderr: "", exitCode: 0 });

describe("GET /api/extensions/updates", () => {
  it("returns per-source update statuses using the injected runner", async () => {
    const { baseUrl, configDir } = await makeServer({ checkRunner: async () => ok("2.0.0\n") });
    await seedNpmPackage(configDir, "demo", "1.0.0");

    const response = await fetch(`${baseUrl}/api/extensions/updates`);
    expect(response.status).toBe(200);
    const body = await response.json() as { updates: Array<{ source: string; state: string; installed?: string; latest?: string }> };
    const demo = body.updates.find((u) => u.source === "npm:demo");
    expect(demo).toMatchObject({ state: "update-available", installed: "1.0.0", latest: "2.0.0" });
  });

  it("isolates a failing source as an error entry", async () => {
    const runner: CommandOutputRunner = async (_c, args) => {
      if (args.includes("explodes")) throw new Error("boom");
      return ok("1.0.0\n");
    };
    const { baseUrl, configDir } = await makeServer({ checkRunner: runner });
    await seedNpmPackage(configDir, "explodes", "1.0.0");
    await seedNpmPackage(configDir, "fine", "1.0.0");

    const body = await (await fetch(`${baseUrl}/api/extensions/updates`)).json() as { updates: Array<{ source: string; state: string }> };
    expect(body.updates.find((u) => u.source === "npm:explodes")!.state).toBe("error");
    expect(body.updates.find((u) => u.source === "npm:fine")!.state).toBe("up-to-date");
  });
});

describe("POST /api/extensions/packages/update", () => {
  it("requires a source", async () => {
    const { baseUrl } = await makeServer();
    const response = await fetch(`${baseUrl}/api/extensions/packages/update`, {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "source is required" });
  });

  it("runs the apply runner, reloads, and returns refreshed extensions", async () => {
    const calls: string[][] = [];
    const applyRunner: PackageCommandRunner = async (command, args) => { calls.push([command, ...args]); };
    const { baseUrl, configDir } = await makeServer({ applyRunner });
    await seedNpmPackage(configDir, "demo", "1.0.0");

    const response = await fetch(`${baseUrl}/api/extensions/packages/update`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: "npm:demo" }),
    });
    expect(response.status).toBe(200);
    const body = await response.json() as { updated: boolean; applied: boolean; extensions: unknown };
    expect(body).toMatchObject({ updated: true, applied: true });
    expect(body.extensions).toBeTruthy();
    expect(calls[0]).toEqual(["npm", "install", "--prefix", path.join(configDir, "packages", "npm"), "demo@latest"]);
  });

  it("returns a no-op result for a local source without reloading", async () => {
    const { baseUrl, configDir } = await makeServer();
    const localDir = path.join(configDir, "local-ext");
    await fs.mkdir(localDir, { recursive: true });
    await fs.writeFile(path.join(localDir, "package.json"), JSON.stringify({ name: "local-ext", version: "1.0.0", piRemoteControl: { extension: "./i.mjs" } }), "utf8");
    await fs.writeFile(path.join(localDir, "i.mjs"), "export default function(){}", "utf8");
    await installExtensionPackage(localDir, { configDir });

    const response = await fetch(`${baseUrl}/api/extensions/packages/update`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: localDir }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ updated: false, kind: "local" });
  });
});
