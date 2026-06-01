import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("extension-update runner discipline (Layer 9 static guard)", () => {
  it("update-check imports child_process lazily (no module-scope spawn)", () => {
    const src = read("src/extensions/update-check.ts");
    // The only child_process usage must be a dynamic import inside the default runner.
    expect(src).toMatch(/await import\("node:child_process"\)/);
    expect(src).not.toMatch(/^import .*child_process/m);
  });

  it("update-apply funnels all process execution through an injectable runner", () => {
    const src = read("src/extensions/update-apply.ts");
    expect(src).toMatch(/options\.runner \?\? defaultPackageRunner/);
    expect(src).not.toMatch(/^import .*child_process/m);
  });

  it("the server exposes test seams for both update runners", () => {
    const src = read("src/server/http-api-server.ts");
    expect(src).toMatch(/extensionUpdateCheckRunner\?:/);
    expect(src).toMatch(/extensionUpdateApplyRunner\?:/);
  });

  it("the update endpoints exist and require a configured runtime", () => {
    const src = read("src/server/http-api-server.ts");
    expect(src).toMatch(/\/api\/extensions\/updates/);
    expect(src).toMatch(/\/api\/extensions\/packages\/update/);
    expect(src).toMatch(/extension update checks/);
    expect(src).toMatch(/extension package updates/);
  });
});
