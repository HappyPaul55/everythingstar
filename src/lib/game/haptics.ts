/**
 * Haptics: what a miss and a spent star power are **felt** with.
 *
 * A buzz is the one cue a player can read without looking away from the highway,
 * so it follows the two moments the run already marks out loud — a part going out
 * and the meter being spent. It is **feedback beside the run**, like the mixer's
 * cues: nothing here is read back into judging, and nothing here changes a note.
 *
 * Two motors can answer one event. The **device** has one buzzer between every
 * seat, so the gap below keeps two players missing on the same frame from stacking
 * patterns into one long rattle. The **pad** a seat is holding has an actuator of
 * its own (where the pad has one at all), and two pads can answer their own players
 * at the same moment without either being the other's.
 *
 * Every number here is deliberately short. A gamepad's rumble is felt in the hands
 * and a phone's buzz is felt through the whole device, so a miss is a tap rather
 * than an alarm, and star power is the longer, stronger one because it is the one
 * thing in a run a player spends on purpose.
 */

/** One haptic cue: the device's buzz, and the pad's own rumble. */
export interface HapticCue {
  /**
   * The `navigator.vibrate` pattern, in milliseconds: on, off, on, and so on. A
   * single number is one buzz of that length.
   */
  buzz: readonly number[];
  /** How the seat's pad rumbles, where it can. */
  rumble: {
    /** How long the effect lasts, in milliseconds. */
    duration: number;
    /** The heavy motor, 0..1. */
    strongMagnitude: number;
    /** The light motor, 0..1. */
    weakMagnitude: number;
  };
}

/** A missed note: one short tap under the hand. */
export const MISS_CUE: HapticCue = {
  buzz: [30],
  rumble: { duration: 90, strongMagnitude: 0.45, weakMagnitude: 0.25 },
};

/**
 * Star power, spent: a longer double pulse, on both motors. Unlike the miss it is
 * a thing the player did, so it is allowed to be felt as one.
 */
export const STAR_CUE: HapticCue = {
  buzz: [35, 45, 35, 45, 80],
  rumble: { duration: 320, strongMagnitude: 1, weakMagnitude: 0.7 },
};

/**
 * The least time between two device buzzes, in milliseconds. Two seats can miss on
 * one frame, and one phone has one motor: without this the patterns would queue
 * into a buzz that says nothing about either note. A pad's rumble is not gated —
 * it belongs to the hand holding that pad.
 */
export const HAPTIC_GAP_MS = 50;

/**
 * Whether a device buzz may happen now, given when the last one did.
 *
 * `lastAt` is `null` until the first buzz of the session. `now` is wall time (a
 * haptic has nothing to do with the song's clock), and a clock that went
 * **backwards** is treated as a fresh start rather than as a buzz that must wait:
 * no real device moves its clock back, but a restored timestamp must not silence
 * the next minute of play.
 */
export function hapticAllowed(
  lastAt: number | null,
  now: number,
  gap: number = HAPTIC_GAP_MS,
): boolean {
  if (lastAt === null) return true;
  if (!Number.isFinite(lastAt) || !Number.isFinite(now)) return true;
  if (now < lastAt) return true;
  return now - lastAt >= Math.max(0, gap);
}
