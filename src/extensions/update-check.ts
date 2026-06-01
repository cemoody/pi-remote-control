/**
 * Update detection — "what is the latest version of each source?".
 *
 * Network/process access is funnelled through an injectable {@link CommandOutputRunner}
 * (mirroring `PackageCommandRunner` in packages.ts) so unit tests are fully
 * deterministic and never touch the network. A checker-level timeout and a
 * small TTL cache keep page-load checks cheap and non-blocking.
 */
import { parsePackageSource } from "./packages.js";
import { computeUpdateStatus, type SourceKind, type UpdateStatusResult } from "./update-status.js";

export interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export interface CommandOutputRunner {
  (command: string, args: readonly string[], options: { readonly cwd?: string }): Promise<CommandResult>;
}

/** Descriptor for a single source we want to check. */
export interface SourceCheckEntry {
  readonly source: string;
  readonly installedVersion?: string;
  readonly installedSha?: string;
}

export interface SourceUpdate extends UpdateStatusResult {
  readonly source: string;
  readonly kind: SourceKind;
  readonly latestVersion?: string;
  readonly latestSha?: string;
}

export interface UpdateCheckCacheEntry {
  readonly at: number;
  readonly value: SourceUpdate;
}

export interface UpdateCheckCache {
  get(key: string): UpdateCheckCacheEntry | undefined;
  set(key: string, entry: UpdateCheckCacheEntry): void;
}

export interface CheckOptions {
  readonly runner?: CommandOutputRunner;
  readonly now?: () => number;
  readonly cache?: UpdateCheckCache;
  readonly force?: boolean;
  readonly ttlMs?: number;
  readonly concurrency?: number;
  readonly timeoutMs?: number;
  /** Working dir for spawned commands (e.g. the npm prefix). */
  readonly cwd?: string;
}

export const DEFAULT_TTL_MS = 10 * 60 * 1000;
export const DEFAULT_CONCURRENCY = 4;
export const DEFAULT_TIMEOUT_MS = 15_000;

/** Parse a "latest" version from either `npm view <pkg> version` or `npm outdated --json`. */
export function parseLatestVersionFromNpm(stdout: string, packageName?: string): string | undefined {
  const trimmed = stdout.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, { latest?: string; wanted?: string }>;
      const entry = (packageName && parsed[packageName]) || Object.values(parsed)[0];
      return entry?.latest ?? entry?.wanted;
    } catch {
      return undefined;
    }
  }
  // `npm view pkg version` prints a bare version, sometimes quoted.
  const firstLine = trimmed.split(/\r?\n/)[0]!.trim().replace(/^['"]|['"]$/g, "");
  return firstLine || undefined;
}

/** Parse the sha from `git ls-remote <url> <ref>` output. */
export function parseLsRemoteSha(stdout: string): string | undefined {
  const firstLine = stdout.trim().split(/\r?\n/)[0]?.trim();
  if (!firstLine) return undefined;
  const sha = firstLine.split(/\s+/)[0];
  return sha && /^[0-9a-f]{7,40}$/i.test(sha) ? sha : undefined;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Update check timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Check a single source. Never throws — failures map to an `error` status. */
export async function checkSourceUpdate(entry: SourceCheckEntry, options: CheckOptions = {}): Promise<SourceUpdate> {
  const now = options.now ?? Date.now;
  const ttl = options.ttlMs ?? DEFAULT_TTL_MS;
  const cache = options.cache;
  if (cache && !options.force) {
    const cached = cache.get(entry.source);
    if (cached && now() - cached.at < ttl) return cached.value;
  }
  const result = await computeSourceUpdate(entry, options);
  cache?.set(entry.source, { at: now(), value: result });
  return result;
}

async function computeSourceUpdate(entry: SourceCheckEntry, options: CheckOptions): Promise<SourceUpdate> {
  const parsed = parsePackageSource(entry.source);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const runner = options.runner;

  if (parsed.type === "local") {
    const status = computeUpdateStatus({ source: entry.source, kind: "local" });
    return { ...status, source: entry.source, kind: "local" };
  }

  if (!runner) {
    return errorUpdate(entry.source, parsed.type, "No command runner available.");
  }

  try {
    if (parsed.type === "npm") {
      const result = await withTimeout(
        runner("npm", ["view", parsed.packageName, "version"], { ...(options.cwd ? { cwd: options.cwd } : {}) }),
        timeoutMs,
      );
      if (result.exitCode !== 0) {
        return errorUpdate(entry.source, "npm", (result.stderr || `npm view exited with ${result.exitCode}`).trim());
      }
      const latestVersion = parseLatestVersionFromNpm(result.stdout, parsed.packageName);
      const status = computeUpdateStatus({
        source: entry.source,
        kind: "npm",
        ...(entry.installedVersion ? { installedVersion: entry.installedVersion } : {}),
        ...(latestVersion ? { latestVersion } : {}),
      });
      return { ...status, source: entry.source, kind: "npm", ...(latestVersion ? { latestVersion } : {}) };
    }
    // git
    const ref = parsed.ref ?? "HEAD";
    const result = await withTimeout(
      runner("git", ["ls-remote", parsed.url, ref], { ...(options.cwd ? { cwd: options.cwd } : {}) }),
      timeoutMs,
    );
    if (result.exitCode !== 0) {
      return errorUpdate(entry.source, "git", (result.stderr || `git ls-remote exited with ${result.exitCode}`).trim());
    }
    const latestSha = parseLsRemoteSha(result.stdout);
    const status = computeUpdateStatus({
      source: entry.source,
      kind: "git",
      ...(entry.installedSha ? { installedSha: entry.installedSha } : {}),
      ...(latestSha ? { latestSha } : {}),
    });
    return { ...status, source: entry.source, kind: "git", ...(latestSha ? { latestSha } : {}) };
  } catch (error) {
    return errorUpdate(entry.source, parsed.type, error instanceof Error ? error.message : String(error));
  }
}

function errorUpdate(source: string, kind: SourceKind, message: string): SourceUpdate {
  return { source, kind, state: "error", pinned: false, message };
}

/** Check many sources concurrently (bounded), isolating per-source failures. */
export async function checkAllSources(entries: readonly SourceCheckEntry[], options: CheckOptions = {}): Promise<SourceUpdate[]> {
  const unique = dedupeBySource(entries);
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  const results: SourceUpdate[] = new Array(unique.length);
  let cursor = 0;
  const workers: Promise<void>[] = [];
  const runWorker = async () => {
    while (cursor < unique.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await checkSourceUpdate(unique[index]!, options);
    }
  };
  for (let i = 0; i < Math.min(concurrency, unique.length); i += 1) workers.push(runWorker());
  await Promise.all(workers);
  return results;
}

function dedupeBySource(entries: readonly SourceCheckEntry[]): SourceCheckEntry[] {
  const seen = new Map<string, SourceCheckEntry>();
  for (const entry of entries) if (!seen.has(entry.source)) seen.set(entry.source, entry);
  return [...seen.values()];
}

/** A trivial in-memory cache implementation. */
export function createUpdateCheckCache(): UpdateCheckCache {
  const map = new Map<string, UpdateCheckCacheEntry>();
  return {
    get: (key) => map.get(key),
    set: (key, entry) => { map.set(key, entry); },
  };
}

/** Default runner that captures stdout/stderr via child_process. */
export const defaultCommandOutputRunner: CommandOutputRunner = async (command, args, options) => {
  const { spawn } = await import("node:child_process");
  return await new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(command, [...args], { ...(options.cwd ? { cwd: options.cwd } : {}), stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr?.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout, stderr, exitCode: code ?? 0 }));
  });
};
