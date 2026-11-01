/**
 * Where a document lives, in both places it is read.
 *
 * The documentation is written once, as Markdown in `docs/`, and read twice: by
 * GitHub (which follows the files and their relative links) and by this site
 * (which builds a route per document). This module is the one place that says
 * what a document's id is and what URL the site gives it, so a page, a link and
 * the markdown-link rewrite cannot disagree.
 *
 * Pure: no filesystem, no Astro. The build passes a path in, the tests pass a
 * path in, and the two answer the same.
 */

import { fileURLToPath } from "node:url";
import { localePath } from "../../i18n/paths";
import { DEFAULT_LOCALE, type Locale } from "../../i18n/locales";

/** The four audiences. The folder is the section, so the two cannot drift. */
export const DOC_SECTIONS = ["players", "charters", "developers", "other"] as const;

export type DocSection = (typeof DOC_SECTIONS)[number];

/** The documentation's own directory, wherever the build is run from. */
export const DOCS_ROOT = fileURLToPath(new URL("../../../docs/", import.meta.url)).replace(
  /\\/g,
  "/",
);

/** The one document that is not filed under a section: the hub. */
const DOC_HUB = "README";

/** The section a document id belongs to, or null for the hub and strays. */
export function docSectionOf(id: string): DocSection | null {
  const head = id.split("/", 1)[0] ?? "";
  return (DOC_SECTIONS as readonly string[]).includes(head) ? (head as DocSection) : null;
}

/**
 * The URL a document is served at.
 *
 * The hub is `/docs`; the notices are site pages of their own (`/privacy`,
 * `/credits`) because they are not documentation and their old URLs are load
 * bearing; everything else is under `/docs/<section>/…`, so the audience is in
 * the address.
 */
export function docHref(id: string, locale: Locale = DEFAULT_LOCALE): string {
  const base =
    id === DOC_HUB
      ? "/docs"
      : id.startsWith("other/")
        ? `/${id.slice("other/".length)}`
        : `/docs/${id}`;
  return localePath(locale, base);
}

/** The document id for a file under `docs/`, or null for anything else. */
export function docIdFromPath(path: string): string | null {
  const normal = path.replace(/\\/g, "/");
  const root = DOCS_ROOT.endsWith("/") ? DOCS_ROOT : `${DOCS_ROOT}/`;
  if (!normal.startsWith(root)) return null;
  const relative = normal.slice(root.length);
  if (!relative.endsWith(".md")) return null;
  return relative.slice(0, -".md".length);
}

/**
 * A relative Markdown link as the URL the site serves it at.
 *
 * Only a relative link to another `.md` document is rewritten: an absolute path,
 * a full URL, an in-page anchor and a link to any other kind of file are left
 * exactly as written, because they already mean what they say on both readers.
 * A link that climbs out of `docs/` is left alone too — it is a repository file,
 * which GitHub can show and this site cannot, so the author should link it in
 * full.
 */
export function resolveDocLink(fromId: string, url: string): string {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(url)) return url;
  const [target = "", rest = ""] = splitSuffix(url);
  if (!target.endsWith(".md")) return url;
  const directory = fromId.includes("/") ? fromId.slice(0, fromId.lastIndexOf("/") + 1) : "";
  const id = joinId(directory + target.slice(0, -".md".length));
  // A link to a file outside `docs/` is a repository file: GitHub can show it and
  // this site cannot, so it is left for the author to link in full rather than
  // rewritten into a route that does not exist.
  if (id === null || (id !== DOC_HUB && docSectionOf(id) === null)) return url;
  return `${docHref(id)}${rest}`;
}

/** A URL split into its path and its `?query#hash` tail. */
function splitSuffix(url: string): [path: string, rest: string] {
  const at = url.search(/[?#]/);
  return at === -1 ? [url, ""] : [url.slice(0, at), url.slice(at)];
}

/** Resolve `.` and `..` in a slash-separated id; null when it leaves the root. */
function joinId(path: string): string | null {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.length > 0 ? parts.join("/") : null;
}
