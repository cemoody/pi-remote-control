/**
 * Pure version/status logic for the extension-update feature.
 *
 * Given what is *installed* and what is *latest* for a source (npm / git /
 * local), decide whether an update is available. Deliberately I/O-free so it is
 * trivially unit-testable and never throws for malformed input — bad data maps
 * to an `unknown` status, never a crash.
 */
import { parsePackageSource } from "./packages.js";

export type UpdateState =
  | "up-to-date"
  | "update-available"
  | "pinned"
  | "local"
  | "unknown"
  | "error";

export type SourceKind = "npm" | "git" | "local";

export interface UpdateStatusInput {
  /** Original user-supplied source, e.g. "npm:pkg@1.2.3", "git:url@ref", or a path. */
  readonly source: string;
  readonly kind: SourceKind;
  readonly installedVersion?: string;
  readonly installedSha?: string;
  readonly latestVersion?: string;
  readonly latestSha?: string;
}

export interface UpdateStatusResult {
  readonly state: UpdateState;
  /** Whether the source was explicitly pinned to a version/ref/sha. */
  readonly pinned: boolean;
  /** Display string for the installed identity (version or short sha). */
  readonly installed?: string;
  /** Display string for the latest identity (version or short sha). */
  readonly latest?: string;
  /** Human-readable explanation, primarily for `error`/`unknown`. */
  readonly message?: string;
}

interface Semver {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: readonly (string | number)[];
}

/** Parse a semver string. Returns null for anything non-conforming. */
export function parseSemver(input: string | undefined): Semver | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim().replace(/^v/i, "");
  // <major>.<minor>.<patch>[-prerelease][+build]
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(trimmed);
  if (!match) return null;
  const [, major, minor, patch, pre] = match;
  // Leading zeros in numeric identifiers are invalid semver.
  if (/^0\d/.test(major!) || /^0\d/.test(minor!) || /^0\d/.test(patch!)) return null;
  const prerelease = pre
    ? pre.split(".").map((id) => (/^\d+$/.test(id) ? Number(id) : id))
    : [];
  return { major: Number(major), minor: Number(minor), patch: Number(patch), prerelease };
}

/**
 * Compare two semver strings. Returns -1, 0, or 1 (a<b, a==b, a>b).
 * Throws RangeError if either side is not valid semver — callers that want
 * graceful degradation should use {@link computeUpdateStatus}.
 */
export function compareVersions(a: string, b: string): number {
  const left = parseSemver(a);
  const right = parseSemver(b);
  if (!left) throw new RangeError(`Invalid semver: ${a}`);
  if (!right) throw new RangeError(`Invalid semver: ${b}`);
  return compareSemver(left, right);
}

function compareSemver(a: Semver, b: Semver): number {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  // A version WITH a prerelease has lower precedence than one without.
  const aHas = a.prerelease.length > 0;
  const bHas = b.prerelease.length > 0;
  if (aHas && !bHas) return -1;
  if (!aHas && bHas) return 1;
  if (!aHas && !bHas) return 0;
  return comparePrerelease(a.prerelease, b.prerelease);
}

function comparePrerelease(a: readonly (string | number)[], b: readonly (string | number)[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    if (i >= a.length) return -1; // shorter set of identifiers has lower precedence
    if (i >= b.length) return 1;
    const x = a[i]!;
    const y = b[i]!;
    const xNum = typeof x === "number";
    const yNum = typeof y === "number";
    if (xNum && yNum) {
      if (x !== y) return x < y ? -1 : 1;
    } else if (xNum !== yNum) {
      // numeric identifiers always have lower precedence than alphanumeric.
      return xNum ? -1 : 1;
    } else if (x !== y) {
      return (x as string) < (y as string) ? -1 : 1;
    }
  }
  return 0;
}

/** Whether two git shas refer to the same commit, tolerating prefix lengths. */
export function shaMatches(a: string | undefined, b: string | undefined): boolean {
  if (!isLikelySha(a) || !isLikelySha(b)) return false;
  const x = a!.toLowerCase();
  const y = b!.toLowerCase();
  const min = Math.min(x.length, y.length);
  return x.slice(0, min) === y.slice(0, min);
}

function isLikelySha(value: string | undefined): value is string {
  return typeof value === "string" && /^[0-9a-f]{7,40}$/i.test(value.trim());
}

/**
 * Decide whether a source was *pinned* — i.e. the user explicitly asked for a
 * specific immutable version/ref/sha. Pinned sources should not nag for
 * updates because moving them would violate the user's intent.
 */
export function isPinned(source: string): boolean {
  const parsed = parsePackageSource(source);
  if (parsed.type === "local") return false;
  if (parsed.type === "npm") {
    const version = npmVersionSpecifier(parsed.spec);
    return isExactVersion(version);
  }
  // git
  const ref = parsed.ref;
  if (!ref) return false;
  if (isLikelySha(ref)) return true;
  // tag that looks like a version (v1.2.3 / 1.2.3)
  return parseSemver(ref) !== null;
}

function npmVersionSpecifier(spec: string): string | undefined {
  // spec may be "@scope/name@1.2.3" or "name@1.2.3" or "name".
  const withoutScope = spec.startsWith("@") ? spec.slice(1) : spec;
  const at = withoutScope.indexOf("@");
  if (at === -1) return undefined;
  return withoutScope.slice(at + 1);
}

function isExactVersion(version: string | undefined): boolean {
  if (!version) return false;
  if (version === "latest" || version === "next") return false;
  // Range operators / wildcards / unions mean "not pinned".
  if (/[\^~><*|\sx]/i.test(version)) return false;
  return parseSemver(version) !== null;
}

/** The core decision function. Never throws. */
export function computeUpdateStatus(input: UpdateStatusInput): UpdateStatusResult {
  if (input.kind === "local") {
    return { state: "local", pinned: false };
  }
  const pinned = safeIsPinned(input.source);
  if (input.kind === "npm") {
    const installed = input.installedVersion;
    const latest = input.latestVersion;
    const base = { pinned, ...(installed ? { installed } : {}), ...(latest ? { latest } : {}) };
    if (pinned) return { state: "pinned", ...base };
    if (!installed || !latest) {
      return { state: "unknown", ...base, message: "Missing version information." };
    }
    let cmp: number;
    try {
      cmp = compareVersions(installed, latest);
    } catch {
      return { state: "unknown", ...base, message: "Unparseable version." };
    }
    return { state: cmp < 0 ? "update-available" : "up-to-date", ...base };
  }
  // git
  const installedSha = input.installedSha;
  const latestSha = input.latestSha;
  const shortInstalled = installedSha ? installedSha.slice(0, 12) : undefined;
  const shortLatest = latestSha ? latestSha.slice(0, 12) : undefined;
  const base = { pinned, ...(shortInstalled ? { installed: shortInstalled } : {}), ...(shortLatest ? { latest: shortLatest } : {}) };
  if (pinned) return { state: "pinned", ...base };
  if (!isLikelySha(installedSha) || !isLikelySha(latestSha)) {
    return { state: "unknown", ...base, message: "Missing or invalid commit information." };
  }
  return { state: shaMatches(installedSha, latestSha) ? "up-to-date" : "update-available", ...base };
}

function safeIsPinned(source: string): boolean {
  try {
    return isPinned(source);
  } catch {
    return false;
  }
}
