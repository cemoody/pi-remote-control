import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { bootstrapPrcExtensions } from "../../src/extensions/bootstrap.js";
import { serializeExtensions } from "../../src/extensions/metadata.js";
import { writePrcSettings } from "../../src/extensions/packages.js";
import { writeLocalExtensionPackage } from "../helpers/local-extension-package.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function tempRoot(prefix: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

/**
 * Contract for any extension that wants to own a Settings section (the
 * presentations extension is the canonical user, but the contract is the same
 * for everyone). We exercise the contract against a fixture extension so the
 * test doesn't dependency-couple the pi-crust repo to whichever version of
 * @cemoody/pi-crust-ext-presentations is installed.
 *
 * The presentations extension then ships the matching activate() body + web
 * module separately; bundled-extension-packages.test.ts pins the integration.
 */

const FIXTURE_NAME = "fake-presentations-ext";
const FIXTURE_SERVER_CODE = `
export default async function activate(prc) {
  prc.settings.registerSection({
    id: 'core.presentations.settings',
    title: 'Presentation templates',
    order: 50,
    description: 'Folders scanned for template packs.',
  });
}
`;
const FIXTURE_MANIFEST = {
  name: FIXTURE_NAME,
  version: "0.0.0-test",
  piRemoteControl: {
    extension: "./server.mjs",
    web: "./web.mjs",
  },
};

async function setupFixturePackage(root: string): Promise<string> {
  const packageDir = await writeLocalExtensionPackage(root, {
    name: FIXTURE_NAME,
    extensionFile: "server.mjs",
    extensionCode: FIXTURE_SERVER_CODE,
    manifest: FIXTURE_MANIFEST,
  });
  // Stub web module discovered via `piRemoteControl.web` — contents are
  // irrelevant for host-side contract tests, just needs to exist on disk so
  // the package resolver registers it as a web asset.
  await fs.writeFile(path.join(packageDir, "web.mjs"), "export function renderSettingsSection(){return null;}\n", "utf8");
  return packageDir;
}

describe("settings-section contribution contract (presentations as canonical example)", () => {
  it("lets an extension register a Settings section without adding a sidebar activity", async () => {
    const root = await tempRoot("prc-settings-section-");
    const packageDir = await setupFixturePackage(root);

    const result = await bootstrapPrcExtensions({
      configDir: path.join(root, "config"),
      cwd: root,
      dataDir: path.join(root, "data"),
      bundledPackagePaths: [packageDir],
    });

    const sections = result.host.settings.list().filter((s) => s.extensionId === FIXTURE_NAME);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.title).toBe("Presentation templates");

    const activities = result.host.activity.list().filter((a) => a.extensionId === FIXTURE_NAME);
    expect(activities).toEqual([]);
  });

  it("surfaces the contributed section through serializeExtensions with a webModuleUrl", async () => {
    const root = await tempRoot("prc-settings-section-serialize-");
    const packageDir = await setupFixturePackage(root);

    const result = await bootstrapPrcExtensions({
      configDir: path.join(root, "config"),
      cwd: root,
      dataDir: path.join(root, "data"),
      bundledPackagePaths: [packageDir],
    });

    const serialized = serializeExtensions(result.host);
    const contributed = serialized.settings.filter((s) => s.extensionId === FIXTURE_NAME);
    expect(contributed).toHaveLength(1);
    expect(contributed[0]?.webModuleUrl).toMatch(/^\/api\/extensions\/.+\/assets\/.+/);
  });

  it("removes the contributed section when the extension is disabled", async () => {
    const root = await tempRoot("prc-settings-section-disabled-");
    const packageDir = await setupFixturePackage(root);
    const configDir = path.join(root, "config");
    await writePrcSettings(configDir, { disabledExtensions: [FIXTURE_NAME] });

    const result = await bootstrapPrcExtensions({
      configDir,
      cwd: root,
      dataDir: path.join(root, "data"),
      bundledPackagePaths: [packageDir],
    });

    expect(result.host.settings.list().filter((s) => s.extensionId === FIXTURE_NAME)).toEqual([]);
    expect(serializeExtensions(result.host).settings.filter((s) => s.extensionId === FIXTURE_NAME)).toEqual([]);
  });
});
