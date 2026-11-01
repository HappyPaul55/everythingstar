/**
 * A failure as one plain sentence.
 *
 * Nothing here throws on: a playlist that will not load, a source that will not
 * answer and a search that times out are all ordinary, and each caller says what it
 * was trying to do when the browser offers no words of its own.
 */

/**
 * The wordings a browser gives a request that never got an answer.
 *
 * CORS, a host that is down, a machine that is offline and an https page asking for
 * an http one all arrive as the same opaque `TypeError`: there is no response, so
 * there is nothing that says which it was. The message is the browser's own ("Failed
 * to fetch", Firefox's "NetworkError…", Safari's "Load failed") and says nothing a
 * player can act on.
 */
const UNREACHABLE = /failed to fetch|networkerror|load failed/i;

const UNREACHABLE_SENTENCE =
  "the host could not be reached, or it does not allow this page to read it (CORS)";

/**
 * A page that is not the document it promised — a hotel's sign-in screen, a host's
 * incident page, an HTML 404.
 *
 * V8's own `Unexpected token '<', "<!DOCTYPE "…` names the internals and quotes a
 * piece of somebody else's page; none of that helps a player, and the fix is the
 * same sentence. It is deliberately **not** "playlist": the same reader parses a
 * song document and a chart.
 */
const NOT_A_DOCUMENT = "that address answered with something this game could not read";

/**
 * The one sentence for a request that never reached its host, or null when this is
 * a failure that already says what it was.
 *
 * A timeout, a bad status and our own refusals are ordinary `Error`s with a readable
 * message, and an abort keeps the words its caller gave it — only the opaque fetch
 * shape is translated here.
 */
export function unreachableMessage(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  return UNREACHABLE.test(error.message) ? UNREACHABLE_SENTENCE : null;
}

export function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  if (error instanceof SyntaxError) return NOT_A_DOCUMENT;
  return unreachableMessage(error) ?? error.message;
}

/** A search's failure: a request the timeout dropped says it timed out. */
export function searchError(error: unknown): string {
  const name = (error as { name?: unknown } | null)?.name;
  if (name === "AbortError") return "timed out";
  return errorMessage(error, "could not be searched");
}
