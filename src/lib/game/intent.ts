/**
 * The **link intent**: what `/open?playlist=…` or `/open?song=…` asks the game to do.
 *
 * A link is an invitation, not an action. This module only turns a query string
 * into an intent (or says why it cannot), builds the canonical share URL, and
 * removes the parameters from a query once the game has read them. Nothing here
 * fetches, adds, or plays — the confirmation is the screen's business, and the
 * library's.
 *
 * The URL rules are the game's existing ones (`url.ts`): an absolute `http:` or
 * `https:` address with a host, and no credentials. A link is somebody else's
 * content, exactly like a pasted playlist URL, and it is read with the same
 * suspicion.
 */

import { fetchableUrl, MAX_URL_CHARS } from "./url";

/** The two things a link may name. Each is a query-string parameter. */
export const INTENT_PARAMS = ["playlist", "song"] as const;

export type IntentKind = (typeof INTENT_PARAMS)[number];

export interface Intent {
  kind: IntentKind;
  /** The document to add: a playlist, or a song's own document. */
  url: string;
}

/** Why a link that named something was refused. */
export type IntentRefusal = "both" | "long" | "url";

export type IntentRead =
  | { state: "none" }
  | { state: "invalid"; reason: IntentRefusal }
  | { state: "intent"; intent: Intent };

/**
 * A ceiling on the payload.
 *
 * A playlist address carrying a signed query can be long, but a link that is
 * megabytes is not one this game will put into storage or ask a screen to show.
 * The cap is generous for the honest case and short enough to refuse the absurd.
 * It is the URL policy's own ceiling (`MAX_URL_CHARS`), named here because a link
 * is where the question was first asked; a pasted playlist is held to the same one.
 */
export const INTENT_MAX_URL = MAX_URL_CHARS;

/** Read an intent out of a query string (`window.location.search` or a bare `?…`). */
export function readIntent(search: string): IntentRead {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return { state: "none" };
  }

  const present = INTENT_PARAMS.filter((kind) => params.has(kind));
  if (present.length === 0) return { state: "none" };
  if (present.length > 1) return { state: "invalid", reason: "both" };

  const kind = present[0] as IntentKind;
  const raw = (params.get(kind) ?? "").trim();
  if (raw.length > INTENT_MAX_URL) return { state: "invalid", reason: "long" };

  const url = fetchableUrl(raw);
  if (!url) return { state: "invalid", reason: "url" };
  return { state: "intent", intent: { kind, url } };
}

/**
 * Read an intent out of a whole address.
 *
 * The native shell hands the game the URL it was opened with, which may be either
 * the website's `https://…/open?playlist=…` or the custom `everythingstar://…`
 * form; only the query is read, so both work.
 */
export function readIntentFromUrl(raw: string, base: string): IntentRead {
  try {
    return readIntent(new URL(raw, base).search);
  } catch {
    return { state: "none" };
  }
}

/**
 * The canonical share address for an intent.
 *
 * `https://<origin>/open?playlist=<encoded>` is what a provider publishes and what
 * an Android App Link or an installed PWA receives. `URLSearchParams` does the
 * encoding, so a target with a query string of its own survives.
 */
export function shareUrl(origin: string, intent: Intent): string {
  const url = new URL("/open", origin);
  url.searchParams.set(intent.kind, intent.url);
  return url.href;
}

/**
 * The same query without the intent parameters, as a `?…` string or `""`.
 *
 * A parameter the game does not know (`?dev=1`) is kept: the link is an addition
 * to the page, not a replacement for everything else in its address.
 */
export function withoutIntent(search: string): string {
  const params = new URLSearchParams(search);
  for (const kind of INTENT_PARAMS) params.delete(kind);
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}
