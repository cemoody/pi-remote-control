import { useEffect, useState } from "react";
import "./shortcut-help.css";

interface Shortcut {
  readonly keys: string;
  readonly label: string;
}

const SHORTCUTS: readonly Shortcut[] = [
  { keys: "Enter", label: "Send (or steer while streaming)" },
  { keys: "Shift+Enter", label: "Newline" },
  { keys: "Cmd/Ctrl+Enter", label: "Send" },
  { keys: "Alt+Enter", label: "Queue follow-up" },
  { keys: "Esc", label: "Abort while streaming" },
  { keys: "Alt+↑", label: "Recall prompt history" },
  { keys: "Tab", label: "Path completion after @" },
  { keys: "?", label: "Open this dialog" },
];

/** One loaded extension's identity (version and/or git SHA). */
export interface ExtensionVersionInfo {
  readonly id: string;
  readonly name?: string;
  readonly version?: string;
  readonly sha?: string;
}

export interface BackendIdentity {
  readonly gitSha?: string;
  /** Version of the running pi binary (e.g. "0.78.0"). */
  readonly piVersion?: string;
  /** Versions/SHAs of the loaded extensions. */
  readonly extensions?: readonly ExtensionVersionInfo[];
}

export interface ShortcutHelpProps {
  /**
   * Backend identity already loaded by the parent dashboard. When present we
   * use it synchronously instead of opening another `/api/health` request from
   * the help dialog; that request can sit behind the browser's per-origin SSE
   * connection pool when many pi-crust tabs are open.
   */
  readonly backendInfo?: BackendIdentity;
  /**
   * Source of the backend's git SHA, pi version, and extension versions.
   * Default impl hits `/api/health`; tests inject a mock.
   */
  readonly fetchBackendInfo?: () => Promise<BackendIdentity>;
}

/** Compact "version (sha)" identifier for one extension row. */
function extensionVersionLabel(ext: ExtensionVersionInfo): string {
  const hasVersion = typeof ext.version === "string" && ext.version.trim() && ext.version !== "0.0.0";
  if (hasVersion && ext.sha) return `${ext.version} (${ext.sha})`;
  if (hasVersion) return ext.version!.trim();
  if (ext.sha) return ext.sha;
  return "unknown";
}

function normalizeGitSha(value: string | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readFrontendGitSha(): string | null {
  // Vite's `define` rewrites this identifier at build time into a string
  // literal. In production (`vite build`) we want to surface that SHA — it's
  // the actual commit the bundle was compiled from and can legitimately
  // differ from the backend's git HEAD if the two are deployed separately.
  //
  // In DEV (`vite serve`), the define is intentionally omitted so this
  // returns null, and the caller falls back to the backend's live gitSha.
  // Why: the dev bundle is HMR-patched in place from the same checkout that
  // serves the api, so any baked-in SHA is just a startup-time snapshot of
  // the same value the backend reports live — and was the source of
  // 'I merged a PR but the help dialog still shows the old SHA' confusion.
  //
  // Test hook: globalThis.__PI_CRUST_GIT_SHA__ stands in for the bake.
  type ShaHolder = { readonly __PI_CRUST_GIT_SHA__?: unknown };
  const fromGlobal = (globalThis as unknown as ShaHolder).__PI_CRUST_GIT_SHA__;
  if (typeof fromGlobal === "string" && fromGlobal.trim()) return fromGlobal;
  try {
    // eslint-disable-next-line no-new-func
    const baked = (new Function("return typeof __PI_CRUST_GIT_SHA__ === 'string' ? __PI_CRUST_GIT_SHA__ : undefined"))();
    if (typeof baked === "string" && baked.trim()) return baked;
  } catch {
    // ignore
  }
  return null;
}

async function defaultFetchBackendInfo(): Promise<BackendIdentity> {
  const response = await fetch("/api/health");
  if (!response.ok) throw new Error(`/api/health -> ${response.status}`);
  const body = await response.json() as { gitSha?: string; piVersion?: string; extensionPackages?: readonly ExtensionVersionInfo[] };
  return {
    ...(body.gitSha === undefined ? {} : { gitSha: body.gitSha }),
    ...(body.piVersion === undefined ? {} : { piVersion: body.piVersion }),
    ...(body.extensionPackages === undefined ? {} : { extensions: body.extensionPackages }),
  };
}

export function ShortcutHelp(props: ShortcutHelpProps = {}) {
  const fetchBackendInfo = props.fetchBackendInfo ?? defaultFetchBackendInfo;
  const providedBackendSha = normalizeGitSha(props.backendInfo?.gitSha);
  const [open, setOpen] = useState(false);
  const [backendSha, setBackendSha] = useState<string>(() => providedBackendSha ?? "…");
  const [piVersion, setPiVersion] = useState<string | null>(() => normalizeGitSha(props.backendInfo?.piVersion));
  const [extensions, setExtensions] = useState<readonly ExtensionVersionInfo[] | null>(() => props.backendInfo?.extensions ?? null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.key === "Escape" && open) {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "?") return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      setOpen(true);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (providedBackendSha) setBackendSha(providedBackendSha);
  }, [providedBackendSha]);

  useEffect(() => {
    const v = normalizeGitSha(props.backendInfo?.piVersion);
    if (v) setPiVersion(v);
    if (props.backendInfo?.extensions) setExtensions(props.backendInfo.extensions);
  }, [props.backendInfo?.piVersion, props.backendInfo?.extensions]);

  // Lazily fetch the backend SHA the first time the dialog opens, but only if
  // the parent dashboard has not already loaded it. We don't want to hit
  // /api/health on every page load just for help-dialog text, and we also
  // don't want the help modal to start a request that can queue behind six
  // long-lived EventSource connections in the browser pool.
  useEffect(() => {
    if (providedBackendSha) return;
    if (!open) return;
    if (backendSha !== "…") return;
    let cancelled = false;
    void fetchBackendInfo()
      .then((info) => {
        if (cancelled) return;
        setBackendSha(normalizeGitSha(info.gitSha) ?? "unknown");
        setPiVersion(normalizeGitSha(info.piVersion) ?? "unknown");
        if (info.extensions) setExtensions(info.extensions);
      })
      .catch(() => {
        if (!cancelled) {
          setBackendSha("unknown");
          setPiVersion("unknown");
        }
      });
    return () => { cancelled = true; };
  }, [open, fetchBackendInfo, backendSha, providedBackendSha]);

  if (!open) return null;

  return (
    <div
      className="shortcut-help-backdrop"
      role="presentation"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="shortcut-help"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h2>Keyboard shortcuts</h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close shortcuts">×</button>
        </header>
        <dl>
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.keys}>
              <dt><kbd>{shortcut.keys}</kbd></dt>
              <dd>{shortcut.label}</dd>
            </div>
          ))}
        </dl>
        <footer className="shortcut-help-footer" aria-label="Build versions">
          <dl className="shortcut-help-shas">
            <div>
              <dt>frontend</dt>
              <dd><code>{(readFrontendGitSha() ?? (backendSha === "…" ? "fetching…" : backendSha))}</code></dd>
            </div>
            <div>
              <dt>backend</dt>
              <dd><code>{backendSha === "…" ? "fetching…" : backendSha}</code></dd>
            </div>
          </dl>
          <dl className="shortcut-help-versions" aria-label="Runtime versions">
            <div>
              <dt>pi</dt>
              <dd><code>{piVersion ?? (open ? "fetching…" : "unknown")}</code></dd>
            </div>
            {(extensions ?? []).map((ext) => (
              <div key={ext.id}>
                <dt>{ext.name ?? ext.id}</dt>
                <dd><code>{extensionVersionLabel(ext)}</code></dd>
              </div>
            ))}
          </dl>
        </footer>
      </div>
    </div>
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}
