/**
 * The site's primary navigation, shared by the header and the footer so the two
 * cannot drift apart. Kept pure so it is unit-tested.
 */

import type { Translate } from "../i18n";
import type { Locale } from "../i18n/locales";
import { localePath } from "../i18n/paths";

export interface NavItem {
  href: string;
  label: string;
}

/** The pages linked from the header and footer. */
export function siteNav(locale: Locale, t: Translate): NavItem[] {
  return [
    { href: localePath(locale, "/play"), label: t("nav.play") },
    { href: localePath(locale, "/docs"), label: t("nav.docs") },
    { href: localePath(locale, "/privacy"), label: t("nav.privacy") },
  ];
}
