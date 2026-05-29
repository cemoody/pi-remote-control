import { describe, expect, it } from "vitest";
import { parseSlashCommand } from "../../src/shared/slash-command-parser.js";

describe("parseSlashCommand", () => {
  it("parses a command without arguments", () => {
    expect(parseSlashCommand("/litellm-refresh")).toEqual({
      name: "litellm-refresh",
      argv: "",
      original: "/litellm-refresh",
    });
  });

  it("parses a command with arguments", () => {
    expect(parseSlashCommand("/litellm-refresh now")).toEqual({
      name: "litellm-refresh",
      argv: "now",
      original: "/litellm-refresh now",
    });
  });

  it("parses skill commands with colons", () => {
    expect(parseSlashCommand("/skill:brave-search query terms")).toEqual({
      name: "skill:brave-search",
      argv: "query terms",
      original: "/skill:brave-search query terms",
    });
  });

  it("preserves original command text and argument spacing", () => {
    expect(parseSlashCommand("/fix-tests --focus auth  extra spacing")).toEqual({
      name: "fix-tests",
      argv: "--focus auth  extra spacing",
      original: "/fix-tests --focus auth  extra spacing",
    });
  });

  it("does not parse slash text that is not at the start", () => {
    expect(parseSlashCommand("Please run /litellm-refresh")).toBeUndefined();
  });

  it("does not trim leading whitespace into a command", () => {
    expect(parseSlashCommand(" /litellm-refresh")).toBeUndefined();
  });

  it("treats bare slash and slash-space as incomplete", () => {
    expect(parseSlashCommand("/")).toBeUndefined();
    expect(parseSlashCommand("/ model")).toBeUndefined();
  });
});
