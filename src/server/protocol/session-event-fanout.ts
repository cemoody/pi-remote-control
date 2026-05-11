import type { PiWireEvent, ServerEnvelope } from "../../shared/protocol.js";

export type ClientSender = (message: ServerEnvelope) => void;

export class SessionEventFanout {
  private readonly subscribers = new Map<string, Set<ClientSender>>();

  subscribe(sessionId: string, sender: ClientSender): () => void {
    const set = this.subscribers.get(sessionId) ?? new Set<ClientSender>();
    set.add(sender);
    this.subscribers.set(sessionId, set);
    return () => {
      set.delete(sender);
      if (set.size === 0) this.subscribers.delete(sessionId);
    };
  }

  publish(sessionId: string, event: PiWireEvent): void {
    const set = this.subscribers.get(sessionId);
    if (!set) return;
    const envelope: ServerEnvelope = { type: "session_event", sessionId, event };
    for (const sender of set) sender(envelope);
  }

  subscriberCount(sessionId: string): number {
    return this.subscribers.get(sessionId)?.size ?? 0;
  }
}
