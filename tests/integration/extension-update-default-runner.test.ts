import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkAllSources } from "../../src/extensions/update-check.js";

// Regression: the production server does NOT inject a command runner, so the
// update check must fall back to the real default runner (spawning npm/git)
// instead of returning { state: "error", message: "No command runner available." }.
// We make this hermetic by putting a fake `npm` on PATH so no network is hit.

let dir: string;
let prevPath: string | undefined;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "prc-fake-bin-"));
  const npm = path.join(dir, "npm");
  // `npm view <pkg> version` -> prints the "latest" version.
  await fs.writeFile(npm, "#!/usr/bin/env bash\nif [ \"$1\" = view ]; then echo 2.5.0; exit 0; fi\nexit 1\n", { mode: 0o755 });
  prevPath = process.env.PATH;
  process.env.PATH = `${dir}${path.delimiter}${prevPath ?? ""}`;
});

afterEach(async () => {
  if (prevPath !== undefined) process.env.PATH = prevPath;
  await fs.rm(dir, { recursive: true, force: true });
});

describe("update check default runner (no injection, like prod)", () => {
  it("uses the default runner when none is injected (npm source resolves, not an error)", async () => {
    const results = await checkAllSources(
      [{ source: "npm:cool-extension", installedVersion: "1.0.0" }],
      // deliberately NO runner — mirrors the server
    );
    const result = results[0]!;
    expect(result.state).not.toBe("error");
    expect(result.message ?? "").not.toMatch(/no command runner/i);
    expect(result.state).toBe("update-available");
    expect((result as { latestVersion?: string }).latestVersion).toBe("2.5.0");
  });
});
