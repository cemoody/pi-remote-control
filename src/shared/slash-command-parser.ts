export interface ParsedSlashCommand {
  readonly name: string;
  readonly argv: string;
  readonly original: string;
}

export function parseSlashCommand(text: string): ParsedSlashCommand | undefined {
  if (!text.startsWith("/")) return undefined;
  const rest = text.slice(1);
  if (!rest || /^\s/.test(rest)) return undefined;
  const spaceIndex = rest.search(/\s/);
  const name = spaceIndex === -1 ? rest : rest.slice(0, spaceIndex);
  if (!name) return undefined;
  return {
    name,
    argv: spaceIndex === -1 ? "" : rest.slice(spaceIndex + 1),
    original: text,
  };
}
