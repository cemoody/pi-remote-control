import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHttpApiServer } from "../../src/server/http-api-server.js";
import { MockPiAdapter } from "../../src/server/pi/mock-pi-adapter.js";
import { PathPolicy } from "../../src/server/security/path-policy.js";
import { SessionRegistry } from "../../src/server/session/session-registry.js";

// Pins the PWA static-serving contract: when PI_CRUST_UI_DIR points at a
// built UI, the single Node process must serve the web manifest, service
// worker, and icons with correct MIME + cache headers — and must never let
// the static layer shadow /api routes (which carry the live SSE/Socket.IO
// data plane).

const servers: http.Server[] = [];
const prevUiDir = process.env.PI_CRUST_UI_DIR;

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  })));
  if (prevUiDir === undefined) delete process.env.PI_CRUST_UI_DIR;
  else process.env.PI_CRUST_UI_DIR = prevUiDir;
});

async function makeServerWithUi(): Promise<string> {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "prc-pwa-assets-"));
  const projectRoot = path.join(tmpRoot, "project");
  const sessionRoot = path.join(tmpRoot, "sessions");
  const uiDir = path.join(tmpRoot, "ui");
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.mkdir(sessionRoot, { recursive: true });
  await fs.mkdir(path.join(uiDir, "icons"), { recursive: true });

  await fs.writeFile(path.join(uiDir, "index.html"), "<!doctype html><title>pi crust</title>");
  await fs.writeFile(path.join(uiDir, "manifest.webmanifest"), JSON.stringify({ name: "π crust" }));
  await fs.writeFile(path.join(uiDir, "service-worker.js"), "self.addEventListener('install', () => {});");
  await fs.writeFile(path.join(uiDir, "icons", "icon-192.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  process.env.PI_CRUST_UI_DIR = uiDir;
  const registry = new SessionRegistry({
    adapter: new MockPiAdapter({ sessionRoot }),
    pathPolicy: new PathPolicy({ allowedProjectRoots: [projectRoot], allowedSessionRoots: [sessionRoot] }),
  });
  const server = createHttpApiServer({
    registry,
    adapterKind: "test",
    projectRoot,
    sessionRoot,
    defaultCwd: projectRoot,
  });
  servers.push(server);
  return listen(server);
}

describe("PWA static assets via PI_CRUST_UI_DIR", () => {
  it("serves the web manifest with the manifest MIME type", async () => {
    const baseUrl = await makeServerWithUi();
    const res = await fetch(`${baseUrl}/manifest.webmanifest`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/manifest\+json/);
  });

  it("serves the service worker as JavaScript with no-cache so updates propagate", async () => {
    const baseUrl = await makeServerWithUi();
    const res = await fetch(`${baseUrl}/service-worker.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/javascript/);
    expect(res.headers.get("cache-control")).toMatch(/no-cache/);
  });

  it("serves hashed-asset icons as immutable, long-lived cache entries", async () => {
    const baseUrl = await makeServerWithUi();
    const res = await fetch(`${baseUrl}/icons/icon-192.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toMatch(/immutable/);
  });

  it("never lets the static layer shadow /api routes (live data plane)", async () => {
    const baseUrl = await makeServerWithUi();
    // /api/health is real; it must return JSON from the API, not the SPA shell.
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });
});

function listen(server: http.Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("server did not bind to TCP"));
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}
