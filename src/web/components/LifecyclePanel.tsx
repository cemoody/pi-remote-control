export interface SessionDetails {
  readonly sessionFile: string;
  readonly sessionId: string;
  readonly sessionName?: string;
  readonly userMessages: number;
  readonly assistantMessages: number;
  readonly toolCalls: number;
  readonly toolResults: number;
  readonly tokens: string;
  readonly cost: string;
  readonly contextPercent?: number;
}

export interface RetryState { readonly active: boolean; readonly attempt?: number; readonly maxAttempts?: number; readonly delayMs?: number; readonly error?: string; }
export interface CompactionState { readonly active: boolean; readonly reason?: string; readonly summary?: string; readonly error?: string; }

export interface LifecyclePanelProps {
  readonly details: SessionDetails;
  readonly compaction: CompactionState;
  readonly retry: RetryState;
  readonly onCompact: (instructions?: string) => void;
  readonly onAbortRetry: () => void;
  readonly onSetAutoRetry: (enabled: boolean) => void;
  readonly onCopyLastAssistant: () => void;
  readonly onExportHtml: () => void;
  readonly onExportJsonl: () => void;
}

export function LifecyclePanel(props: LifecyclePanelProps) {
  return (
    <section aria-label="Lifecycle controls">
      <h2>Session details</h2>
      <dl>
        <dt>File</dt><dd>{props.details.sessionFile}</dd>
        <dt>ID</dt><dd>{props.details.sessionId}</dd>
        <dt>Name</dt><dd>{props.details.sessionName ?? "unnamed"}</dd>
        <dt>Messages</dt><dd>{props.details.userMessages} user / {props.details.assistantMessages} assistant</dd>
        <dt>Tools</dt><dd>{props.details.toolCalls} calls / {props.details.toolResults} results</dd>
        <dt>Tokens</dt><dd>{props.details.tokens}</dd>
        <dt>Cost</dt><dd>{props.details.cost}</dd>
        <dt>Context</dt><dd>{props.details.contextPercent ?? 0}%</dd>
      </dl>

      <section aria-label="Compaction">
        <h3>Compaction</h3>
        <progress value={props.details.contextPercent ?? 0} max={100}>{props.details.contextPercent ?? 0}%</progress>
        {props.compaction.active ? <p>Compacting: {props.compaction.reason}</p> : null}
        {props.compaction.summary ? <p>{props.compaction.summary}</p> : null}
        {props.compaction.error ? <p role="alert">{props.compaction.error}</p> : null}
        <button type="button" onClick={() => props.onCompact()}>Compact</button>
        <button type="button" onClick={() => props.onCompact("focus on code changes")}>Compact with instructions</button>
      </section>

      <section aria-label="Retry">
        <h3>Retry</h3>
        {props.retry.active ? <p>Retry {props.retry.attempt}/{props.retry.maxAttempts} in {props.retry.delayMs}ms</p> : <p>Retry idle</p>}
        {props.retry.error ? <p role="alert">{props.retry.error}</p> : null}
        <button type="button" onClick={props.onAbortRetry}>Abort retry</button>
        <button type="button" onClick={() => props.onSetAutoRetry(true)}>Enable auto-retry</button>
        <button type="button" onClick={() => props.onSetAutoRetry(false)}>Disable auto-retry</button>
      </section>

      <section aria-label="Export and copy">
        <button type="button" onClick={props.onCopyLastAssistant}>Copy last assistant</button>
        <button type="button" onClick={props.onExportHtml}>Export HTML</button>
        <button type="button" onClick={props.onExportJsonl}>Export JSONL</button>
      </section>
    </section>
  );
}
