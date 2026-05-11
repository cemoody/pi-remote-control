import type { SlashCommandDefinition } from "../commands/slash-command-registry.js";

export interface CommandHelpDialogProps {
  readonly open: boolean;
  readonly commands: readonly SlashCommandDefinition[];
  readonly onClose: () => void;
}

export function CommandHelpDialog({ open, commands, onClose }: CommandHelpDialogProps) {
  if (!open) return null;

  return (
    <div className="command-help-backdrop" role="presentation" onClick={onClose}>
      <div
        className="command-help-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Slash command help"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h2>Slash commands</h2>
          <button type="button" onClick={onClose} aria-label="Close slash command help">×</button>
        </header>
        <ul aria-label="Available slash commands">
          {commands.map((command) => (
            <li key={command.name}>
              <code>/{command.name}{command.argumentHint ? ` ${command.argumentHint}` : ""}</code>
              <span>{command.description}</span>
              {!command.implemented ? <small>planned</small> : null}
              {command.aliases?.length ? <small>aliases: {command.aliases.map((alias) => `/${alias}`).join(", ")}</small> : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
