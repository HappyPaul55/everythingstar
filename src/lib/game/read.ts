/**
 * Reading JSON without trusting it.
 *
 * Every document in the library — a playlist, a song, a chart — arrives from a URL
 * somebody else wrote, so nothing in it is taken on faith. These are the primitives
 * the readers use so that each one says its own rules rather than re-deriving what a
 * string is.
 */

import { fetchableUrl } from "./url";

/** The version every document we read declares. */
export const SCHEMA_VERSION = 1;

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A non-empty string, or null. */
export function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** A finite number, or null. */
export function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** A boolean, or the given default. */
export function flag(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** An array, or an empty one. */
export function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** A string from a fixed set, or null. */
export function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

/** The document's declared schema version, or null when it does not say. */
export function schemaVersion(body: unknown): number | null {
  return isObject(body) ? num(body.schemaVersion) : null;
}

/**
 * An absolute URL for a reference, read against the document that wrote it — which
 * is what lets a playlist point at songs anywhere while its own files stay relative.
 * A reference that cannot be resolved is null rather than a thrown fetch later.
 */
export function resolveUrl(ref: string, base: string): string | null {
  try {
    return new URL(ref, base).href;
  } catch {
    return null;
  }
}

/**
 * A reference in a document, resolved **and** held to the URL policy when that
 * document is one this game fetched.
 *
 * `resolveUrl` alone accepts any absolute scheme, so a remote playlist or song
 * document could name `javascript:`, `data:`, `file:` — or even `folder://` — for
 * its song, its art or a stem: accepted, cached and offered, then refused by `fetch`
 * (or mistaken for a file off this machine). A document reached over http(s) may
 * therefore name only http(s).
 *
 * A **local** document (`folder://…`) is not fetched at all and its references are
 * resolved by the browser, so it keeps the permissive rule.
 */
export function resolveDocumentRef(ref: string, base: string): string | null {
  const resolved = resolveUrl(ref, base);
  if (!resolved) return null;
  if (!fetchableUrl(base)) return resolved;
  return fetchableUrl(resolved);
}
