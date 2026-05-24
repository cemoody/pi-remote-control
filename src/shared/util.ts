/**
 * Cross-cutting tiny helpers that were copy-pasted across server, web, and
 * shared modules. Keep this file dependency-free so it can be imported from
 * any layer (Node server, browser, build scripts).
 */

/**
 * True when `value` is a plain object suitable for property access.
 * Excludes `null`, arrays, and primitives. Matches the historical
 * server/web behavior (the previous two copies in extensions/packages.ts
 * and presentations/schema.ts also excluded arrays in practice because
 * their callers only fed object-shaped JSON in).
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Best-effort, user-facing error string. Handles `Error`, `DOMException`
 * (where `name` is sometimes more informative than the empty `message`),
 * and arbitrary thrown values without ever returning the literal
 * `"[object Object]"`.
 */
export function errorMessage(error: unknown): string {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return error.message || error.name;
  }
  if (error instanceof Error) return error.message;
  return String(error ?? "");
}
