import { describe, expect, it } from "vitest";
import { resolvePiCommand, resolvePiVersion } from "../../src/server/pi-version.js";

describe("resolvePiCommand", () => {
  it("prefers the PI_CRUST_PI_COMMAND override", () => {
    expect(resolvePiCommand({ PI_CRUST_PI_COMMAND: "/custom/pi" } as NodeJS.ProcessEnv, "/tmp")).toBe("/custom/pi");
  });

  it("falls back to bare `pi` when no local binary exists", () => {
    // /nonexistent has no node_modules/.bin/pi, so we get the PATH fallback.
    expect(resolvePiCommand({} as NodeJS.ProcessEnv, "/nonexistent-cwd-xyz")).toBe("pi");
  });
});

describe("resolvePiVersion", () => {
  it("returns the trimmed semver from `pi --version`", () => {
    expect(resolvePiVersion({ command: "pi", runner: () => "0.78.0\n" })).toBe("0.78.0");
  });

  it("tolerates a `pi 0.78.0` prefix and extra whitespace", () => {
    expect(resolvePiVersion({ command: "pi", runner: () => "  pi 0.78.0  \n" })).toBe("0.78.0");
  });

  it("returns 'unknown' when the probe fails", () => {
    expect(resolvePiVersion({ command: "pi", runner: () => null })).toBe("unknown");
  });

  it("returns 'unknown' on empty output", () => {
    expect(resolvePiVersion({ command: "pi", runner: () => "\n\n" })).toBe("unknown");
  });
});
