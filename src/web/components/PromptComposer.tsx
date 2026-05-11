import { useEffect, useMemo, useState } from "react";
import "./prompt-composer.css";

export interface ComposerAttachment {
  readonly id: string;
  readonly name: string;
  readonly type: "image" | "file";
  readonly previewUrl?: string;
}

export interface PromptComposerProps {
  readonly sessionId: string;
  readonly isStreaming: boolean;
  readonly steeringQueue: readonly string[];
  readonly followUpQueue: readonly string[];
  readonly fileSuggestions: readonly string[];
  readonly commandSuggestions: readonly string[];
  readonly onPrompt: (text: string, attachments: readonly ComposerAttachment[]) => void | Promise<void>;
  readonly onSteer: (text: string) => void | Promise<void>;
  readonly onFollowUp: (text: string) => void | Promise<void>;
  readonly onAbort: () => void | Promise<void>;
  readonly onBash: (command: string, includeInContext: boolean) => void | Promise<void>;
  readonly onAbortBash: () => void | Promise<void>;
}

export function PromptComposer(props: PromptComposerProps) {
  const storageKey = `draft:${props.sessionId}`;
  const [draft, setDraft] = useState(() => storageGet(storageKey) ?? "");
  const [history, setHistory] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [largeEditorOpen, setLargeEditorOpen] = useState(false);

  useEffect(() => {
    setDraft(storageGet(storageKey) ?? "");
  }, [storageKey]);

  useEffect(() => {
    storageSet(storageKey, draft);
  }, [draft, storageKey]);

  const mode = draft.startsWith("!!") ? "hidden-bash" : draft.startsWith("!") ? "bash" : "prompt";
  const activeToken = draft.split(/\s/).at(-1) ?? "";
  const fileMatches = activeToken.startsWith("@")
    ? props.fileSuggestions.filter((file) => file.toLowerCase().includes(activeToken.slice(1).toLowerCase()))
    : [];
  const commandMatches = draft.startsWith("/")
    ? props.commandSuggestions.filter((command) => command.toLowerCase().includes(draft.slice(1).toLowerCase()))
    : [];

  const queueSummary = useMemo(() => [
    ...props.steeringQueue.map((item) => `Steer: ${item}`),
    ...props.followUpQueue.map((item) => `Follow-up: ${item}`),
  ], [props.followUpQueue, props.steeringQueue]);

  async function submit(kind?: "steer" | "follow-up") {
    const text = draft.trim();
    if (!text) return;
    setHistory((current) => [text, ...current]);
    setDraft("");
    if (mode === "bash" || mode === "hidden-bash") {
      await props.onBash(mode === "hidden-bash" ? text.slice(2) : text.slice(1), mode === "bash");
      return;
    }
    if (kind === "steer") await props.onSteer(text);
    else if (kind === "follow-up") await props.onFollowUp(text);
    else if (props.isStreaming) await props.onSteer(text);
    else await props.onPrompt(text, attachments);
    setAttachments([]);
  }

  function completeFile(file: string) {
    setDraft((current) => current.replace(/@\S*$/, `@${file}`));
  }

  function completeCommand(command: string) {
    setDraft(`/${command}`);
  }

  function pathComplete() {
    if (!activeToken) return;
    const needle = activeToken.replace(/^@/, "").toLowerCase();
    const match = props.fileSuggestions.find((file) => file.toLowerCase().startsWith(needle));
    if (match) {
      setDraft((current) => current.replace(/\S*$/, `@${match}`));
    }
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    setAttachments((current) => [
      ...current,
      ...Array.from(files).map((file): ComposerAttachment => ({
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type.startsWith("image/") ? "image" : "file",
        ...(file.type.startsWith("image/") ? { previewUrl: URL.createObjectURL(file) } : {}),
      })),
    ]);
  }

  return (
    <section className={`prompt-composer ${mode}`} aria-label="Prompt composer">
      <div className="composer-toolbar">
        <span>{mode}</span>
        {props.isStreaming ? <span>Agent is working</span> : null}
        <button type="button" onClick={() => setLargeEditorOpen(true)}>Large editor</button>
        <button type="button" onClick={() => void props.onAbort()}>Abort</button>
        <button type="button" onClick={() => void props.onAbortBash()}>Abort bash</button>
      </div>

      <textarea
        aria-label="Prompt draft"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Tab") {
            event.preventDefault();
            pathComplete();
          }
          if (event.key === "ArrowUp" && event.altKey && history[0]) {
            event.preventDefault();
            setDraft(history[0]);
          }
        }}
        onPaste={(event) => addFiles(event.clipboardData.files)}
        onDrop={(event) => {
          event.preventDefault();
          addFiles(event.dataTransfer.files);
        }}
        onDragOver={(event) => event.preventDefault()}
      />

      {fileMatches.length ? <SuggestionList label="File suggestions" items={fileMatches} onPick={completeFile} /> : null}
      {commandMatches.length ? <SuggestionList label="Command suggestions" items={commandMatches} onPick={completeCommand} /> : null}

      <input aria-label="Attach files" type="file" multiple onChange={(event) => addFiles(event.target.files)} />
      {attachments.length ? (
        <ul className="attachments">
          {attachments.map((attachment) => (
            <li key={attachment.id}>
              {attachment.previewUrl ? <img src={attachment.previewUrl} alt={attachment.name} /> : null}
              <span>{attachment.name}</span>
              <button type="button" onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}>Remove</button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="composer-actions">
        <button type="button" onClick={() => void submit()}>Send</button>
        <button type="button" onClick={() => void submit("steer")}>Steer</button>
        <button type="button" onClick={() => void submit("follow-up")}>Follow-up</button>
      </div>

      {queueSummary.length ? <ul aria-label="Message queues">{queueSummary.map((item, index) => <li key={index}>{item}</li>)}</ul> : null}

      {largeEditorOpen ? (
        <div role="dialog" aria-label="Large composer">
          <textarea aria-label="Large prompt draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
          <button type="button" onClick={() => setLargeEditorOpen(false)}>Done</button>
        </div>
      ) : null}
    </section>
  );
}

function SuggestionList({ label, items, onPick }: { readonly label: string; readonly items: readonly string[]; readonly onPick: (item: string) => void }) {
  return (
    <ul aria-label={label} className="suggestions">
      {items.map((item) => <li key={item}><button type="button" onClick={() => onPick(item)}>{item}</button></li>)}
    </ul>
  );
}

function storageGet(key: string): string | null {
  try {
    if (typeof localStorage === "undefined" || typeof localStorage.getItem !== "function") return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    if (typeof localStorage === "undefined" || typeof localStorage.setItem !== "function") return;
    localStorage.setItem(key, value);
  } catch {
    // Ignore unavailable storage. Draft persistence is best-effort.
  }
}
