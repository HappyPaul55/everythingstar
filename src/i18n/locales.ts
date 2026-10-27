/**
 * The supported UI locales.
 *
 * EverythingStar ships English only for now. The plumbing (this list, the
 * dictionaries and the `t()` lookup) is kept from the sibling TypeStar build, so
 * adding a locale later is a dictionary file plus an entry here — not a
 * refactor. `en` is the default and is served without a path prefix.
 */

export const LOCALES = ["en"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** The `<html lang>` value (and `hreflang`) for a locale. */
export const HTML_LANG: Record<Locale, string> = {
  en: "en-GB",
};

/** The `og:locale` value for a locale. */
export const OG_LOCALE: Record<Locale, string> = {
  en: "en_GB",
};
