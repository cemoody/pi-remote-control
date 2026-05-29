import { describe, expect, it } from "vitest";
import { resolveSlashCommandRoute, sanitizePiDynamicCommands, type PiDynamicCommandInfo } from "../../src/shared/slash-command-routing.js";

const builtins = [{ name: "model" }, { name: "login" }, { name: "reload" }];
const prcExtensions = [{ slashName: "fork", id: "core.branching.fork" }, { slashName: "clone", id: "core.branching.clone" }];
const dynamic = (name: string, source: PiDynamicCommandInfo["source"] = "extension"): PiDynamicCommandInfo => ({ name, source });

describe("resolveSlashCommandRoute", () => {
  it("routes builtins before Pi dynamic commands", () => {
    expect(resolveSlashCommandRoute({
      name: "model",
      builtins,
      prcExtensionCommands: [],
      piDynamicCommands: [dynamic("model")],
    })).toMatchObject({ kind: "builtin", command: { name: "model" } });
  });

  it("routes builtins before pi-crust extension slash commands", () => {
    expect(resolveSlashCommandRoute({
      name: "reload",
      builtins,
      prcExtensionCommands: [{ slashName: "reload", id: "ext.reload" }],
      piDynamicCommands: [],
    })).toMatchObject({ kind: "builtin", command: { name: "reload" } });
  });

  it("routes pi-crust extension slash commands before Pi dynamic commands", () => {
    expect(resolveSlashCommandRoute({
      name: "fork",
      builtins,
      prcExtensionCommands: prcExtensions,
      piDynamicCommands: [dynamic("fork")],
    })).toMatchObject({ kind: "prc-extension", command: { slashName: "fork" } });
  });

  it("routes dynamic Pi extension commands generically", () => {
    expect(resolveSlashCommandRoute({
      name: "litellm-refresh",
      builtins,
      prcExtensionCommands: prcExtensions,
      piDynamicCommands: [dynamic("litellm-refresh", "extension")],
    })).toMatchObject({ kind: "pi-dynamic", command: { name: "litellm-refresh", source: "extension" } });
  });

  it("routes dynamic Pi skill commands generically", () => {
    expect(resolveSlashCommandRoute({
      name: "skill:brave-search",
      builtins,
      prcExtensionCommands: prcExtensions,
      piDynamicCommands: [dynamic("skill:brave-search", "skill")],
    })).toMatchObject({ kind: "pi-dynamic", command: { name: "skill:brave-search", source: "skill" } });
  });

  it("routes dynamic Pi prompt-template commands generically", () => {
    expect(resolveSlashCommandRoute({
      name: "fix-tests",
      builtins,
      prcExtensionCommands: prcExtensions,
      piDynamicCommands: [dynamic("fix-tests", "prompt")],
    })).toMatchObject({ kind: "pi-dynamic", command: { name: "fix-tests", source: "prompt" } });
  });

  it("leaves unknown commands unknown", () => {
    expect(resolveSlashCommandRoute({
      name: "does-not-exist",
      builtins,
      prcExtensionCommands: prcExtensions,
      piDynamicCommands: [dynamic("litellm-refresh")],
    })).toEqual({ kind: "unknown" });
  });

  it("matches command names case-sensitively", () => {
    expect(resolveSlashCommandRoute({
      name: "LiteLLM-Refresh",
      builtins,
      prcExtensionCommands: [],
      piDynamicCommands: [dynamic("litellm-refresh")],
    })).toEqual({ kind: "unknown" });
  });

  it("filters unsafe and duplicate dynamic command names", () => {
    expect(sanitizePiDynamicCommands([
      dynamic("litellm-refresh"),
      dynamic("../evil"),
      dynamic("with/slash"),
      dynamic("<script>"),
      dynamic("litellm-refresh"),
      dynamic("skill:brave-search", "skill"),
    ])).toEqual([
      dynamic("litellm-refresh"),
      dynamic("skill:brave-search", "skill"),
    ]);
  });
});
