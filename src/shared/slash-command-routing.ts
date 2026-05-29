export interface BuiltinSlashCommandInfo {
  readonly name: string;
}

export interface PrcExtensionSlashCommandInfo {
  readonly slashName?: string;
}

export type PiDynamicCommandSource = "extension" | "prompt" | "skill";

export interface PiDynamicCommandInfo {
  readonly name: string;
  readonly description?: string;
  readonly source: PiDynamicCommandSource;
  readonly location?: "user" | "project" | "path";
  readonly path?: string;
}

export type SlashCommandRoute<TBuiltin extends BuiltinSlashCommandInfo = BuiltinSlashCommandInfo, TPrc extends PrcExtensionSlashCommandInfo = PrcExtensionSlashCommandInfo> =
  | { readonly kind: "builtin"; readonly command: TBuiltin }
  | { readonly kind: "prc-extension"; readonly command: TPrc }
  | { readonly kind: "pi-dynamic"; readonly command: PiDynamicCommandInfo }
  | { readonly kind: "unknown" };

const SAFE_DYNAMIC_COMMAND_NAME = /^[A-Za-z0-9][A-Za-z0-9:_-]*$/;

export function isSafePiDynamicCommandName(name: string): boolean {
  return SAFE_DYNAMIC_COMMAND_NAME.test(name);
}

export function sanitizePiDynamicCommands(commands: readonly PiDynamicCommandInfo[]): PiDynamicCommandInfo[] {
  const seen = new Set<string>();
  const sanitized: PiDynamicCommandInfo[] = [];
  for (const command of commands) {
    if (!isSafePiDynamicCommandName(command.name)) continue;
    if (seen.has(command.name)) continue;
    seen.add(command.name);
    sanitized.push(command);
  }
  return sanitized;
}

export function resolveSlashCommandRoute<TBuiltin extends BuiltinSlashCommandInfo, TPrc extends PrcExtensionSlashCommandInfo>(input: {
  readonly name: string;
  readonly builtins: readonly TBuiltin[];
  readonly prcExtensionCommands: readonly TPrc[];
  readonly piDynamicCommands: readonly PiDynamicCommandInfo[];
}): SlashCommandRoute<TBuiltin, TPrc> {
  const builtin = input.builtins.find((command) => command.name === input.name);
  if (builtin) return { kind: "builtin", command: builtin };

  const prcExtension = input.prcExtensionCommands.find((command) => command.slashName === input.name);
  if (prcExtension) return { kind: "prc-extension", command: prcExtension };

  const piDynamic = sanitizePiDynamicCommands(input.piDynamicCommands).find((command) => command.name === input.name);
  if (piDynamic) return { kind: "pi-dynamic", command: piDynamic };

  return { kind: "unknown" };
}
