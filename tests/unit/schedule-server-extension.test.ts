import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { bootstrapPrcExtensions } from "../../src/extensions/bootstrap.js";
import { writePrcSettings } from "../../src/extensions/packages.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("bundled core.schedule server extension", () => {
  it("does not register schedule routes when core.schedule is disabled", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "prc-schedule-disabled-"));
    roots.push(root);
    const configDir = path.join(root, "config");
    await writePrcSettings(configDir, { disabledExtensions: ["core.schedule"] });

    const result = await bootstrapPrcExtensions({
      configDir,
      cwd: root,
      dataDir: path.join(root, "data"),
      bundledPackagePaths: [path.resolve(process.cwd(), "extensions", "schedule")],
    });

    expect(result.host.activity.list()).toEqual([]);
    expect(await result.host.serverRoutes.dispatch(ReadableRequest.empty("GET") as never, new URL("http://localhost/api/cron"))).toBeUndefined();
  });

  it("registers /api/cron compatibility routes through the package extension host", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "prc-schedule-extension-"));
    roots.push(root);
    const prompts: Array<{ sessionId: string; prompt: string }> = [];
    const result = await bootstrapPrcExtensions({
      configDir: path.join(root, "config"),
      cwd: root,
      dataDir: path.join(root, "data"),
      bundledPackagePaths: [path.resolve(process.cwd(), "extensions", "schedule")],
      sessions: {
        create: async (input) => ({ id: "s1", sessionFile: "/sessions/s1.json", ...input }),
        prompt: async (sessionId, prompt) => { prompts.push({ sessionId, prompt }); },
      },
    });

    const created = await result.host.serverRoutes.dispatch(ReadableRequest.fromJson("POST", {
      name: "Nightly",
      schedule: "0 1 * * *",
      prompt: "summarize",
      cwd: root,
    }) as never, new URL("http://localhost/api/cron"));
    expect(created?.status).toBe(200);
    expect(created?.body).toMatchObject({ name: "Nightly", prompt: "summarize", cwd: root, enabled: true });

    const listed = await result.host.serverRoutes.dispatch(ReadableRequest.empty("GET") as never, new URL("http://localhost/api/cron"));
    expect(listed?.body).toMatchObject({ jobs: [expect.objectContaining({ name: "Nightly" })] });

    const jobId = (created?.body as { id: string }).id;
    const run = await result.host.serverRoutes.dispatch(ReadableRequest.empty("POST") as never, new URL(`http://localhost/api/cron/${jobId}/run`));
    expect(run?.body).toMatchObject({ sessionId: "s1", sessionFile: "/sessions/s1.json" });
    expect(prompts).toEqual([{ sessionId: "s1", prompt: "summarize" }]);
  });
});

class ReadableRequest {
  method: string;
  headers: Record<string, string> = {};

  private constructor(method: string, private readonly chunks: readonly Buffer[]) {
    this.method = method;
  }

  static fromJson(method: string, body: unknown): ReadableRequest {
    return new ReadableRequest(method, [Buffer.from(JSON.stringify(body))]);
  }

  static empty(method: string): ReadableRequest {
    return new ReadableRequest(method, []);
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<Buffer> {
    yield* this.chunks;
  }
}
