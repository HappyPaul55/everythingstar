import {
  createContext,
  useContext,
  useMemo,
  type ComponentType,
  type ReactNode,
} from "react";
import { translateGameMessages, type Translate } from "./game";
import { DEFAULT_LOCALE, type Locale } from "./locales";
import { enGame } from "./ui/en.game";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);
/** The dictionary an island was given; the game's own unless a root says otherwise. */
const MessagesContext = createContext<Readonly<Record<string, string>>>(enGame);

/** Provide a locale to everything rendered below it. */
function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Readonly<Record<string, string>>;
  children: ReactNode;
}) {
  return (
    <LocaleContext.Provider value={locale}>
      <MessagesContext.Provider value={messages}>{children}</MessagesContext.Provider>
    </LocaleContext.Provider>
  );
}

/** The locale the surrounding island was given. */
export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** A `t` bound to the surrounding locale. */
export function useT(): Translate {
  const messages = useContext(MessagesContext);
  return useMemo(
    () =>
      (key, vars) =>
        translateGameMessages(messages, key, vars),
    [messages],
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
  messages: Readonly<Record<string, string>> = enGame,
): ComponentType<P & { locale?: Locale }> {
  function LocalizedIsland({
    locale = DEFAULT_LOCALE,
    ...props
  }: P & { locale?: Locale }) {
    return (
      <I18nProvider locale={locale} messages={messages}>
        <Inner {...(props as P)} />
      </I18nProvider>
    );
  }
  LocalizedIsland.displayName = `withLocale(${Inner.displayName || Inner.name || "Island"})`;
  return LocalizedIsland;
}
