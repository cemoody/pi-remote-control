import type { BootstrapPrcExtensionsOptions } from "./bootstrap.js";
import { bootstrapPrcExtensions } from "./bootstrap.js";
import type { PrcExtensionHost } from "./registry.js";

export interface PrcExtensionReloadResult {
  readonly applied: boolean;
  readonly diagnostics: readonly { readonly extensionId: string; readonly level: "error" | "warning"; readonly message: string }[];
}

export class PrcExtensionRuntime {
  private constructor(
    private readonly options: BootstrapPrcExtensionsOptions,
    private activeHost: PrcExtensionHost,
  ) {}

  static async create(options: BootstrapPrcExtensionsOptions): Promise<PrcExtensionRuntime> {
    const boot = await bootstrapPrcExtensions(options);
    return new PrcExtensionRuntime(options, boot.host);
  }

  get current(): PrcExtensionHost {
    return this.activeHost;
  }

  get configDir(): string {
    return this.options.configDir;
  }

  get cwd(): string {
    return this.options.cwd;
  }

  async reload(): Promise<PrcExtensionReloadResult> {
    const boot = await bootstrapPrcExtensions(this.options);
    const diagnostics = boot.host.diagnostics;
    if (diagnostics.some((diagnostic) => diagnostic.level === "error")) {
      await boot.host.dispose();
      return { applied: false, diagnostics };
    }
    const previous = this.activeHost;
    this.activeHost = boot.host;
    await previous.dispose();
    return { applied: true, diagnostics };
  }

  async dispose(): Promise<void> {
    await this.activeHost.dispose();
  }
}

export async function createPrcExtensionRuntime(options: BootstrapPrcExtensionsOptions): Promise<PrcExtensionRuntime> {
  return PrcExtensionRuntime.create(options);
}
