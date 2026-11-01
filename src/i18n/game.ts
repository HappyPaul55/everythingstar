import type { MessageKey } from "./ui/en";

/**
 * The game island's lookup, over its own dictionary.
 *
 * It is deliberately not `translate()` from `./index`: that one falls back to the
 * whole site dictionary, which would pull the landing/docs/charter strings back
 * into `/play`'s first download. A key that is not in the game dictionary is not a
 * game string, and showing the key is the honest answer.
 */
export type Translate = (
  key: MessageKey,
  vars?: Record<string, string | number>,
) => string;

export function translateGameMessages(
  messages: Readonly<Record<string, string>>,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const message = messages[key] ?? key;
  if (!vars) return message;
  return message.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

