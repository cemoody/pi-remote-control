/**
 * The browser Terminal is an OPT-IN feature: the base `pi-crust` distribution
 * ships it dormant and only `pi-crust-full` enables it (PI_CRUST_ENABLE_TERMINAL=1).
 * This pins the parser so the base distribution can never accidentally enable it.
 */
import { describe, expect, it } from "vitest";
import { isTerminalFeatureEnabled } from "../../src/server/http-api-server.js";

describe("isTerminalFeatureEnabled", () => {
  it("is disabled by default (base distribution)", () => {
    expect(isTerminalFeatureEnabled({})).toBe(false);
    expect(isTerminalFeatureEnabled({ PI_CRUST_ENABLE_TERMINAL: undefined })).toBe(false);
  });

  it("is disabled for falsey-ish values", () => {
    for (const v of ["0", "false", "no", "off", "", "   ", "nope"]) {
      expect(isTerminalFeatureEnabled({ PI_CRUST_ENABLE_TERMINAL: v })).toBe(false);
    }
  });

  it("is enabled for truthy values (pi-crust-full sets '1')", () => {
    for (const v of ["1", "true", "TRUE", "yes", "on", " 1 "]) {
      expect(isTerminalFeatureEnabled({ PI_CRUST_ENABLE_TERMINAL: v })).toBe(true);
    }
  });
});
