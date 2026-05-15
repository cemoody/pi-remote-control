import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHttpApiServer } from "../../src/server/http-api-server.js";
import { MockPiAdapter } from "../../src/server/pi/mock-pi-adapter.js";
import { PathPolicy } from "../../src/server/security/path-policy.js";
import { SessionRegistry } from "../../src/server/session/session-registry.js";

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe("HTTP API prompt file attachments", () => {
  it("saves non-image attachments locally and appends their path to the prompt", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-remote-attachment-test-"));
    const projectRoot = path.join(root, "project");
    const sessionRoot = path.join(root, "sessions");
    await fs.mkdir(projectRoot, { recursive: true });
    const adapter = new MockPiAdapter({ sessionRoot, assistantResponse: (prompt) => `Echo: ${prompt}` });
    const registry = new SessionRegistry({
      adapter,
      pathPolicy: new PathPolicy({ allowedProjectRoots: [projectRoot], allowedSessionRoots: [sessionRoot] }),
    });
    const created = await registry.createSession({ cwd: projectRoot });
    const server = createHttpApiServer({ registry, adapterKind: "test", projectRoot, sessionRoot, defaultCwd: projectRoot });
    servers.push(server);
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/api/sessions/${encodeURIComponent(created.id)}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "please inspect",
        attachments: [{
          type: "file",
          name: "archive.zip",
          mimeType: "application/zip",
          data: Buffer.from("zipbytes").toString("base64"),
        }],
      }),
    });

    expect(response.ok).toBe(true);
    const messages = await response.json() as Array<{ role: string; text: string; images?: unknown[] }>;
    const userMessage = messages.find((message) => message.role === "user");
    expect(userMessage?.text).toContain("please inspect");
    expect(userMessage?.text).toContain("The user attached a file and it has been saved locally at:");
    expect(userMessage?.text).toContain("archive.zip");
    expect(userMessage?.images).toBeUndefined();

    const savedPath = /saved locally at: (.+archive\.zip)/.exec(userMessage?.text ?? "")?.[1];
    expect(savedPath).toBeTruthy();
    expect(path.dirname(savedPath!)).toBe(path.join(projectRoot, ".pi", "attachments", created.id));
    await expect(fs.readFile(savedPath!, "utf8")).resolves.toBe("zipbytes");
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
