/**
 * The translation lookup.
 *
 * `en` is the source of truth. Any other locale is a partial overlay that falls
 * back to English key by key, so a half-finished translation still reads
 * sensibly. Only `en` ships today.
 */

import { en, type MessageKey } from "./ui/en";
import type { Locale } from "./locales";

export type { MessageKey } from "./ui/en";

type Overlay = Partial<Record<MessageKey, string>>;

/** Every locale's dictionary, English first as the fallback. */
const DICTIONARIES: Record<Locale, Overlay> = {
  en,
};

export type Translate = (
  key: MessageKey,
  vars?: Record<string, string | number>,
) => string;

/**
 * The lookup over a set of dictionaries. `translate` is this over the shipped
 * ones; the split lets a test hand in an overlay without shipping a locale.
 */
export function translateWith(
  dictionaries: Record<string, Overlay>,
  locale: string,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const message = dictionaries[locale]?.[key] ?? en[key] ?? key;
  if (!vars) return message;
  return message.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/** Translate one key, filling `{name}` placeholders. */
export function translate(
  locale: Locale,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  return translateWith(DICTIONARIES, locale, key, vars);
}

/** A `t` bound to a locale, for both Astro and React. */
export function translator(locale: Locale): Translate {
  return (key, vars) => translate(locale, key, vars);
}
