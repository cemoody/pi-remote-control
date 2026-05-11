import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = path.resolve("src");

describe("server process isolation", () => {
  it("does not call process.chdir in source code", async () => {
    const files = await listTypeScriptFiles(SOURCE_ROOT);
    const offenders: string[] = [];
    for (const file of files) {
      const content = await fs.readFile(file, "utf8");
      if (content.includes("process.chdir")) offenders.push(path.relative(process.cwd(), file));
    }
    expect(offenders).toEqual([]);
  });
});

async function listTypeScriptFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return listTypeScriptFiles(fullPath);
      return entry.isFile() && entry.name.endsWith(".ts") ? [fullPath] : [];
    }),
  );
  return files.flat();
}
