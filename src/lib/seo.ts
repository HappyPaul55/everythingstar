/**
 * The page metadata rules.
 *
 * Titles and descriptions are copy, and copy lives in the dictionary. What is
 * *arithmetic* is how a page's path becomes its canonical URL and how a page's
 * own name becomes its title, and both are the same on every page. They live
 * here, pure and tested, so a page cannot quietly canonicalise to the home page
 * or hand a search result a title with the brand on it twice.
 */

/** Longer than this and a search result starts dropping the end of a title. */
export const TITLE_SOFT_LIMIT = 60;

/**
 * The query version on the social card. Bump it when `public/og-image.png`
 * changes so a client fetches the new picture instead of the one it cached
 * under the old URL. It lives here so the head and the browser test share one
 * number rather than pinning it twice.
 */
export const OG_IMAGE_VERSION = "4";

/** What a description needs to say something — and before a result truncates it. */
export const DESCRIPTION_MIN = 120;
export const DESCRIPTION_MAX = 160;

/** Collapse runs of whitespace — including the newlines a template left behind. */
export function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * A page path as a canonical path: rooted, no query or hash, no `.html` (the
 * build's own output names) and no trailing slash except the root.
 *
 * `build.format: "file"` means a page's build-time pathname ends in `.html`; a
 * canonical that did too would be a second URL for the same document. The home
 * page is written as `index.html`, which is `/` and not `/index`.
 */
export function normalisePath(path: string): string {
  const trimmed = collapse(path)
    .replace(/[?#].*$/, "")
    .replace(/\.html$/, "");
  const rooted = `/${trimmed}`.replace(/\/{2,}/g, "/");
  const clean = rooted === "/" ? "/" : rooted.replace(/\/+$/, "");
  return clean === "/index" ? "/" : clean;
}

/** The absolute canonical URL for a page on the site. */
export function canonicalUrl(siteUrl: string, path: string): string {
  return new URL(normalisePath(path), siteUrl).href;
}

/**
 * `Page — Brand`, which is the pattern every secondary page follows.
 *
 * A page whose name already carries the brand is not given it twice, and a page
 * with no name of its own is just the brand — so the frontmatter of a legal page
 * can be edited without knowing how titles are assembled.
 */
export function pageTitle(page: string, site: string): string {
  const title = collapse(page);
  const brand = collapse(site);
  if (!brand) return title;
  if (!title || title.includes(brand)) return title || brand;
  return `${title} — ${brand}`;
}
