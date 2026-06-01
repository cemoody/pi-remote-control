import { describe, expect, it } from "vitest";
import {
  compareVersions,
  computeUpdateStatus,
  isPinned,
  parseSemver,
  shaMatches,
} from "../../src/extensions/update-status.js";

describe("compareVersions — semver ordering", () => {
  it("orders adjacent patch releases", () => {
    expect(compareVersions("1.2.3", "1.2.4")).toBe(-1);
    expect(compareVersions("1.2.4", "1.2.3")).toBe(1);
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
  });

  it("compares numerically, not lexically (1.10 > 1.9)", () => {
    expect(compareVersions("1.10.0", "1.9.0")).toBe(1);
    expect(compareVersions("1.9.0", "1.10.0")).toBe(-1);
  });

  it("treats installed-ahead-of-latest as greater", () => {
    expect(compareVersions("2.0.0", "1.9.9")).toBe(1);
  });

  it("ranks a prerelease below its release", () => {
    expect(compareVersions("1.2.3-beta.1", "1.2.3")).toBe(-1);
    expect(compareVersions("1.2.3", "1.2.3-beta.1")).toBe(1);
  });

  it("orders prerelease identifiers numerically (beta.2 < beta.10)", () => {
    expect(compareVersions("1.2.3-beta.2", "1.2.3-beta.10")).toBe(-1);
  });

  it("ignores build metadata", () => {
    expect(compareVersions("1.2.3+build1", "1.2.3+build2")).toBe(0);
  });

  it("normalizes a leading v", () => {
    expect(compareVersions("v1.2.3", "1.2.3")).toBe(0);
  });

  it("throws RangeError for malformed input", () => {
    expect(() => compareVersions("1.2", "1.2.3")).toThrow(RangeError);
    expect(() => compareVersions("not-a-version", "1.2.3")).toThrow(RangeError);
  });
});

describe("parseSemver", () => {
  it("rejects leading-zero numeric identifiers", () => {
    expect(parseSemver("01.2.3")).toBeNull();
    expect(parseSemver("1.02.3")).toBeNull();
  });

  it("parses prerelease identifiers as numbers and strings", () => {
    expect(parseSemver("1.2.3-beta.2")?.prerelease).toEqual(["beta", 2]);
  });

  it("returns null for non-strings and garbage", () => {
    expect(parseSemver(undefined)).toBeNull();
    expect(parseSemver("latest")).toBeNull();
  });
});

describe("shaMatches", () => {
  it("matches identical shas", () => {
    expect(shaMatches("abc1234def0", "abc1234def0")).toBe(true);
  });
  it("matches on common prefix length", () => {
    expect(shaMatches("abc1234", "abc1234def0")).toBe(true);
  });
  it("rejects differing shas", () => {
    expect(shaMatches("abc1234", "def5678")).toBe(false);
  });
  it("rejects empty / garbage", () => {
    expect(shaMatches("", "abc1234")).toBe(false);
    expect(shaMatches("zzz", "abc1234")).toBe(false);
    expect(shaMatches(undefined, "abc1234")).toBe(false);
  });
});

describe("isPinned", () => {
  it("treats exact npm versions as pinned", () => {
    expect(isPinned("npm:pkg@1.2.3")).toBe(true);
    expect(isPinned("npm:@scope/pkg@1.2.3")).toBe(true);
  });
  it("treats latest / no-version / ranges npm specs as not pinned", () => {
    expect(isPinned("npm:pkg")).toBe(false);
    expect(isPinned("npm:pkg@latest")).toBe(false);
    expect(isPinned("npm:pkg@^1.0.0")).toBe(false);
    expect(isPinned("npm:pkg@~1.2.0")).toBe(false);
    expect(isPinned("npm:pkg@1.x")).toBe(false);
  });
  it("treats git sha / version tag refs as pinned", () => {
    expect(isPinned("git:https://github.com/a/b@1a2b3c4")).toBe(true);
    expect(isPinned("git:https://github.com/a/b@v1.2.0")).toBe(true);
  });
  it("treats git branch / no-ref as not pinned", () => {
    expect(isPinned("git:https://github.com/a/b@main")).toBe(false);
    expect(isPinned("git:https://github.com/a/b")).toBe(false);
  });
  it("treats local sources as not pinned", () => {
    expect(isPinned("./local/ext")).toBe(false);
  });
});

describe("computeUpdateStatus — npm", () => {
  it("flags an available update", () => {
    expect(computeUpdateStatus({ source: "npm:pkg", kind: "npm", installedVersion: "1.2.3", latestVersion: "1.3.0" }))
      .toMatchObject({ state: "update-available", installed: "1.2.3", latest: "1.3.0", pinned: false });
  });
  it("reports up to date", () => {
    expect(computeUpdateStatus({ source: "npm:pkg", kind: "npm", installedVersion: "1.2.3", latestVersion: "1.2.3" }))
      .toMatchObject({ state: "up-to-date" });
  });
  it("does not nag pinned versions even when newer exists", () => {
    expect(computeUpdateStatus({ source: "npm:pkg@1.2.3", kind: "npm", installedVersion: "1.2.3", latestVersion: "9.9.9" }))
      .toMatchObject({ state: "pinned" });
  });
  it("is unknown when a version is missing", () => {
    expect(computeUpdateStatus({ source: "npm:pkg", kind: "npm", installedVersion: "1.2.3" }))
      .toMatchObject({ state: "unknown" });
  });
  it("is unknown (never throws) for unparseable versions", () => {
    expect(computeUpdateStatus({ source: "npm:pkg", kind: "npm", installedVersion: "weird", latestVersion: "1.2.3" }))
      .toMatchObject({ state: "unknown" });
  });
  it("treats installed-ahead-of-latest as up to date", () => {
    expect(computeUpdateStatus({ source: "npm:pkg", kind: "npm", installedVersion: "2.0.0", latestVersion: "1.0.0" }))
      .toMatchObject({ state: "up-to-date" });
  });
});

describe("computeUpdateStatus — git", () => {
  it("flags an available update when shas differ", () => {
    expect(computeUpdateStatus({ source: "git:url@main", kind: "git", installedSha: "aaaaaaa", latestSha: "bbbbbbb" }))
      .toMatchObject({ state: "update-available" });
  });
  it("reports up to date when shas match", () => {
    expect(computeUpdateStatus({ source: "git:url@main", kind: "git", installedSha: "aaaaaaa1234", latestSha: "aaaaaaa" }))
      .toMatchObject({ state: "up-to-date" });
  });
  it("does not nag pinned shas", () => {
    expect(computeUpdateStatus({ source: "git:url@aaaaaaa", kind: "git", installedSha: "aaaaaaa", latestSha: "bbbbbbb" }))
      .toMatchObject({ state: "pinned" });
  });
  it("is unknown when sha missing/garbage", () => {
    expect(computeUpdateStatus({ source: "git:url@main", kind: "git", installedSha: "zzz", latestSha: "bbbbbbb" }))
      .toMatchObject({ state: "unknown" });
  });
});

describe("computeUpdateStatus — local", () => {
  it("always reports local", () => {
    expect(computeUpdateStatus({ source: "./ext", kind: "local", installedVersion: "1.0.0" }))
      .toMatchObject({ state: "local" });
  });
});
