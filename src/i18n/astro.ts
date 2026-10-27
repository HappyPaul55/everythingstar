/**
 * Astro-side helpers: the locale of a page, and a `t` bound to it.
 */

import { translator, type Translate } from "./index";
import { DEFAULT_LOCALE, isLocale, type Locale } from "./locales";

/** The locale from a URL path's first segment, or the default. */
export function localeFromPath(pathname: string): Locale {
  // `build.format: "file"` means the build-time pathname ends in `.html`.
  const clean = pathname.replace(/\.html$/, "").replace(/\/+$/, "");
  const segment = clean.split("/").filter(Boolean)[0];
  return isLocale(segment) ? segment : DEFAULT_LOCALE;
}

/** A `t` for a locale. */
export function tFor(locale: Locale): Translate {
  return translator(locale);
}
