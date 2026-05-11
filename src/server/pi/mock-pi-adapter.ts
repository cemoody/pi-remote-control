import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type {
  CreateSessionOptions,
  OpenSessionOptions,
  PiAdapter,
  PiEvent,
  PiEventListener,
  PiSessionHandle,
  SessionListItem,
  SessionMessage,
  SessionState,
  SessionStatus,
  Unsubscribe,
} from "./types.js";

interface PersistedMockSession {
  readonly id: string;
  readonly cwd: string;
  readonly sessionFile: string;
  readonly sessionName?: string;
  readonly messages: readonly SessionMessage[];
  readonly lastActivity: number;
}

export interface MockPiAdapterOptions {
  readonly sessionRoot: string;
  readonly assistantResponse?: (prompt: string) => string;
}

export class MockPiAdapter implements PiAdapter {
  private readonly sessionRoot: string;
  private readonly assistantResponse: (prompt: string) => string;

  constructor(options: MockPiAdapterOptions) {
    this.sessionRoot = path.resolve(options.sessionRoot);
    this.assistantResponse = options.assistantResponse ?? ((prompt) => `Mock response to: ${prompt}`);
  }

  async createSession(options: CreateSessionOptions): Promise<PiSessionHandle> {
    await fs.mkdir(this.sessionRoot, { recursive: true });
    const id = crypto.randomUUID();
    const sessionFile = path.join(this.sessionRoot, `${Date.now()}_${id}.mock-session.json`);
    const persisted: PersistedMockSession = {
      id,
      cwd: path.resolve(options.cwd),
      sessionFile,
      ...(options.sessionName === undefined ? {} : { sessionName: options.sessionName }),
      messages: [],
      lastActivity: Date.now(),
    };
    await writeSession(persisted);
    return new MockPiSessionHandle(persisted, this.assistantResponse);
  }

  async openSession(options: OpenSessionOptions): Promise<PiSessionHandle> {
    const persisted = await readSession(path.resolve(options.sessionFile));
    return new MockPiSessionHandle(persisted, this.assistantResponse);
  }

  async listSessions(cwd?: string): Promise<readonly SessionListItem[]> {
    await fs.mkdir(this.sessionRoot, { recursive: true });
    const entries = await fs.readdir(this.sessionRoot);
    const items: SessionListItem[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(".mock-session.json")) continue;
      const sessionFile = path.join(this.sessionRoot, entry);
      const persisted = await readSession(sessionFile);
      if (cwd !== undefined && persisted.cwd !== path.resolve(cwd)) continue;
      const firstMessage = persisted.messages.find((message) => message.role === "user")?.content;
      items.push({
        id: persisted.id,
        cwd: persisted.cwd,
        sessionFile: persisted.sessionFile,
        ...(persisted.sessionName === undefined ? {} : { sessionName: persisted.sessionName }),
        ...(firstMessage === undefined ? {} : { firstMessage }),
        lastActivity: persisted.lastActivity,
      });
    }
    return items.sort((a, b) => b.lastActivity - a.lastActivity);
  }
}

class MockPiSessionHandle implements PiSessionHandle {
  readonly id: string;
  readonly cwd: string;
  readonly sessionFile: string;

  private readonly emitter = new EventEmitter();
  private status: SessionStatus = "idle";
  private sessionName: string | undefined;
  private messages: SessionMessage[];
  private lastActivity: number;
  private readonly assistantResponse: (prompt: string) => string;

  constructor(persisted: PersistedMockSession, assistantResponse: (prompt: string) => string) {
    this.id = persisted.id;
    this.cwd = persisted.cwd;
    this.sessionFile = persisted.sessionFile;
    this.sessionName = persisted.sessionName;
    this.messages = [...persisted.messages];
    this.lastActivity = persisted.lastActivity;
    this.assistantResponse = assistantResponse;
  }

  async getState(): Promise<SessionState> {
    return {
      id: this.id,
      cwd: this.cwd,
      sessionFile: this.sessionFile,
      status: this.status,
      ...(this.sessionName === undefined ? {} : { sessionName: this.sessionName }),
      messageCount: this.messages.length,
      lastActivity: this.lastActivity,
    };
  }

  async getMessages(): Promise<readonly SessionMessage[]> {
    return [...this.messages];
  }

  async prompt(message: string): Promise<void> {
    this.status = "running";
    this.emit({ type: "agent_start" });
    const timestamp = Date.now();
    const userMessage: SessionMessage = { role: "user", content: message, timestamp };
    const assistantMessage: SessionMessage = {
      role: "assistant",
      content: this.assistantResponse(message),
      timestamp: timestamp + 1,
    };
    this.messages.push(userMessage, assistantMessage);
    this.lastActivity = Date.now();
    this.emit({ type: "message", message: userMessage });
    this.emit({ type: "message", message: assistantMessage });
    this.status = "idle";
    await this.persist();
    this.emit({ type: "agent_end", messages: [userMessage, assistantMessage] });
  }

  async abort(): Promise<void> {
    this.status = "idle";
    this.lastActivity = Date.now();
    await this.persist();
  }

  subscribe(listener: PiEventListener): Unsubscribe {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }

  async dispose(): Promise<void> {
    this.emitter.removeAllListeners();
  }

  private emit(event: PiEvent): void {
    this.emitter.emit("event", event);
  }

  private async persist(): Promise<void> {
    await writeSession({
      id: this.id,
      cwd: this.cwd,
      sessionFile: this.sessionFile,
      ...(this.sessionName === undefined ? {} : { sessionName: this.sessionName }),
      messages: this.messages,
      lastActivity: this.lastActivity,
    });
  }
}

async function readSession(sessionFile: string): Promise<PersistedMockSession> {
  const raw = await fs.readFile(sessionFile, "utf8");
  return JSON.parse(raw) as PersistedMockSession;
}

async function writeSession(session: PersistedMockSession): Promise<void> {
  await fs.mkdir(path.dirname(session.sessionFile), { recursive: true });
  await fs.writeFile(session.sessionFile, `${JSON.stringify(session, null, 2)}\n`, "utf8");
}
