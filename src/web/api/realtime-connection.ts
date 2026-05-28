/**
 * Client-side multiplexed realtime connection (Option B, browser side).
 *
 * This is the seam that backs SessionDashboardApi.streamEvents. Today the HTTP
 * api opens one EventSource PER session/tab; this abstraction instead owns ONE
 * underlying transport per origin and multiplexes every logical session
 * subscription over it, with reconnect/resume and (optionally) cross-tab leader
 * election so N tabs share ONE socket.
 *
 * NOTE: intentionally unimplemented. The TDD contract in
 * tests/unit/realtime-connection.test.ts + realtime-leader-election.test.ts and
 * the integration spec tests/e2e/realtime-client-gateway.test.ts describe the
 * surface before we wire it into the client. createRealtimeConnection throws so
 * those tests are RED until the implementation lands.
 */

/** Minimal socket-like transport (satisfied by socket.io-client and the test fake). */
export interface RealtimeTransport {
  readonly connected: boolean;
  connect(): void;
  disconnect(): void;
  on(event: string, handler: (...args: unknown[]) => void): void;
  off(event: string, handler: (...args: unknown[]) => void): void;
  emit(event: string, payload: unknown, ack?: (response: unknown) => void): void;
}

/** Injectable page-visibility source so pause/resume is testable without a DOM. */
export interface VisibilitySource {
  isVisible(): boolean;
  subscribe(onChange: () => void): () => void;
}

/** Minimal BroadcastChannel surface for cross-tab leader election. */
export interface BroadcastLike {
  postMessage(message: unknown): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  close(): void;
}

export interface RealtimeClientEvent {
  readonly kind: string;
  readonly [key: string]: unknown;
}

export interface RealtimeConnectionOptions {
  /** Creates the underlying transport (one per actually-open connection). */
  readonly transportFactory: () => RealtimeTransport;
  /** Stable id for this tab (used for leader election + telemetry). */
  readonly tabId?: string;
  /** When provided, tabs coordinate so exactly one holds the transport. */
  readonly broadcast?: BroadcastLike;
  readonly visibility?: VisibilitySource;
  /** Close the idle transport this many ms after the last unsubscribe. */
  readonly idleCloseMs?: number;
  readonly now?: () => number;
  readonly onClientEvent?: (event: RealtimeClientEvent) => void;
}

export interface RealtimeConnection {
  /**
   * Subscribe to a session's live events. onEvent receives the inner PiEvent
   * (envelope unwrapped) for parity with the EventSource path, plus synthetic
   * { type: "stream_reconnected" } / { type: "session_resync" } markers.
   * Returns an unsubscribe function.
   */
  subscribe(sessionId: string, onEvent: (event: unknown) => void, options?: { readonly fromSeq?: number | null }): () => void;
  /** Number of live underlying transports this tab holds (0 or 1). */
  readonly connectionCount: number;
  /** Number of distinct sessions currently subscribed (across all callers). */
  readonly activeSubscriptions: number;
  /** True when this tab currently owns the shared transport (leader). */
  readonly isLeader: boolean;
  dispose(): void;
}

export function createRealtimeConnection(_options: RealtimeConnectionOptions): RealtimeConnection {
  throw new Error("createRealtimeConnection is not implemented yet (TDD: see realtime-connection.test.ts)");
}
