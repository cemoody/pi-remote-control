/**
 * TDD contract for cross-tab leader election (the actual "many tabs / many
 * connections" fix). RED until implemented.
 *
 * With a shared BroadcastChannel, N tabs on one origin must collapse to ONE
 * underlying transport: a single leader holds the socket; followers subscribe
 * through the channel and receive fanned-out events. If the leader goes away,
 * a follower is promoted and re-opens the transport.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createRealtimeConnection, type RealtimeConnection } from "../../src/web/api/realtime-connection.js";
import { FakeBroadcastHub, FakeTransport, flushMicrotasks } from "../helpers/realtime-client-harness.js";

const conns: RealtimeConnection[] = [];
const transports: FakeTransport[] = [];
function makeTab(hub: FakeBroadcastHub, tabId: string): { conn: RealtimeConnection; transport: FakeTransport } {
  const transport = new FakeTransport();
  transports.push(transport);
  const conn = createRealtimeConnection({
    tabId,
    broadcast: hub.create(),
    transportFactory: () => transport,
  });
  conns.push(conn);
  return { conn, transport };
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
});
