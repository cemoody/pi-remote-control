import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { MockPiAdapter } from "../../src/server/pi/mock-pi-adapter.js";

describe("Pi session branching adapter contract", () => {
  async function makeAdapter() {
    const sessionRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-remote-branch-"));
    return { sessionRoot, adapter: new MockPiAdapter({ sessionRoot, assistantResponse: (prompt) => `answer:${prompt}` }) };
  }

  it("forks by creating a persisted session containing the selected path", async () => {
    const { adapter } = await makeAdapter();
    const session = await adapter.createSession({ cwd: os.tmpdir(), sessionName: "Original" });
    await session.prompt("first");
    await session.prompt("second");
    const tree = await session.getTree();
    const firstUser = tree.entries.find((entry) => entry.role === "user" && entry.text === "first");
    expect(firstUser).toBeDefined();

    const branch = await session.createFork!(firstUser!.id);
    expect(branch.selectedText).toBe("first");
    const fork = await adapter.openSession({ sessionFile: branch.sessionFile });
    expect((await fork.getMessages()).map((message) => message.content)).toEqual(["first"]);
  });

  it("clones the current branch without replaying prompts", async () => {
    const { adapter } = await makeAdapter();
    const session = await adapter.createSession({ cwd: os.tmpdir(), sessionName: "Original" });
    await session.prompt("first");
    await session.prompt("second");

    const branch = await session.cloneCurrent!();
    const clone = await adapter.openSession({ sessionFile: branch.sessionFile });
    expect((await clone.getMessages()).map((message) => message.content)).toEqual(["first", "answer:first", "second", "answer:second"]);
  });
});
