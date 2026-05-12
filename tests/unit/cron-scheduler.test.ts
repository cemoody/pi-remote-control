import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MockPiAdapter } from "../../src/server/pi/mock-pi-adapter.js";
import { PathPolicy } from "../../src/server/security/path-policy.js";
import { SessionRegistry } from "../../src/server/session/session-registry.js";
import { CronStore } from "../../src/server/cron/cron-store.js";
import { CronScheduler } from "../../src/server/cron/cron-scheduler.js";

async function setup() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-cron-sched-"));
  const projectRoot = path.join(root, "projects");
  const projectA = path.join(projectRoot, "a");
  const sessionRoot = path.join(root, "sessions");
  await fs.mkdir(projectA, { recursive: true });
  await fs.mkdir(sessionRoot, { recursive: true });
  const adapter = new MockPiAdapter({ sessionRoot });
  const registry = new SessionRegistry({
    adapter,
    pathPolicy: new PathPolicy({
      allowedProjectRoots: [projectRoot],
      allowedSessionRoots: [sessionRoot],
    }),
  });
  const cronFile = path.join(root, "cron-jobs.json");
  const store = new CronStore(cronFile);
  const scheduler = new CronScheduler({ store, registry, logger: () => undefined });
  return { root, projectA, registry, store, scheduler };
}

describe("CronScheduler.runJobNow", () => {
  it("spawns a session and records lastRun + lastSessionId", async () => {
    const { projectA, store, scheduler, registry } = await setup();
    const before = (await registry.listSessions()).length;
    const job = await store.create({ name: "now", schedule: "0 0 * * *", prompt: "hi", cwd: projectA });
    const t0 = Date.now();
    const result = await scheduler.runJobNow(job.id);
    expect(result.sessionId).toBeTruthy();

    const after = (await registry.listSessions()).length;
    expect(after).toBe(before + 1);

    const fresh = await store.get(job.id);
    expect(fresh?.lastSessionId).toBe(result.sessionId);
    expect(fresh?.lastRun).toBeGreaterThanOrEqual(t0);
    expect(fresh?.nextRun).toBeGreaterThan(t0);
  });

  it("throws for unknown jobs", async () => {
    const { scheduler } = await setup();
    await expect(scheduler.runJobNow("missing")).rejects.toThrow(/not found/);
  });

  it("uses the job's cwd when creating the session", async () => {
    const { projectA, store, scheduler, registry } = await setup();
    const job = await store.create({ name: "n", schedule: "0 0 * * *", prompt: "x", cwd: projectA });
    const result = await scheduler.runJobNow(job.id);
    const sessions = await registry.listSessions();
    const created = sessions.find((s) => s.id === result.sessionId);
    expect(created?.cwd).toBe(projectA);
  });

  it("uses the job name as the session name with a 'cron:' prefix", async () => {
    const { projectA, store, scheduler, registry } = await setup();
    const job = await store.create({ name: "Nightly summary", schedule: "0 0 * * *", prompt: "", cwd: projectA });
    const result = await scheduler.runJobNow(job.id);
    const sessions = await registry.listSessions();
    const created = sessions.find((s) => s.id === result.sessionId);
    expect(created?.sessionName).toBe("cron: Nightly summary");
  });
});

describe("CronScheduler.refreshNextRuns", () => {
  it("computes a nextRun for enabled jobs and clears it for disabled jobs", async () => {
    const { projectA, store, scheduler } = await setup();
    const enabled = await store.create({ name: "e", schedule: "*/5 * * * *", prompt: "", cwd: projectA });
    const disabled = await store.create({ name: "d", schedule: "*/5 * * * *", prompt: "", cwd: projectA, enabled: false });

    await scheduler.refreshNextRuns();

    const e = await store.get(enabled.id);
    const d = await store.get(disabled.id);
    expect(e?.nextRun).toBeGreaterThan(Date.now());
    expect(d?.nextRun).toBeUndefined();
  });

  it("leaves nextRun alone when the schedule is invalid", async () => {
    const { projectA, store, scheduler } = await setup();
    const bad = await store.create({ name: "bad", schedule: "not a cron", prompt: "", cwd: projectA });
    await scheduler.refreshNextRuns();
    const fresh = await store.get(bad.id);
    expect(fresh?.nextRun).toBeUndefined();
  });
});
