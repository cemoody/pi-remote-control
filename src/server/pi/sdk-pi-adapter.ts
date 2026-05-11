import path from "node:path";
import {
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type {
  CreateSessionOptions,
  OpenSessionOptions,
  PiAdapter,
  PiEventListener,
  PiSessionHandle,
  SessionListItem,
  SessionMessage,
  SessionState,
  Unsubscribe,
} from "./types.js";

export interface SdkPiAdapterOptions {
  readonly sessionDir?: string;
}

/**
 * Thin SDK boundary. The rest of the app should depend on PiAdapter, not on Pi SDK types.
 */
export class SdkPiAdapter implements PiAdapter {
  private readonly authStorage = AuthStorage.create();
  private readonly modelRegistry = ModelRegistry.create(this.authStorage);
  private readonly settingsManager = SettingsManager.create(process.cwd());

  constructor(private readonly options: SdkPiAdapterOptions = {}) {}

  async createSession(options: CreateSessionOptions): Promise<PiSessionHandle> {
    const cwd = path.resolve(options.cwd);
    const { session } = await createAgentSession({
      cwd,
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
      settingsManager: this.settingsManager,
      sessionManager: SessionManager.create(cwd, this.options.sessionDir),
    });
    return new SdkPiSessionHandle(session, cwd);
  }

  async openSession(options: OpenSessionOptions): Promise<PiSessionHandle> {
    const { session } = await createAgentSession({
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
      settingsManager: this.settingsManager,
      sessionManager: SessionManager.open(options.sessionFile, this.options.sessionDir),
    });
    return new SdkPiSessionHandle(session, process.cwd());
  }

  async listSessions(cwd?: string): Promise<readonly SessionListItem[]> {
    const sessions = cwd === undefined
      ? await SessionManager.listAll()
      : await SessionManager.list(path.resolve(cwd), this.options.sessionDir);
    return sessions.map((item: any) => ({
      id: String(item.id),
      cwd: String(item.cwd ?? cwd ?? ""),
      sessionFile: String(item.path),
      ...(item.name === undefined ? {} : { sessionName: String(item.name) }),
      ...(item.firstMessage === undefined ? {} : { firstMessage: String(item.firstMessage) }),
      lastActivity: typeof item.timestamp === "number" ? item.timestamp : Date.parse(String(item.timestamp ?? Date.now())),
    }));
  }
}

class SdkPiSessionHandle implements PiSessionHandle {
  readonly id: string;
  readonly sessionFile: string;

  constructor(private readonly session: any, readonly cwd: string) {
    this.id = String(session.sessionId);
    this.sessionFile = String(session.sessionFile ?? "");
  }

  async getState(): Promise<SessionState> {
    return {
      id: this.id,
      cwd: this.cwd,
      sessionFile: this.sessionFile,
      status: this.session.isStreaming ? "running" : "idle",
      ...(this.session.sessionName === undefined ? {} : { sessionName: String(this.session.sessionName) }),
      messageCount: Array.isArray(this.session.messages) ? this.session.messages.length : 0,
      lastActivity: Date.now(),
    };
  }

  async getMessages(): Promise<readonly SessionMessage[]> {
    const messages = Array.isArray(this.session.messages) ? this.session.messages : [];
    return messages.map((message: any) => ({
      role: message.role === "assistant" ? "assistant" : message.role === "system" ? "system" : "user",
      content: stringifyContent(message.content),
      timestamp: typeof message.timestamp === "number" ? message.timestamp : Date.now(),
    }));
  }

  async prompt(message: string): Promise<void> {
    await this.session.prompt(message);
  }

  async abort(): Promise<void> {
    await this.session.abort();
  }

  subscribe(listener: PiEventListener): Unsubscribe {
    return this.session.subscribe(listener as any);
  }

  async dispose(): Promise<void> {
    this.session.dispose();
  }
}

function stringifyContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (block && typeof block === "object" && "text" in block) return String((block as { text: unknown }).text);
        if (block && typeof block === "object" && "thinking" in block) return String((block as { thinking: unknown }).thinking);
        return JSON.stringify(block);
      })
      .join("\n");
  }
  return content === undefined ? "" : JSON.stringify(content);
}
