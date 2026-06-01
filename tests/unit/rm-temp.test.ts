import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { rmrfRetry } from "../helpers/rm-temp.js";

const timers: NodeJS.Timeout[] = [];

afterEach(() => {
  timers.splice(0).forEach((timer) => clearInterval(timer));
});

describe("rmrfRetry", () => {
  it("removes a simple temp tree", async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "rmrf-simple-"));
    await fsp.mkdir(path.join(root, "a", "b"), { recursive: true });
    await fsp.writeFile(path.join(root, "a", "b", "f.txt"), "hi");
    await rmrfRetry(root);
    expect(fs.existsSync(root)).toBe(false);
  });

  it("is a no-op for a missing path", async () => {
    await expect(rmrfRetry(path.join(os.tmpdir(), "rmrf-does-not-exist-" + Date.now()))).resolves.toBeUndefined();
  });

  it("succeeds even when a process keeps writing into the tree (ENOTEMPTY race)", async () => {
    // Reproduces the detached-child cleanup race that made
    // tests/e2e/http-api-reload.test.ts flaky: a still-draining process
    // writes into the dir between rm's readdir and rmdir, yielding ENOTEMPTY.
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "rmrf-race-"));
    const sub = path.join(root, "sessions");
    await fsp.mkdir(sub, { recursive: true });

    let n = 0;
    let writing = true;
    const timer = setInterval(() => {
      if (!writing) return;
      try { fs.writeFileSync(path.join(sub, `f${n++}.log`), "x"); } catch { /* dir gone */ }
    }, 0);
    timers.push(timer);

    await new Promise((resolve) => setTimeout(resolve, 5));
    // Stop the writer shortly after rm begins so the retry loop can win.
    setTimeout(() => { writing = false; }, 30);

    await rmrfRetry(root, { attempts: 200, delayMs: 5 });
    clearInterval(timer);
    expect(fs.existsSync(root)).toBe(false);
  });
});
