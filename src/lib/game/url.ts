/**
 * What this game will fetch, and what it will merely show.
 *
 * A playlist URL is pasted by a player and every document and chart resolves from
 * it, so the address itself is the first thing not to trust. A URL worth fetching
 * is **absolute**, on **http or https**, and has a **host**: a `javascript:`,
 * `data:`, `file:` or `blob:` address is a thing the browser would run, open or read
 * off this machine rather than download, and a relative one has nothing to resolve
 * its own files against.
 *
 * `http:` is allowed here on purpose. It is a perfectly fetchable address; on an
 * https page the browser's own mixed-content rules are what refuse it (a fetch
 * would fail as an opaque error), so the dialog says so before the player presses
 * Add rather than leaving them with a silent failure.
 *
 * A URL carrying **credentials** (`https://user:pass@host/x`) is refused with the
 * rest. It parses, but `fetch` will not use it: it throws an opaque "URL includes
 * credentials" TypeError instead of the readable refusal the dialog can show.
 */

const READABLE_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * The longest address this game will keep, draw or fetch: 8 KB.
 *
 * A playlist URL carrying a signed query can be long, and a link's own query can
 * carry a lot — but an address past this is not one anybody reads, and it would be
 * stored, rendered on a row and used as a cache key. One ceiling for every caller,
 * so a pasted playlist is held to exactly the rule a link is.
 */
export const MAX_URL_CHARS = 8192;

/** The address as the browser would fetch it, or null when it is not one we read. */
export function fetchableUrl(raw: string): string | null {
  return parsed(raw)?.href ?? null;
}

/** The host to show for an address (`example.com`, `example.com:8080`), or null. */
export function hostOf(raw: string): string | null {
  return parsed(raw)?.host ?? null;
}

/** An address the page itself would refuse to fetch when served over https. */
export function isInsecure(raw: string): boolean {
  return parsed(raw)?.protocol === "http:";
}

/**
 * Would the browser block this address as mixed content?
 *
 * Only an https page can: an http address there is refused before the request is
 * made, so it is worth saying in the dialog. An http page can fetch either.
 */
export function mixedContentBlocked(raw: string, pageProtocol: string): boolean {
  const protocol = pageProtocol.trim().toLowerCase();
  const page = protocol.endsWith(":") ? protocol : `${protocol}:`;
  return page === "https:" && isInsecure(raw);
}

function parsed(raw: string): URL | null {
  const trimmed = raw.trim();
  // The ceiling is checked before the URL is even parsed: a hundred-kilobyte
  // address is not a document to read, and every caller is refused at the same size.
  if (!trimmed || trimmed.length > MAX_URL_CHARS) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (!READABLE_PROTOCOLS.has(url.protocol) || !url.host) return null;
  // A password in the address is not a thing this game asks a player for, and
  // `fetch` refuses the URL with a TypeError rather than fetching it.
  if (url.username || url.password) return null;
  return url;
}
