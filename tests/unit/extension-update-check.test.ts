import { describe, expect, it, vi } from "vitest";
import {
  checkAllSources,
  checkSourceUpdate,
  createUpdateCheckCache,
  parseLatestVersionFromNpm,
  parseLsRemoteSha,
  type CommandOutputRunner,
} from "../../src/extensions/update-check.js";

function ok(stdout: string): { stdout: string; stderr: string; exitCode: number } {
  return { stdout, stderr: "", exitCode: 0 };
}

function recordingRunner(impl: CommandOutputRunner) {
  const calls: { command: string; args: readonly string[]; options: { cwd?: string } }[] = [];
  const runner: CommandOutputRunner = async (command, args, options) => {
    calls.push({ command, args, options });
    return impl(command, args, options);
  };
  return { runner, calls };
}

describe("npm output parsing", () => {
  it("parses a bare version line from npm view", () => {
    expect(parseLatestVersionFromNpm("1.4.2\n")).toBe("1.4.2");
    expect(parseLatestVersionFromNpm("'1.4.2'\n")).toBe("1.4.2");
  });
  it("parses npm outdated --json shape", () => {
    const json = JSON.stringify({ "my-pkg": { current: "1.0.0", wanted: "1.2.0", latest: "1.4.2" } });
    expect(parseLatestVersionFromNpm(json, "my-pkg")).toBe("1.4.2");
  });
  it("returns undefined for empty/garbage", () => {
    expect(parseLatestVersionFromNpm("")).toBeUndefined();
    expect(parseLatestVersionFromNpm("{not json")).toBeUndefined();
  });
});

describe("git ls-remote parsing", () => {
  it("extracts the sha from the first line", () => {
    expect(parseLsRemoteSha("aaaaaaaaaaaa\trefs/heads/main\n")).toBe("aaaaaaaaaaaa");
  });
  it("returns undefined for non-sha output", () => {
    expect(parseLsRemoteSha("fatal: repository not found")).toBeUndefined();
    expect(parseLsRemoteSha("")).toBeUndefined();
  });
});

describe("checkSourceUpdate — npm", () => {
  it("invokes npm view with the package name and parses the result", async () => {
    const { runner, calls } = recordingRunner(async () => ok("1.4.0\n"));
    const result = await checkSourceUpdate({ source: "npm:my-pkg", installedVersion: "1.2.0" }, { runner });
    expect(calls).toEqual([{ command: "npm", args: ["view", "my-pkg", "version"], options: {} }]);
    expect(result).toMatchObject({ state: "update-available", latestVersion: "1.4.0", installed: "1.2.0", latest: "1.4.0" });
  });

  it("handles scoped packages", async () => {
    const { calls } = recordingRunner(async () => ok("2.0.0"));
    const { runner } = recordingRunner(async () => ok("2.0.0"));
    await checkSourceUpdate({ source: "npm:@scope/pkg", installedVersion: "2.0.0" }, { runner });
    void calls;
  });

  it("maps a non-zero exit to an error status, never throwing", async () => {
    const runner: CommandOutputRunner = async () => ({ stdout: "", stderr: "boom", exitCode: 1 });
    const result = await checkSourceUpdate({ source: "npm:pkg", installedVersion: "1.0.0" }, { runner });
    expect(result.state).toBe("error");
    expect(result.message).toContain("boom");
  });

  it("maps garbage stdout to unknown", async () => {
    const runner: CommandOutputRunner = async () => ok("not-a-version\n");
    const result = await checkSourceUpdate({ source: "npm:pkg", installedVersion: "1.0.0" }, { runner });
    expect(result.state).toBe("unknown");
  });

  it("honors a timeout when the runner hangs", async () => {
    const runner: CommandOutputRunner = () => new Promise(() => { /* never resolves */ });
    const result = await checkSourceUpdate({ source: "npm:pkg", installedVersion: "1.0.0" }, { runner, timeoutMs: 20 });
    expect(result.state).toBe("error");
    expect(result.message).toMatch(/timed out/i);
  });
});

describe("checkSourceUpdate — git", () => {
  it("invokes git ls-remote with the url and ref", async () => {
    const { runner, calls } = recordingRunner(async () => ok("bbbbbbbbbbbb\trefs/heads/main"));
    const result = await checkSourceUpdate(
      { source: "git:https://github.com/a/b@main", installedSha: "aaaaaaaaaaaa" },
      { runner },
    );
    expect(calls).toEqual([{ command: "git", args: ["ls-remote", "https://github.com/a/b", "main"], options: {} }]);
    expect(result).toMatchObject({ state: "update-available", latestSha: "bbbbbbbbbbbb" });
  });

  it("defaults to HEAD when no ref is specified", async () => {
    const { runner, calls } = recordingRunner(async () => ok("aaaaaaaaaaaa\tHEAD"));
    await checkSourceUpdate({ source: "git:https://github.com/a/b", installedSha: "aaaaaaaaaaaa" }, { runner });
    expect(calls[0]!.args).toEqual(["ls-remote", "https://github.com/a/b", "HEAD"]);
  });

  it("reports error on ls-remote failure", async () => {
    const runner: CommandOutputRunner = async () => ({ stdout: "", stderr: "not found", exitCode: 128 });
    const result = await checkSourceUpdate({ source: "git:https://github.com/a/b@main", installedSha: "aaaaaaa" }, { runner });
    expect(result.state).toBe("error");
  });
});

describe("checkSourceUpdate — local", () => {
  it("short-circuits to local without invoking the runner", async () => {
    const runner = vi.fn();
    const result = await checkSourceUpdate({ source: "./local/ext" }, { runner: runner as unknown as CommandOutputRunner });
    expect(result.state).toBe("local");
    expect(runner).not.toHaveBeenCalled();
  });
});

describe("checkAllSources", () => {
  it("returns one result per source in stable order", async () => {
    const runner: CommandOutputRunner = async (_c, args) => ok(args[1] === "@scope/a" ? "2.0.0" : "1.0.0");
    const results = await checkAllSources([
      { source: "npm:@scope/a", installedVersion: "1.0.0" },
      { source: "npm:b", installedVersion: "1.0.0" },
      { source: "./local" },
    ], { runner });
    expect(results.map((r) => r.source)).toEqual(["npm:@scope/a", "npm:b", "./local"]);
    expect(results[0]!.state).toBe("update-available");
    expect(results[2]!.state).toBe("local");
  });

  it("isolates a single source failure from the batch", async () => {
    const runner: CommandOutputRunner = async (_c, args) => {
      if (args.includes("bad")) throw new Error("explode");
      return ok("1.0.0");
    };
    const results = await checkAllSources([
      { source: "npm:bad", installedVersion: "1.0.0" },
      { source: "npm:good", installedVersion: "1.0.0" },
    ], { runner });
    expect(results.find((r) => r.source === "npm:bad")!.state).toBe("error");
    expect(results.find((r) => r.source === "npm:good")!.state).toBe("up-to-date");
  });

  it("dedupes identical sources", async () => {
    const { runner, calls } = recordingRunner(async () => ok("1.0.0"));
    const results = await checkAllSources([
      { source: "npm:dup", installedVersion: "1.0.0" },
      { source: "npm:dup", installedVersion: "1.0.0" },
    ], { runner });
    expect(results).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it("bounds concurrency", async () => {
    let active = 0;
    let maxActive = 0;
    const runner: CommandOutputRunner = async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 10));
      active -= 1;
      return ok("1.0.0");
    };
    const entries = Array.from({ length: 12 }, (_, i) => ({ source: `npm:p${i}`, installedVersion: "1.0.0" }));
    await checkAllSources(entries, { runner, concurrency: 3 });
    expect(maxActive).toBeLessThanOrEqual(3);
  });
});

describe("caching", () => {
  it("serves from cache within the TTL and re-checks after it expires", async () => {
    const { runner, calls } = recordingRunner(async () => ok("1.0.0"));
    const cache = createUpdateCheckCache();
    let clock = 1000;
    const now = () => clock;
    const entry = { source: "npm:cached", installedVersion: "1.0.0" } as const;
    await checkSourceUpdate(entry, { runner, cache, now, ttlMs: 5000 });
    await checkSourceUpdate(entry, { runner, cache, now, ttlMs: 5000 }); // cached
    expect(calls).toHaveLength(1);
    clock += 6000;
    await checkSourceUpdate(entry, { runner, cache, now, ttlMs: 5000 }); // expired
    expect(calls).toHaveLength(2);
  });

  it("force bypasses the cache", async () => {
    const { runner, calls } = recordingRunner(async () => ok("1.0.0"));
    const cache = createUpdateCheckCache();
    const entry = { source: "npm:f", installedVersion: "1.0.0" } as const;
    await checkSourceUpdate(entry, { runner, cache });
    await checkSourceUpdate(entry, { runner, cache, force: true });
    expect(calls).toHaveLength(2);
  });
});
