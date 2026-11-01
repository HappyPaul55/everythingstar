import {
  createContext,
  useContext,
  useMemo,
  type ComponentType,
  type ReactNode,
} from "react";
import { translate, type MessageKey, type Translate } from "./index";
import { DEFAULT_LOCALE, type Locale } from "./locales";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/** Provide a locale to everything rendered below it. */
function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

/** The locale the surrounding island was given. */
export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** A `t` bound to the surrounding locale. */
export function useT(): Translate {
  const locale = useLocale();
  return useMemo(
    () => (key: MessageKey, vars?: Record<string, string | number>) =>
      translate(locale, key, vars),
    [locale],
  );
}

/**
 * Give an island's root component the page's locale.
 *
 * Astro hydrates every `client:*` component as its own React root, so a provider
 * rendered by the page cannot reach inside one — it has to sit at the top of the
 * island, above the component's own hooks. Wrapping the default export keeps
 * that in one place and lets `useT` work anywhere in the island.
 */
export function withLocale<P extends object>(
  Inner: ComponentType<P>,
): ComponentType<P & { locale?: Locale }> {
  function LocalizedIsland({
    locale = DEFAULT_LOCALE,
    ...props
  }: P & { locale?: Locale }) {
    return (
      <I18nProvider locale={locale}>
        <Inner {...(props as P)} />
      </I18nProvider>
    );
  }
  LocalizedIsland.displayName = `withLocale(${Inner.displayName || Inner.name || "Island"})`;
  return LocalizedIsland;
}
