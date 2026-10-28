import { useEffect, useState } from "react";
import type { Screen } from "../../../lib/game/screens";
import { shouldHoldWakeLock } from "../../../lib/game/wakeLock";

/**
 * The one screen wake lock the game asks for.
 *
 * The **rule** is pure and lives in `wakeLock.ts`: the countdown and the running
 * song want the display, and every other screen — a menu, the pause, the results —
 * lets it sleep. This hook is only the asking: one sentinel, requested when the rule
 * says yes and released the moment it says no.
 *
 * It is mounted **once in the island**, above the screens, because the run is what
 * it follows rather than any one page. A screen change that stays inside the run
 * (the countdown handing over to the song) does not re-ask, so the lock is not
 * dropped and taken again mid-song.
 *
 * The browser is always allowed to say no: a hidden tab, a battery saver, an
 * insecure context or a browser with no API at all leaves the game exactly as it
 * was, with the display sleeping as it always did. Nothing here retries a refusal;
 * the next screen or visibility change is a new question.
 *
 * The **native shell** is skipped entirely. Its own boot already holds the display
 * awake across the screens a run needs, and asking twice for one screen is a second
 * thing to keep in step for no gain.
 */

/**
 * The part of the Wake Lock API this hook uses, written out rather than relied on
 * from the TypeScript lib: the API is still young, and a browser that has no
 * `wakeLock` at all is the common case rather than an error.
 */
interface WakeLockSentinel {
  readonly released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
  removeEventListener: (type: "release", listener: () => void) => void;
}

interface WakeLockApi {
  request: (type: "screen") => Promise<WakeLockSentinel>;
}

interface Props {
  /** The player's setting. Off is off, whatever the screen is. */
  enabled: boolean;
  /** The screen the game is on, which is the rule's own question. */
  screen: Screen;
  /** Inside the app's WebView, whose boot already holds the display awake. */
  native: boolean;
}

export function useWakeLock({ enabled, screen, native }: Props) {
  // The document's own visibility, watched rather than passed: a tab hidden under
  // another one should not keep a phone's screen lit. It starts visible, which is
  // what a page being rendered means.
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const read = () => setHidden(document.visibilityState === "hidden");
    read();
    document.addEventListener("visibilitychange", read);
    return () => document.removeEventListener("visibilitychange", read);
  }, []);

  const wanted = shouldHoldWakeLock({ enabled, screen, native, hidden });

  useEffect(() => {
    if (!wanted) return;
    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock;
    if (!wakeLock || typeof wakeLock.request !== "function") return;

    let cancelled = false;
    let sentinel: WakeLockSentinel | null = null;
    let onRelease: (() => void) | null = null;
    // A refusal is final for this question. The effect is keyed on `wanted`, so a
    // new screen or a return to a visible tab asks again — and nothing asks in a
    // loop while the answer is still no.
    let refused = false;

    /** Let go of a sentinel we still hold, without treating a release as an error. */
    const drop = () => {
      const held = sentinel;
      sentinel = null;
      if (!held || held.released) return;
      if (onRelease) held.removeEventListener("release", onRelease);
      onRelease = null;
      void held.release().catch(() => {
        // An already-released lock is the browser having done it for us.
      });
    };

    const acquire = async () => {
      try {
        const next = await wakeLock.request("screen");
        // The screen may have moved on, or the tab been hidden, while the browser
        // was answering: a lock nobody wants is released rather than kept.
        if (cancelled || refused) {
          void next.release().catch(() => {});
          return;
        }
        sentinel = next;
        onRelease = () => {
          // The browser released it on its own — a hidden tab, a battery saver.
          // Forget it here; the next wanted transition asks again. Do not re-ask
          // from the event itself, which would be a loop against a refusal.
          if (sentinel === next) sentinel = null;
          onRelease = null;
        };
        next.addEventListener("release", onRelease);
      } catch {
        refused = true;
      }
    };

    void acquire();

    return () => {
      cancelled = true;
      drop();
    };
  }, [wanted]);
}
