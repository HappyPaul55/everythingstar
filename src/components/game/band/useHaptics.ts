import { useEffect, useRef } from "react";
import {
  HAPTIC_GAP_MS,
  MISS_CUE,
  STAR_CUE,
  hapticAllowed,
  type HapticCue,
} from "../../../lib/game/haptics";
import { useStageControls } from "./StageControls";

/**
 * One seat's haptics: a buzz and a rumble for the two moments a run marks.
 *
 * It is called **per seat**, never once for the band, because a miss belongs to the
 * hand that made it: a buzz on the device and a rumble on *that* seat's pad. Two
 * seats missing together are one tap on the device — its motor is one between every
 * player, and `hapticAllowed` is the gap that keeps the patterns from stacking — and
 * two rumbles on two pads, which are their own hardware.
 *
 * **Nothing here judges anything.** The counts are read from the run's published
 * numbers (`run.misses`, `run.starUntilMs`, or a singer's own), exactly as the sound
 * cues read them, and a seat the machine is covering is passed `enabled: false` by
 * its caller because it has no hands to buzz.
 *
 * A browser with no `navigator.vibrate`, a pad that is not connected, a pad with no
 * actuator and a `playEffect` the browser refuses are all the same thing: silence.
 * The effect is wrapped, so haptics can never be the reason a run stops.
 */
interface Props {
  /** Whether the player wants it and this seat has hands. Off is off. */
  enabled: boolean;
  /** The player's place in the band, which is where their pad is found. */
  seat: number;
  /** The run's missed-note count. It only ever goes up within a run. */
  misses: number;
  /**
   * When the current star-power window began (a song-time stamp), or `0` when
   * there is none. It is a stamp rather than a flag so a second spend is a second
   * larger number; a rewind drops the run's counts and this with them.
   */
  starUntilMs?: number;
}

/**
 * When the **device** last buzzed, shared by every seat's hook on this page.
 *
 * A ref would be one per seat, which is the opposite of what the gap is for: two
 * panels missing on one frame would each see an empty history and buzz together.
 * The motor is one between the whole band, so its clock is one too. A pad's rumble
 * is that pad's own hardware and does not pass through here.
 */
const deviceBuzz = { at: null as number | null };

export function useHaptics({ enabled, seat, misses, starUntilMs = 0 }: Props) {
  const { plan } = useStageControls();
  // Which pad this seat is holding, if it is holding one. A seat on keys, MIDI, the
  // microphone or the machine has no actuator to answer it.
  const controller = plan.seats.find((entry) => entry.seat === seat)?.controller;
  const padIndex = controller?.on === "pad" ? controller.index : null;

  /** What this seat's run looked like at the last look, for the rewind rule. */
  const seen = useRef({ misses, starUntilMs });

  useEffect(() => {
    const previous = seen.current;
    // A rewind, a new chart or a new band: the counts go backwards. Seed from the
    // new run rather than firing on its first note — the same rule the parts and
    // the star cue use.
    if (misses < previous.misses) {
      seen.current = { misses, starUntilMs };
      return;
    }
    const missed = misses > previous.misses;
    // A star window opens as a new, larger stamp. `0` is no window, so a reset back
    // to zero is not a spend.
    const spent = starUntilMs > previous.starUntilMs;
    seen.current = { misses, starUntilMs };
    if (!enabled || (!missed && !spent)) return;

    // The bigger moment wins when both land together: a note can only be missed by
    // a run that is already playing, and star power being spent on the same frame
    // is the cue worth feeling.
    const cue = spent ? STAR_CUE : MISS_CUE;
    const now = performance.now();
    if (hapticAllowed(deviceBuzz.at, now, HAPTIC_GAP_MS)) {
      deviceBuzz.at = now;
      buzz(cue);
    }
    if (padIndex !== null) rumble(padIndex, cue);
  }, [enabled, misses, starUntilMs, padIndex]);
}

/** The device's own buzzer: present on most Androids, absent on iOS and desktops. */
function buzz(cue: HapticCue): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
    return;
  }
  try {
    // `vibrate` takes a pattern as a plain number array; the constant is readonly so
    // nobody can edit the cue a running run is using.
    navigator.vibrate([...cue.buzz]);
  } catch {
    // A buzz the browser will not play is silence, not a failed run.
  }
}

/**
 * The pad's own rumble. `dual-rumble` is the effect the Gamepad API standardised,
 * and a pad that does not know it rejects rather than throws — both are caught.
 */
function rumble(index: number, cue: HapticCue): void {
  if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") {
    return;
  }
  try {
    const pad = navigator.getGamepads()[index];
    void pad?.vibrationActuator
      ?.playEffect("dual-rumble", {
        duration: cue.rumble.duration,
        strongMagnitude: cue.rumble.strongMagnitude,
        weakMagnitude: cue.rumble.weakMagnitude,
      })
      .catch(() => {
        // A pad that will not rumble is a pad without an actuator.
      });
  } catch {
    // Reading a pad can throw in a browser that wants a gesture first.
  }
}
