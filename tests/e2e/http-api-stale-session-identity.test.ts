import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHttpApiServer } from "../../src/server/http-api-server.js";
import type {
  CreateSessionOptions,
  ModelInfo,
  OpenSessionOptions,
  PiAdapter,
  PiEventListener,
  PiSessionHandle,
  PromptAttachment,
  SessionListItem,
  SessionMessage,
  SessionState,
  Unsubscribe,
} from "../../src/server/pi/types.js";
import { PathPolicy } from "../../src/server/security/path-policy.js";
import { SessionRegistry } from "../../src/server/session/session-registry.js";

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe("HTTP API stale session identity handling", () => {
  it("prompts the resolved live session when a stale session id opens a worker that has switched to a fork id", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-remote-stale-identity-"));
    const projectRoot = path.join(root, "project");
    const sessionRoot = path.join(root, "sessions");
    await fs.mkdir(projectRoot, { recursive: true });
    await fs.mkdir(sessionRoot, { recursive: true });

    const staleSessionFile = path.join(sessionRoot, "stale-session.jsonl");
    const forkSessionFile = path.join(sessionRoot, "fork-session.jsonl");
    await fs.writeFile(staleSessionFile, "");
    await fs.writeFile(forkSessionFile, "");

    const adapter = new StaleIdentityAdapter({ projectRoot, staleSessionFile, forkSessionFile });
    const registry = new SessionRegistry({
      adapter,
      pathPolicy: new PathPolicy({ allowedProjectRoots: [projectRoot], allowedSessionRoots: [sessionRoot] }),
    });
    const server = createHttpApiServer({ registry, adapterKind: "test", projectRoot, sessionRoot, defaultCwd: projectRoot });
    servers.push(server);
    const baseUrl = await listen(server);

    // Populate the API's cold-session index with the persisted original session.
    const listResponse = await fetch(`${baseUrl}/api/sessions?cwd=${encodeURIComponent(projectRoot)}`);
    expect(listResponse.ok).toBe(true);
    expect(await listResponse.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "stale-session", sessionFile: staleSessionFile }),
    ]));

    const promptResponse = await fetch(`${baseUrl}/api/sessions/stale-session/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "continue on the fork" }),
    });

    expect(promptResponse.status).toBe(200);
    expect(adapter.forkHandle.prompts).toEqual(["continue on the fork"]);
    expect(adapter.openedFiles).toEqual([staleSessionFile]);
  });
});

class StaleIdentityAdapter implements PiAdapter {
  readonly forkHandle: StaleIdentitySessionHandle;
  readonly openedFiles: string[] = [];

  constructor(private readonly options: { readonly projectRoot: string; readonly staleSessionFile: string; readonly forkSessionFile: string }) {
    this.forkHandle = new StaleIdentitySessionHandle({
      id: "fork-session",
      cwd: options.projectRoot,
      sessionFile: options.forkSessionFile,
      sessionName: "forked live worker",
    });
  }

  async createSession(_options: CreateSessionOptions): Promise<PiSessionHandle> {
    throw new Error("not used");
  }

  async openSession(options: OpenSessionOptions): Promise<PiSessionHandle> {
    this.openedFiles.push(options.sessionFile);
    if (options.sessionFile !== this.options.staleSessionFile) throw new Error(`unexpected open: ${options.sessionFile}`);
    // Reproduce the real supervisor bug: opening the original session's stale
    // socket/status entry connects to a worker whose Pi runtime now reports the fork id.
    return this.forkHandle;
  }

  async listSessions(): Promise<readonly SessionListItem[]> {
    return [{
      id: "stale-session",
      cwd: this.options.projectRoot,
      sessionFile: this.options.staleSessionFile,
      sessionName: "original row",
      lastActivity: 1,
    }];
  }

  async listModels(): Promise<readonly ModelInfo[]> {
    return [{ provider: "test", id: "model", name: "Test", available: true }];
  }
}

class StaleIdentitySessionHandle implements PiSessionHandle {
  readonly id: string;
  readonly cwd: string;
  readonly sessionFile: string;
  readonly sessionName: string;
  readonly prompts: string[] = [];
  private readonly emitter = new EventEmitter();

  constructor(options: { readonly id: string; readonly cwd: string; readonly sessionFile: string; readonly sessionName: string }) {
    this.id = options.id;
    this.cwd = options.cwd;
    this.sessionFile = options.sessionFile;
    this.sessionName = options.sessionName;
  }

  async getState(): Promise<SessionState> {
    return {
      id: this.id,
      cwd: this.cwd,
      sessionFile: this.sessionFile,
      sessionName: this.sessionName,
      status: "idle",
      messageCount: this.prompts.length,
      lastActivity: 2,
    };
  }

  async getMessages(): Promise<readonly SessionMessage[]> {
    return this.prompts.map((content, index) => ({ role: "user", content, timestamp: index + 1 }));
  }

  async prompt(message: string, _attachments: readonly PromptAttachment[] = []): Promise<void> {
    this.prompts.push(message);
  }

  async abort(): Promise<void> {}
  async setSessionName(_name: string): Promise<SessionState> { return this.getState(); }
  async setModel(_provider: string, _modelId: string): Promise<SessionState> { return this.getState(); }
  subscribe(listener: PiEventListener): Unsubscribe { this.emitter.on("event", listener); return () => this.emitter.off("event", listener); }
  async dispose(): Promise<void> {}
}

function listen(server: http.Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("server did not bind to TCP"));
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}
