import { useEffect, useState } from "react";
import {
  hasSeenHints,
  loadOnboarding,
  markHintsSeen,
  saveOnboarding,
} from "../../../lib/game/onboarding";

/**
 * Whether this seat is seeing the first-run highway hints for the first time.
 *
 * The record is **per seat**, not per browser: Player 3 gets the lesson even when
 * Players 1 and 2 have already played. It is read and written in effects rather
 * than during render, because the island is server-rendered and local storage is
 * not — the first paint must not depend on it.
 */
export function useFirstRunHint(seat: number, enabled: boolean): boolean {
  const [first, setFirst] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const state = loadOnboarding();
    if (hasSeenHints(state, seat)) return;
    setFirst(true);
    // Mark it when the stage mounts, not after the song: a player who quits
    // immediately has still had their first run, and the next person to take the
    // seat gets the lesson rather than a browser-wide flag denying it.
    saveOnboarding(markHintsSeen(state, seat));
  }, [enabled, seat]);

  return first;
}
