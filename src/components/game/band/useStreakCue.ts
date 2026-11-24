import { useEffect, useRef } from "react";
import { multiplier } from "../../../lib/game/scoring";
import { useAudio } from "../audio/StageAudio";

/**
 * The room's local celebration: the first time a streak reaches ×4, this device
 * plays a short cheer. It is **feedback only** — `multiplier` is the same rule
 * that pays the notes, and nothing here reads back into judging or scoring.
 *
 * A guest plays it on its own phone; the host's own panels play it on the host.
 * The host does not play it for a remote seat: that guest's phone already did.
 */
export function useStreakCue(combo: number, enabled = true): void {
  const { play } = useAudio();
  const previous = useRef(0);
  useEffect(() => {
    const now = multiplier(combo);
    const before = multiplier(previous.current);
    previous.current = combo;
    if (enabled && now === 4 && before < 4) play("cheer");
  }, [combo, enabled, play]);
}
