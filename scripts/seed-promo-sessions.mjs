/**
 * Seed mock sessions used for promo/marketing screenshots.
 *
 * These sessions are tuned to look pretty in README hero shots:
 * - one rich agent run with text + thinking + a tool call + a vega-lite
 *   artifact rendered inline
 * - one with a self-contained HTML artifact (Plotly-style chart)
 * - one with an image artifact
 * - one cron-rooted "scheduled job" session
 *
 * Used by tests/playwright/promo-screenshots.spec.ts via the standard
 * mock playwright webServer setup.
 */
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.env.PI_REMOTE_SESSION_ROOT ?? ".tmp/playwright-sessions");
const cwd = path.resolve(process.env.PI_REMOTE_PROJECT_ROOT ?? process.cwd());
await fs.mkdir(root, { recursive: true });

async function writeSession({ id, name, messages, order }) {
  const sessionFile = path.join(root, `${String(order).padStart(13, "0")}_${id}.mock-session.json`);
  await fs.writeFile(sessionFile, JSON.stringify({
    id,
    cwd,
    sessionFile,
    sessionName: name,
    messages,
    lastActivity: Date.now() + order,
  }, null, 2) + "\n");
  console.log(`seeded ${sessionFile}`);
}

// ────────────────────────────────────────────────────────────────────────
// Session 1: Plotting (Vega-Lite artifact)
// ────────────────────────────────────────────────────────────────────────

const vegaSpec = {
  $schema: "https://vega.github.io/schema/vega-lite/v5.json",
  description: "Daily 99th-percentile request latency over the last 30 days",
  width: "container",
  height: 220,
  data: {
    values: Array.from({ length: 30 }, (_, i) => {
      const seed = Math.sin(i * 0.7) * 0.5 + 0.5;
      const noise = (Math.sin(i * 1.7) + Math.cos(i * 2.3)) * 18;
      const baseline = 110 + i * 0.6;
      return {
        day: `2026-04-${String(i + 1).padStart(2, "0")}`,
        p99: Math.max(60, Math.round(baseline + seed * 35 + noise)),
        p50: Math.max(20, Math.round(baseline * 0.45 + noise * 0.3)),
      };
    }),
  },
  transform: [
    { fold: ["p50", "p99"], as: ["percentile", "ms"] },
  ],
  mark: { type: "line", point: { filled: true, size: 50 }, interpolate: "monotone" },
  encoding: {
    x: { field: "day", type: "temporal", title: null, axis: { format: "%b %d" } },
    y: { field: "ms", type: "quantitative", title: "latency (ms)" },
    color: {
      field: "percentile",
      type: "nominal",
      scale: { domain: ["p50", "p99"], range: ["#94a3b8", "#7c5cff"] },
      legend: { title: null, orient: "top" },
    },
  },
  config: { view: { stroke: null }, axis: { labelFontSize: 11, titleFontSize: 11 } },
};

await writeSession({
  order: 1,
  id: "promo-vega-latency",
  name: "Latency investigation",
  messages: [
    {
      role: "user",
      content: "Pull the last 30 days of request p99/p50 from the warehouse and chart them so I can see where the regression started.",
      timestamp: 1700000000100,
    },
    {
      role: "assistant",
      content: "I'll query the daily latency rollup and plot p50 + p99 inline.",
      timestamp: 1700000000200,
    },
    {
      role: "tool",
      content: "Query OK.  30 rows.  median p99 = 167 ms.  max p99 = 224 ms (2026-04-22).",
      timestamp: 1700000000300,
      tool: {
        id: "tool-1",
        name: "bash",
        args: { command: "duckdb warehouse.db -c 'select day, p50_ms, p99_ms from svc_latency_daily order by day desc limit 30'" },
        status: "success",
        output: "Query OK.  30 rows.  median p99 = 167 ms.  max p99 = 224 ms (2026-04-22).",
      },
    },
    {
      role: "custom",
      content: "Daily latency (p50 vs p99) — regression visible around 2026-04-22.",
      timestamp: 1700000000400,
      customType: "artifact",
      details: {
        version: 1,
        artifactGroupId: "promo-vega-latency-group",
        caption: "Daily latency (p50 vs p99) — regression visible around 2026-04-22.",
        artifacts: [
          { mime: "application/vnd.vega-lite.v5+json", spec: vegaSpec },
          { mime: "text/plain", text: "vega-lite line chart of p50 vs p99 latency over 30 days" },
        ],
      },
    },
    {
      role: "assistant",
      content: "Regression starts 2026-04-22 — p99 jumps from ~165 ms to 220+ ms while p50 stays flat. That timing lines up with deploy `web@4d2c1f`. Want me to diff that release?",
      timestamp: 1700000000500,
    },
  ],
});

// ────────────────────────────────────────────────────────────────────────
// Session 2: HTML artifact (self-contained mini dashboard)
// ────────────────────────────────────────────────────────────────────────

const htmlReport = `<!doctype html>
<html><head><meta charset="utf-8" /><style>
  :root { color-scheme: light; }
  html, body { margin: 0; padding: 16px 18px; font: 13px/1.4 -apple-system, system-ui, sans-serif; color: #0f172a; background: #fbf7ec; }
  h2 { margin: 0 0 12px; font-size: 14px; letter-spacing: 0.02em; text-transform: uppercase; color: #475569; }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px 14px; }
  .tile { background: white; border-radius: 10px; padding: 10px 12px; box-shadow: 0 1px 0 rgba(15,23,42,0.06); }
  .tile .label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; }
  .tile .value { font-size: 22px; font-weight: 600; margin-top: 4px; font-feature-settings: "tnum"; }
  .tile.good .value { color: #16a34a; } .tile.bad .value { color: #dc2626; }
  .bar { height: 6px; background: #e2e8f0; border-radius: 999px; overflow: hidden; margin-top: 8px; }
  .bar > span { display: block; height: 100%; background: linear-gradient(90deg, #7c5cff, #06b6d4); border-radius: 999px; }
  footer { margin-top: 14px; font-size: 11px; color: #64748b; }
</style></head><body>
  <h2>Cluster utilization · last 60 min</h2>
  <div class="grid">
    <div class="tile good"><div class="label">Active pods</div><div class="value">412</div><div class="bar"><span style="width:78%"></span></div></div>
    <div class="tile"><div class="label">CPU saturation</div><div class="value">63%</div><div class="bar"><span style="width:63%"></span></div></div>
    <div class="tile bad"><div class="label">P99 latency</div><div class="value">221 ms</div><div class="bar"><span style="width:88%"></span></div></div>
    <div class="tile good"><div class="label">Error rate</div><div class="value">0.04%</div><div class="bar"><span style="width:4%"></span></div></div>
  </div>
  <footer>Generated by ops-report skill · 2026-05-12 18:42 UTC</footer>
</body></html>`;

await writeSession({
  order: 2,
  id: "promo-html-dashboard",
  name: "Cluster sweep",
  messages: [
    { role: "user", content: "How's the cluster doing right now? Give me a quick at-a-glance summary I can paste in the standup channel.", timestamp: 1700000010100 },
    { role: "assistant", content: "Running the ops-report skill — it'll spit out a self-contained HTML tile that renders inline.", timestamp: 1700000010200 },
    {
      role: "custom",
      content: "Cluster utilization (last 60 min)",
      timestamp: 1700000010400,
      customType: "artifact",
      details: {
        version: 1,
        artifactGroupId: "promo-html-dashboard-group",
        caption: "Cluster utilization · last 60 min",
        artifacts: [
          { mime: "text/html", html: htmlReport, height: 220 },
          { mime: "text/plain", text: "Cluster utilization dashboard (HTML)" },
        ],
      },
    },
    { role: "assistant", content: "P99 is elevated (221 ms) but error rate is fine. I'd watch the latency tile for the next 10 min before paging anyone.", timestamp: 1700000010500 },
  ],
});

// ────────────────────────────────────────────────────────────────────────
// Session 3: Cron-rooted (looks like a scheduled run)
// ────────────────────────────────────────────────────────────────────────

await writeSession({
  order: 3,
  id: "promo-cron-dependabot",
  name: "cron: dependabot",
  messages: [
    { role: "user", content: "# Weekly Dependabot sweep\n\nQXO only. Single-shot, fire-and-forget, don't ask questions.", timestamp: 1700000020100 },
    { role: "assistant", content: "Fetching open alerts scoped to verticals/qxo/**…", timestamp: 1700000020200 },
    {
      role: "tool",
      content: "23 open alerts.  Auto-fixable: 18.  Blocked: 5 (no upstream fix).",
      timestamp: 1700000020300,
      tool: {
        id: "tool-cron-1",
        name: "bash",
        args: { command: "gh api 'repos/braincompany/platform/dependabot/alerts?state=open' --paginate | jq …" },
        status: "success",
        output: "23 open alerts.  Auto-fixable: 18.  Blocked: 5 (no upstream fix).",
      },
    },
    { role: "assistant", content: "Opened PR #2731 with 18 fixes (bumps + lockfile re-resolves). CI is green. 5 alerts left in the manual-handling table.", timestamp: 1700000020400 },
  ],
});

// ────────────────────────────────────────────────────────────────────────
// Session 4: Plain conversation (for the "active session" hero shot)
// ────────────────────────────────────────────────────────────────────────

await writeSession({
  order: 4,
  id: "promo-conversation",
  name: "Drafting the postmortem",
  messages: [
    { role: "user", content: "Help me draft the postmortem for last Friday's checkout outage. Keep it factual, 4 sections: what happened, impact, root cause, follow-ups.", timestamp: 1700000030100 },
    { role: "assistant", content: "Here's a tight first pass. The CSV of impacted accounts is queued — I can attach it as a downloadable artifact if you want.\n\n**What happened.** At 14:07 UTC the payment-gateway client started returning 502s; the retry loop saturated the connection pool, so the entire checkout-api fleet returned 504s for ~9 minutes.\n\n**Impact.** 412 checkouts failed. ~31% of those completed on retry within the next 10 min. 9 carts were abandoned outright.\n\n**Root cause.** A canary deploy of `payments-client@2.7` shipped a tighter HTTP/2 ping timeout that conflicts with our shared LB's idle-conn reaper. We didn't catch it because the canary's traffic share (5%) was below our P99 alert sensitivity.\n\n**Follow-ups.**\n  1. Pin `payments-client` ping timeout via env. Already merged in #14922.\n  2. Lower P99 alert threshold for canary cohorts. Tracked in [INFRA-841](#).\n  3. Soak test before bumping shared LB minor versions. Owner: @nikolai.\n", timestamp: 1700000030200 },
    { role: "user", content: "Looks good — tighten the impact section, the 31% figure should reference the retry-success log.", timestamp: 1700000030300 },
    { role: "assistant", content: "Updated:\n\n> **Impact.** 412 checkouts failed during the 9-minute window. Of those, 128 (31%) succeeded on the user's next attempt — see `retry-success.log` (linked in the SRE drive). The remaining 284 either succeeded on a later same-day attempt or never came back.", timestamp: 1700000030400 },
  ],
});

console.log("done seeding promo sessions");
