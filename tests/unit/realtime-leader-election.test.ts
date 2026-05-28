/**
 * TDD contract for cross-tab leader election (the actual "many tabs / many
 * connections" fix). RED until implemented.
 *
 * With a shared BroadcastChannel, N tabs on one origin must collapse to ONE
 * underlying transport: a single leader holds the socket; followers subscribe
 * through the channel and receive fanned-out events. If the leader goes away,
 * a follower is promoted and re-opens the transport.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRealtimeConnection, type RealtimeConnection } from "../../src/web/api/realtime-connection.js";
import { FakeBroadcastChannel, FakeBroadcastHub, FakeTransport, flushMicrotasks } from "../helpers/realtime-client-harness.js";

const conns: RealtimeConnection[] = [];
const transports: FakeTransport[] = [];
function makeTab(hub: FakeBroadcastHub, tabId: string, overrides: Record<string, unknown> = {}): { conn: RealtimeConnection; transport: FakeTransport; channel: FakeBroadcastChannel } {
  const transport = new FakeTransport();
  transports.push(transport);
  const channel = hub.create();
  const conn = createRealtimeConnection({
    tabId,
    broadcast: channel,
    transportFactory: () => transport,
    ...overrides,
  });
  conns.push(conn);
  return { conn, transport, channel };
}
afterEach(() => { for (const c of conns.splice(0)) c.dispose(); transports.splice(0); });

describe("cross-tab leader election", () => {
  it("collapses N tabs to exactly one underlying transport", async () => {
    const hub = new FakeBroadcastHub();
    const a = makeTab(hub, "tab-a");
    const b = makeTab(hub, "tab-b");
    const c = makeTab(hub, "tab-c");

    a.conn.subscribe("s1", () => {});
    b.conn.subscribe("s2", () => {});
    c.conn.subscribe("s3", () => {});
    a.transport.simulateConnect();
    await flushMicrotasks();

    const leaders = [a, b, c].filter((t) => t.conn.isLeader);
    expect(leaders.length).toBe(1);
    const openTransports = transports.filter((t) => t.connected).length;
    expect(openTransports).toBe(1);
  });

  it("fans server events out to follower tabs over the channel", async () => {
    const hub = new FakeBroadcastHub();
    const leader = makeTab(hub, "leader");
    const follower = makeTab(hub, "follower");
    await flushMicrotasks();

    const seen: unknown[] = [];
    follower.conn.subscribe("s1", (e) => seen.push(e));
    leader.transport.simulateConnect();
    await flushMicrotasks();

    // The leader owns the socket and receives the raw event...
    leader.transport.simulateSessionEvent("s1", 1, { type: "agent_start" });
    await flushMicrotasks();

    // ...and the follower (no socket of its own) still sees it.
    expect(follower.conn.isLeader).toBe(false);
    expect(seen).toContainEqual({ type: "agent_start" });
  });

  it("promotes a follower and re-opens the transport when the leader disposes", async () => {
    const hub = new FakeBroadcastHub();
    const leader = makeTab(hub, "leader");
    const follower = makeTab(hub, "follower");
    follower.conn.subscribe("s1", () => {});
    leader.transport.simulateConnect();
    await flushMicrotasks();
    expect(leader.conn.isLeader).toBe(true);

    leader.conn.dispose();
    await flushMicrotasks();
    follower.transport.simulateConnect();
    await flushMicrotasks();

    expect(follower.conn.isLeader).toBe(true);
    // The promoted tab must re-establish s1 on its freshly-opened transport.
    expect(follower.transport.emitsOf("session:subscribe").map((m) => (m.payload as any).sessionId))
      .toContain("s1");
  });

  it("promotes a follower when the leader dies UNGRACEFULLY (no bye, stops heartbeating)", async () => {
    vi.useFakeTimers();
    try {
      const hub = new FakeBroadcastHub();
      const leader = makeTab(hub, "tab-a", { heartbeatMs: 1_000, leaderTimeoutMs: 3_000 });
      const follower = makeTab(hub, "tab-b", { heartbeatMs: 1_000, leaderTimeoutMs: 3_000 });
      follower.conn.subscribe("s1", () => {});
      leader.transport.simulateConnect();
      await vi.advanceTimersByTimeAsync(0);
      expect(leader.conn.isLeader).toBe(true);

      // Crash: kill the leader's channel so it can no longer heartbeat, but do
      // NOT call dispose() (no graceful bye). The follower must time it out.
      leader.channel.close();
      await vi.advanceTimersByTimeAsync(4_000);
      follower.transport.simulateConnect();
      await vi.advanceTimersByTimeAsync(0);

      expect(follower.conn.isLeader).toBe(true);
      expect(follower.transport.emitsOf("session:subscribe").map((m) => (m.payload as any).sessionId)).toContain("s1");
    } finally {
      vi.useRealTimers();
    }
  });

  it("cross-tab ref-counts: the leader keeps a wire subscription while ANY tab wants it", async () => {
    const hub = new FakeBroadcastHub();
    const leader = makeTab(hub, "tab-a");
    const follower = makeTab(hub, "tab-b");
    const offLeader = leader.conn.subscribe("s1", () => {});
    const offFollower = follower.conn.subscribe("s1", () => {});
    leader.transport.simulateConnect();
    await flushMicrotasks();

    // One wire subscription for s1 despite two tabs wanting it.
    expect(leader.transport.emitsOf("session:subscribe").filter((m) => (m.payload as any).sessionId === "s1").length).toBe(1);

    offFollower(); // follower no longer wants it, but the leader still does
    await flushMicrotasks();
    expect(leader.transport.emitsOf("session:unsubscribe").length).toBe(0);

    offLeader(); // now nobody wants it
    await flushMicrotasks();
    expect(leader.transport.emitsOf("session:unsubscribe").map((m) => (m.payload as any).sessionId)).toContain("s1");
  });
});
