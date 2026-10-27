import { useEffect, useSyncExternalStore } from "react";
import {
  installSnapshot,
  promptInstall,
  subscribeInstall,
  watchInstall,
} from "./install";

/**
 * The install affordance's state.
 *
 * The event is captured by the session at mount; this hook is deliberately only a
 * reader, so opening Options later cannot miss it. Mounting the hook starts the
 * watch as well, which is what makes it work if this screen is ever opened without
 * the session effect (Storybook, a future embed).
 */
export function useInstall() {
  useEffect(() => {
    watchInstall();
  }, []);
  const snapshot = useSyncExternalStore(
    subscribeInstall,
    installSnapshot,
    installSnapshot,
  );
  return { ...snapshot, prompt: promptInstall };
}
