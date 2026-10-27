/**
 * Locale-aware internal links.
 *
 * The default locale lives at the root; any other locale is prefixed, so an
 * internal link is built for the page's locale rather than hardcoded. With only
 * `en` shipping, `localePath` is an identity for now.
 */

import { DEFAULT_LOCALE, type Locale } from "./locales";

/**
 * Prefix an app path with the locale. The default locale stays unprefixed, so
 * `localePath("en", "/play")` is `/play` and `localePath("de", "/play")` would be
 * `/de/play`. The root is special: `/` becomes `/de`, not `/de/`.
 */
export function localePath(locale: Locale, path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (locale === DEFAULT_LOCALE) return clean;
  return clean === "/" ? `/${locale}` : `/${locale}${clean}`;
}
