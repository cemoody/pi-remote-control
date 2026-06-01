import { describe, expect, it } from "vitest";
import { readLockfileGitShas, serializeExtensionPackages } from "../../src/extensions/metadata.js";
import type { PrcExtensionHost } from "../../src/extensions/registry.js";

function hostWithPlan(plan: { id: string; packageSource: string; scope: "global" | "project" | "explicit" }[]): PrcExtensionHost {
  return { contributionPlan: plan } as unknown as PrcExtensionHost;
}

describe("serializeExtensionPackages", () => {
  it("reports name + version from each package manifest", () => {
    const result = serializeExtensionPackages(
      hostWithPlan([{ id: "artifacts", packageSource: "/x/artifacts", scope: "global" }]),
      { readManifest: () => ({ name: "@cemoody/pi-crust-ext-artifacts", version: "0.1.1" }) },
    );
    expect(result).toEqual([
      { id: "artifacts", name: "@cemoody/pi-crust-ext-artifacts", version: "0.1.1", scope: "global" },
    ]);
  });

  it("prefers package.json gitHead, then the injected lockfile SHA", () => {
    const [withHead, withLock] = serializeExtensionPackages(
      hostWithPlan([
        { id: "a", packageSource: "/x/a", scope: "global" },
        { id: "b", packageSource: "/x/b", scope: "project" },
      ]),
      {
        readManifest: (dir) =>
          dir.endsWith("/a")
            ? { name: "a", version: "1.0.0", gitHead: "deadbeefcafe1234" }
            : { name: "b", version: "0.0.0" },
        gitShaForPackage: (name) => (name === "b" ? "18cf7c217064" : undefined),
      },
    );
    expect(withHead!.sha).toBe("deadbeefcafe"); // truncated to 12
    expect(withLock!.sha).toBe("18cf7c217064");
  });

  it("dedups by extension id (first contribution wins)", () => {
    const result = serializeExtensionPackages(
      hostWithPlan([
        { id: "dup", packageSource: "/x/first", scope: "project" },
        { id: "dup", packageSource: "/x/second", scope: "global" },
      ]),
      { readManifest: (dir) => ({ name: dir, version: "1.0.0" }) },
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.scope).toBe("project");
  });

  it("returns [] when there is no extension host", () => {
    expect(serializeExtensionPackages(undefined)).toEqual([]);
  });
});

describe("readLockfileGitShas", () => {
  it("maps package names to the #<sha> of git resolved URLs", () => {
    const lock = JSON.stringify({
      packages: {
        "node_modules/@cemoody/pi-crust-ext-pr-story": {
          resolved: "git+ssh://git@github.com/cemoody/pi-crust-ext-pr-story.git#18cf7c2170640db91ed8bd682850847b58bf9154",
        },
        "node_modules/@cemoody/pi-crust-ext-artifacts": {
          resolved: "https://registry.npmjs.org/@cemoody/pi-crust-ext-artifacts/-/pi-crust-ext-artifacts-0.1.1.tgz",
        },
      },
    });
    const map = readLockfileGitShas("/repo", () => lock);
    expect(map.get("@cemoody/pi-crust-ext-pr-story")).toBe("18cf7c217064");
    // npm registry tarballs have no #sha and are skipped.
    expect(map.has("@cemoody/pi-crust-ext-artifacts")).toBe(false);
  });

  it("returns an empty map when the lockfile is missing", () => {
    const map = readLockfileGitShas("/repo", () => { throw new Error("ENOENT"); });
    expect(map.size).toBe(0);
  });
});
