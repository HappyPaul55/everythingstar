/**
 * When the game holds the screen awake.
 *
 * A run is watched, not tapped: a phone that dims after a minute of a four-minute
 * song is a phone the player has to wake with a thumb, and that is the hand they
 * were playing with. The **Screen Wake Lock** is the browser's answer, and this is
 * the one rule for when it is wanted.
 *
 * It is deliberately narrower than "the game is open": a menu or the jukebox is a
 * page somebody reads at their own pace, and a results screen is a place to put the
 * phone down. Only the countdown and the run itself are a song that must not be
 * interrupted by the display going to sleep. The **native shell** is skipped
 * because its own boot already holds the display awake for those screens, and two
 * requests for one screen is a second thing to keep in step for no gain.
 *
 * Pure, like the other rules: the hook does the asking, and this says whether.
 */

import type { Screen } from "./screens";

/** Everything the rule needs to know, so a browser test can ask it directly. */
export interface WakeLockQuestion {
  /** The player's setting. Off is off, whatever the screen is. */
  enabled: boolean;
  /** The screen the game is on. */
  screen: Screen;
  /** Inside the app repository's WebView, whose boot keeps the display awake. */
  native: boolean;
  /** The document is hidden, so a lock would be a lock on nothing. */
  hidden: boolean;
}

/**
 * Whether the game should be holding a screen wake lock right now.
 *
 * `countdown` is included on purpose: the entrance is the song already beginning,
 * and a display that sleeps over it would wake to a run that had started without
 * its player.
 */
export function shouldHoldWakeLock({
  enabled,
  screen,
  native,
  hidden,
}: WakeLockQuestion): boolean {
  if (!enabled || native || hidden) return false;
  return screen === "countdown" || screen === "playing";
}
