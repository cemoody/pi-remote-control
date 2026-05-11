import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./message-timeline.css";

export interface TimelineImage {
  readonly id: string;
  readonly src: string;
  readonly alt?: string;
}

export interface TimelineToolDetails {
  readonly id: string;
  readonly name: string;
  readonly args: Record<string, unknown>;
  readonly status: "running" | "success" | "error";
  readonly output: string;
}

export interface TimelineMessage {
  readonly id: string;
  readonly role: "user" | "assistant" | "custom" | "summary" | "tool";
  readonly text: string;
  readonly thinking?: string;
  readonly images?: readonly TimelineImage[];
  readonly provider?: string;
  readonly model?: string;
  readonly stopReason?: string;
  readonly tokenUsage?: string;
  readonly cost?: string;
  readonly error?: string;
  readonly aborted?: boolean;
  readonly customLabel?: string;
  readonly summaryKind?: "branch" | "compaction";
  readonly tool?: TimelineToolDetails;
}

export interface MessageTimelineProps {
  readonly messages: readonly TimelineMessage[];
  readonly hideThinking?: boolean;
  readonly autoScroll?: boolean;
  readonly streaming?: boolean;
}

export function MessageTimeline({ messages, hideThinking = false, autoScroll = true, streaming = false }: MessageTimelineProps) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (autoScroll && typeof endRef.current?.scrollIntoView === "function") {
      endRef.current.scrollIntoView({ block: "end" });
    }
  }, [autoScroll, messages.length]);

  return (
    <section className="message-timeline" aria-label="Message timeline">
      <div className="message-timeline-inner">
        {messages.map((message) => {
          if (message.role === "tool" && message.tool) {
            return <ToolCard key={message.id} tool={message.tool} />;
          }
          const showLabel = message.role === "custom" || message.role === "summary";
          return (
            <article key={message.id} className={`message-card ${message.role}`} aria-label={`${message.role} message`}>
              <header className={`message-header ${showLabel ? "" : "is-hidden"}`}>
                <strong>{messageTitle(message)}</strong>
                {message.aborted ? <span className="badge warning">aborted</span> : null}
                {message.error ? <span className="badge error">error</span> : null}
              </header>

              {message.images?.length ? (
                <div className="message-images">
                  {message.images.map((image) => <img key={image.id} src={image.src} alt={image.alt ?? "attachment"} />)}
                </div>
              ) : null}

              {message.thinking && !hideThinking ? (
                <details className="thinking-block">
                  <summary>Thinking</summary>
                  <pre>{message.thinking}</pre>
                </details>
              ) : null}

              <div className="message-bubble">
                <MarkdownLite text={message.text} />
              </div>

              {message.error ? <p role="alert" className="message-error">{message.error}</p> : null}

              <footer className="message-footer is-hidden">
                {message.provider ? <span>{message.provider}</span> : null}
                {message.model ? <span>{message.model}</span> : null}
                {message.stopReason ? <span>{message.stopReason}</span> : null}
                {message.tokenUsage ? <span>{message.tokenUsage}</span> : null}
                {message.cost ? <span>{message.cost}</span> : null}
                <button type="button" onClick={() => void copyText(message.text)}>Copy</button>
              </footer>
            </article>
          );
        })}
        {streaming ? <TypingDots /> : null}
        <div ref={endRef} data-testid="timeline-end" />
      </div>
    </section>
  );
}

function TypingDots() {
  return (
    <div className="typing-dots" role="status" aria-label="Assistant is responding">
      <span /><span /><span />
    </div>
  );
}

function ToolCard({ tool }: { readonly tool: TimelineToolDetails }) {
  return (
    <details className={`tool-card ${tool.status}`} aria-label={`tool ${tool.name}`}>
      <summary>
        <span className="tool-icon" aria-hidden="true">{toolIcon(tool.status)}</span>
        <span className="tool-line">
          <strong>{verbForName(tool.name)}</strong> <code>{tool.name}</code>
          {summarizeArgs(tool.args) ? <> · <span className="tool-args">{summarizeArgs(tool.args)}</span></> : null}
        </span>
        <span className="tool-status-text">{statusLabel(tool.status)}</span>
      </summary>
      {tool.output ? <pre>{tool.output}</pre> : null}
    </details>
  );
}

function toolIcon(status: TimelineToolDetails["status"]): string {
  if (status === "running") return "•";
  if (status === "error") return "✕";
  return "✓";
}

function statusLabel(status: TimelineToolDetails["status"]): string {
  if (status === "running") return "running…";
  if (status === "error") return "failed";
  return "done";
}

function verbForName(name: string): string {
  if (name === "bash") return "Ran";
  if (name === "read") return "Read";
  if (name === "edit") return "Edited";
  if (name === "write") return "Wrote";
  if (name === "grep") return "Searched";
  if (name === "find") return "Found";
  if (name === "ls") return "Listed";
  return "Ran";
}

function summarizeArgs(args: Record<string, unknown>): string {
  const preferred = ["command", "path", "file", "pattern", "query"];
  for (const key of preferred) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) return truncate(value, 80);
  }
  return "";
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function messageTitle(message: TimelineMessage): string {
  if (message.role === "custom") return message.customLabel ?? "Extension";
  if (message.role === "summary") return message.summaryKind === "branch" ? "Branch summary" : "Compaction summary";
  return message.role === "assistant" ? "Assistant" : "You";
}

function MarkdownLite({ text }: { readonly text: string }) {
  return (
    <div className="markdown-lite">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre(props) {
            const child = Array.isArray(props.children) ? props.children[0] : props.children;
            const inner = (child && typeof child === "object" && "props" in child)
              ? (child as { props: { className?: string; children?: React.ReactNode } }).props
              : { className: undefined, children: childrenToString(props.children) };
            const value = childrenToString(inner.children);
            return (
              <div className="code-block">
                <button type="button" onClick={() => void copyText(value)}>Copy code</button>
                <pre><code className={inner.className}>{value}</code></pre>
              </div>
            );
          },
          code(props) {
            const { className, children } = props as { className?: string; children?: React.ReactNode };
            return <code className={className}>{children}</code>;
          },
          a(props) {
            const { href, children } = props as { href?: string; children?: React.ReactNode };
            return <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>;
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function childrenToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(childrenToString).join("");
  return String(value);
}

async function copyText(text: string): Promise<void> {
  await navigator.clipboard?.writeText(text);
}
