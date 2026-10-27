/**
 * How far a song's stems may drift apart, and what is done about it.
 *
 * A song's parts play as **separate media elements**, one file each — four minutes of
 * every stem as a decoded buffer is hundreds of megabytes — and no two elements hold
 * exactly the same clock. The playhead is whatever one of them says, so the others
 * have to be kept with it: **gently while they are close, and by a seek only when they
 * are not**. It is the same "pull them into line" the player always did, with the
 * difference that a nudge is a *rate*, not a jump.
 *
 * The rule this replaces pulled every element back the moment it was more than a
 * breath out — every frame, against a playhead read from `elements[0]` — so a first
 * stem that was slow, refused or simply broken did not lose only its own sound: it
 * dragged every other stem back to the same instant, over and over, and a band came
 * out as a 120ms stutter of itself. **A seek is a thing to do rarely, and never
 * against an element that is not playing.**
 *
 * This rule is the one that runs **while the song is moving**. A pause or a start is
 * handled by an actual alignment instead (`stemSync.ts`), because an element that stops
 * 40 ms late will not be carried back by a 2% nudge — it would stay a flam for the rest
 * of the run. The hold here is deliberately short so a spread that a rate cannot hide is
 * never simply left alone.
 *
 * Pure, so the thresholds can be argued with without an audio device in the room.
 */

/**
 * Below this a stem is close enough, and is left alone — about a frame at 60 Hz, and
 * under the ~20 ms at which two copies of the same sound start to read as a flam.
 */
export const DRIFT_HOLD_MS = 18;

/**
 * Beyond this the drift is a flam the room can hear, and a rate is too weak a muscle
 * to close it in time: at the 2% ceiling a 40 ms gap takes seconds, and the measured
 * steady state of a nudge-only recovery sat at 20–40 ms for the rest of the run. So
 * the stem is moved onto the playhead rather than carried — one move, at most once a
 * second, and only on a stem that is actually playing.
 *
 * The seek costs that one stem its pre-roll (a few tens of milliseconds of its own
 * audio), which is the lesser fault: a persistent flam is heard on every note, a
 * re-buffer is heard once, and only on the part that was already out of line.
 */
export const DRIFT_SEEK_MS = 40;

/** How long a seek buys peace, so a stem that cannot be seeked is not fought. */
export const SEEK_COOLDOWN_MS = 1000;

/** The most a stem's rate is moved, as a fraction: 2% is inaudible as a pitch. */
export const RATE_RANGE = 0.02;

/**
 * How many consecutive seeks a stem is given that do not help it before it is
 * carried by rate alone until it recovers.
 *
 * A seek is supposed to end the flam it was taken for: it lands on the playhead, so
 * whatever gap remains a second later is what the seek *cost* — and on a stem whose
 * delivery cannot keep up, a seek discards its forward buffer and re-requests, which
 * can cost more than the gap it cured. Measured in a loaded browser: seek, fall
 * behind again, seek, eight times in a row, with the stems no closer together than
 * when it started. Two fruitless seeks in a row is the stem saying the move is the
 * problem, so from then on the rate nudge — which always works, only slower — is the
 * only muscle it gets, until it is back inside the hold and the count starts over.
 */
export const FRUITLESS_SEEK_LIMIT = 2;

/**
 * Whether a seek helped: did the gap at least halve by the time the next one was
 * due? A seek that landed costs only its own re-buffer, so an unhelpful seek is one
 * where the gap is essentially still there — the signature of a correction loop.
 */
export function seekHelped(driftAtSeekMs: number, driftNowMs: number): boolean {
  if (!Number.isFinite(driftAtSeekMs) || !Number.isFinite(driftNowMs)) return true;
  return Math.abs(driftNowMs) <= Math.abs(driftAtSeekMs) / 2;
}

/**
 * How far a stem corrected **while the song stands still** may sit from the playhead.
 *
 * Nobody can hear a correction in a pause, so a stem can be moved rather than carried
 * — the one moment a seek is free. The hold is tight because there is no moving song
 * for a rate to close a gap in, and the cooldown stops an element that cannot be moved
 * from being asked on every frame.
 */
export const STILL_HOLD_MS = 12;

/** How long a still seek buys peace before the stem is checked again. */
export const STILL_SEEK_COOLDOWN_MS = 500;

/**
 * How far from the target a `currentTime` write may read back and still count as
 * having landed. A seek in flight still reports its target, so this is float dust
 * rather than a distance the room could hear.
 */
export const SEEK_LAND_TOLERANCE_MS = 2;

/**
 * Whether a `currentTime` write actually moved the element.
 *
 * A media resource that cannot be seeked — a live stream, a host that will not
 * answer a range request — **ignores** the write: the position stays where it was,
 * and the correction rules would then re-issue it for the rest of the run, one a
 * second, moving nothing. The setter's own effect is the one honest signal there
 * is, so it is read back at once: a write that did not take is the last one that
 * stem gets, and the rate nudge (which always applies) becomes its only muscle.
 *
 * Pure: `after` is the element's own position read straight back from its
 * `currentTime`, in **seconds**, and `target` is where the write asked to go.
 */
export function seekLanded(
  after: number,
  target: number,
  toleranceMs = SEEK_LAND_TOLERANCE_MS,
): boolean {
  if (!Number.isFinite(after) || !Number.isFinite(target)) return false;
  return Math.abs(after - target) <= toleranceMs / 1000;
}

/**
 * Whether a write that did not read back at its target is evidence that the stem
 * cannot be seeked at all.
 *
 * A write is the only honest signal of a refusal, but not every miss is one. On a
 * phone a stem can have its metadata — a duration, a position of zero — long before
 * it has a byte it can move within, and an element whose seek is still in flight
 * reads back its **old** position until the seek lands. Condemning either of them
 * would carry the stem by rate for the rest of the run, and a 2% nudge can never
 * recover the seconds a file that was still arriving is behind. So only a stem with
 * **current data** that has settled somewhere other than the target has refused the
 * move; a load and a seek in flight both get another chance once they have a clock.
 */
export function seekRefused(
  after: number,
  target: number,
  readyState: number,
  seeking: boolean,
): boolean {
  if (seeking || !(readyState >= 2)) return false;
  return !seekLanded(after, target);
}

/**
 * The action for a stem while the transport is not moving.
 *
 * It is never nudged: a rate exists to hide a correction from the room, and there is no
 * moving song for it to hide behind. It is either close enough to leave alone or moved
 * onto the playhead. A seek that lands is followed by a cooldown, so an element that
 * cannot be seeked is not fought every frame.
 *
 * A stem a part has ducked is **not** corrected by this rule while the song runs: it is
 * still audible and still on the clock, so it is carried like any other stem. This is
 * the pause's rule alone.
 */
export function stillAction(driftMs: number, sinceSeekMs: number): DriftAction {
  if (!Number.isFinite(driftMs)) return { kind: "hold" };
  if (Math.abs(driftMs) <= STILL_HOLD_MS) return { kind: "hold" };
  if (sinceSeekMs < STILL_SEEK_COOLDOWN_MS) return { kind: "hold" };
  return { kind: "seek" };
}

/**
 * How far out of line a stem is when the rate is at its limit. It is the seek
 * threshold, so anything a rate cannot carry is moved and anything inside it is
 * nudged at a strength that closes the gap rather than merely pointing at it.
 */
const RATE_SPAN_MS = DRIFT_SEEK_MS;

/**
 * The rate to write to a stem's element.
 *
 * A practice run slows the whole song down, so the base rate is the practice
 * speed (1 for an ordinary run) and a drift nudge is a **fraction of it**, never
 * a replacement for it. Writing the bare nudge — or a flat `1` on a hold — would
 * pull one stem back to the record's speed while the rest of the band was at
 * 80%, which is the opposite of keeping it in line. A hold and a seek both mean
 * "the base rate", and a rate action means "the base rate, nudged".
 */
export function stemRate(baseRate: number, action: DriftAction): number {
  const base = Number.isFinite(baseRate) && baseRate > 0 ? baseRate : 1;
  return action.kind === "rate" ? base * action.playbackRate : base;
}

/** What is done about one stem at one moment. */
export type DriftAction =
  | { kind: "hold" }
  | { kind: "rate"; playbackRate: number }
  | { kind: "seek" };

/**
 * The action for one stem, given how far it is from the playhead and how recently it
 * was seeked.
 *
 * `driftMs` is the element's own position **minus** the playhead: positive is *ahead*
 * of the song, so it is slowed; negative is behind, so it is hurried. Only a drift
 * the room can hear as a flam, and a seek that is not still cooling down, moves the
 * element's clock rather than its speed.
 *
 * `canSeek` is false for a stem whose writes have never landed (a live stream, a
 * host that will not answer a range): past the threshold it must not become a seek
 * that cannot happen — which would leave it at the seek's own rate, exactly 1, for
 * ever — so it gets the strongest nudge instead, which is the only muscle it has.
 */
export function driftAction(
  driftMs: number,
  sinceSeekMs: number,
  canSeek = true,
): DriftAction {
  const drift = Math.abs(driftMs);
  if (drift <= DRIFT_HOLD_MS) return { kind: "hold" };
  if (canSeek && drift >= DRIFT_SEEK_MS && sinceSeekMs >= SEEK_COOLDOWN_MS) {
    return { kind: "seek" };
  }
  // Everything in between is carried by the rate, so the sound never gaps.
  const span = Math.max(-1, Math.min(1, driftMs / RATE_SPAN_MS));
  return { kind: "rate", playbackRate: 1 - span * RATE_RANGE };
}
