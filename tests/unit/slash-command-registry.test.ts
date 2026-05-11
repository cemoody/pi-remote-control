import { describe, expect, it } from "vitest";
import { commandSuggestionNames, parseSlashCommand, resolveSlashCommand } from "../../src/web/commands/slash-command-registry.js";

describe("slash command registry", () => {
  it("parses command names and argv", () => {
    expect(parseSlashCommand("/model sonnet")).toEqual({ raw: "/model sonnet", name: "model", argv: "sonnet" });
    expect(parseSlashCommand("  /name Feature work  ")).toEqual({ raw: "/name Feature work", name: "name", argv: "Feature work" });
  });

  it("ignores non-slash and empty slash input", () => {
    expect(parseSlashCommand("please use /model")).toBeNull();
    expect(parseSlashCommand("/")).toBeNull();
    expect(parseSlashCommand("hello")).toBeNull();
  });

  it("resolves aliases to canonical commands", () => {
    expect(resolveSlashCommand("models")?.name).toBe("model");
    expect(resolveSlashCommand("info")?.name).toBe("session");
    expect(resolveSlashCommand("close")?.name).toBe("quit");
  });

  it("returns metadata-driven suggestion names with dynamic commands appended", () => {
    const suggestions = commandSuggestionNames([{ name: "deploy", source: "extension", description: "Deploy" }]);
    expect(suggestions).toContain("model");
    expect(suggestions).toContain("settings");
    expect(suggestions).toContain("deploy");
  });
});
