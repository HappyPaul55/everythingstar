import { AUTO_ACCURACY, autoVerdict } from "./simulate";
import type { MelodyChart, MelodyNote, VocalDifficulty } from "./track";

/**
 * Singing, as rules: what a row sounds, how far off a singer may be, and whether
 * they landed a note.
 *
 * A melody note's pitch is a **row** — 0 at the bottom of the roll — and a row is a
 * semitone from the chart's `rootMidi`. That is what lets a contour drawn by a mock
 * and a frequency measured in hertz be the same thing: detection hands back a MIDI
 * number (`pitch.ts`), a chart says which MIDI number a row is, and this decides
 * whether they agree.
 *
 * A note is judged on **how much of its own span was held in tune**, not on a
 * single sample at its onset. A singer who comes in late on a long note and then
 * corrects it still lands the note, because the time in the correct area is what
 * counts; a short note is the same rule with less time to spend. The samples come
 * from a **trail** of recent pitch, recorded by the microphone on the stage's own
 * frame loop, and what was silence is not a pitch.
 *
 * **Difficulty is the tolerance**, so the three levels the vocals always carry are
 * three ways of being listened to. A sung note is worth the same once it is a hit;
 * the share's only line is `SUNG_HIT_SHARE`, the point below which it is a miss.
 */

/** How far off a singer may be, in semitones, at each level a voice has. */
export const VOCAL_TOLERANCE: Record<VocalDifficulty, number> = {
  easy: 2,
  normal: 1.25,
  hard: 0.75,
};

/** How far either side of a freeform note's start its voice is listened for. */
export const ONSET_MS = 180;

/**
 * How much of a pitched note must be held in tune to count as sung. Below this it
 * is a miss; above it the note is worth its full value. The score no longer grades
 * the share into smaller points, so this is the only line the share crosses.
 */
const SUNG_HIT_SHARE = 0.4;

/**
 * How far before a pitched note its voice is listened to, in ms. A singer
 * arrives on the pitch slightly early, and the detector's window and smoothing
 * take a moment to lock on; without this lead a short note would lose its first
 * frames and be scored as a miss even though it was sung.
 */
export const SING_LEAD_MS = 180;

/**
 * How far after a pitched note's end its voice is still listened to, in ms. The
 * analyser window and the median filter report a note a frame or two late, so a
 * short note's last frames would otherwise be heard after the window closed; the
 * verdict is taken after this grace (`judgedAt` in `run.ts`).
 */
export const SING_GRACE_MS = 120;

/** The longest gap between two samples that still counts as held, in ms. */
const MAX_SAMPLE_GAP_MS = 100;

/** What one in-tune sample stands for when it is the first of a run, in ms. */
const SAMPLE_MS = 20;

/** A trail long enough for the longest note: about seventeen seconds at 60fps. */
const DEFAULT_TRAIL = 1024;

/** The MIDI note a row sounds when it is sung. */
export function rowMidi(melody: Pick<MelodyChart, "rootMidi">, row: number): number {
  return melody.rootMidi + row;
}

/**
 * How far apart two pitches are, **ignoring octaves** — a man an octave below a
 * woman is singing the same note, and karaoke is full of exactly that. The answer
 * is 0..6 semitones, so 12 apart is unison and 7 apart (a fifth) is 5.
 */
export function pitchDistance(detected: number, target: number): number {
  const apart = Math.abs(detected - target) % 12;
  return Math.min(apart, 12 - apart);
}

/** A note's verdict, in the shape the melody's run asks for. */
export interface SungNote {
  hit: boolean;
  /** How late (or early) the first in-tune sample landed, in ms. */
  offsetMs: number;
  /**
   * How much of the note's own span was held in tune, 0..1. The simulator has no
   * microphone and leaves it out; a live verdict uses it to decide the hit.
   */
  share?: number;
}

/**
 * The recent pitch samples, written in place: a fixed ring, so a frame allocates
 * nothing. `count` is how many are in it; `next` is where the next one goes.
 */
export interface PitchTrail {
  readonly times: Float32Array;
  readonly midis: Float32Array;
  count: number;
  next: number;
}

export function createTrail(capacity = DEFAULT_TRAIL): PitchTrail {
  const size = Math.max(1, Math.trunc(capacity));
  return {
    times: new Float32Array(size),
    midis: new Float32Array(size),
    count: 0,
    next: 0,
  };
}

/** Nothing was heard, so nothing is recorded: silence is not a pitch. */
export function pushPitch(trail: PitchTrail, atMs: number, midi: number): void {
  trail.times[trail.next] = atMs;
  trail.midis[trail.next] = midi;
  trail.next = (trail.next + 1) % trail.times.length;
  trail.count = Math.min(trail.count + 1, trail.times.length);
}

/**
 * Forget every sample.
 *
 * A trail is stamped in **song** time, so a deliberate move of the playhead — a
 * practice loop back into a section, or a run started over — would otherwise let
 * the previous pass's voice judge the notes of the next one. Clearing is the
 * whole of the reset: the run's own verdicts are reset elsewhere.
 */
export function clearTrail(trail: PitchTrail): void {
  trail.count = 0;
  trail.next = 0;
}

/** Visit the samples inside a window, oldest first. Allocates nothing. */
export function trailInWindow(
  trail: PitchTrail,
  fromMs: number,
  toMs: number,
  visit: (atMs: number, midi: number) => void,
): void {
  const size = trail.times.length;
  const oldest = (trail.next - trail.count + size) % size;
  for (let i = 0; i < trail.count; i += 1) {
    const at = (oldest + i) % size;
    const time = trail.times[at];
    if (time < fromMs || time > toMs) continue;
    visit(time, trail.midis[at]);
  }
}

/**
 * Did the singer land this note?
 *
 * A **freeform** note (a word with no pitch: spoken or rapped) is decided on
 * presence — they made a sound near its onset — because there is no note to be
 * right about. A **pitched** note is decided on the share of its own duration
 * that was held in tune: every in-tune sample credits the time since the one
 * before it, capped so a long silence is not made up for by one sample. It is
 * listened to from a short **lead** before its start and a short **grace** after
 * its end, so an early or late entry — and the detector's lock-on — is not
 * mistaken for a missed note. That is what lets a singer start a held note
 * wrong, correct it, and still land it. The grace lets the last of the note be
 * heard after its end; the **time** credited never runs past the note, so a
 * short note cannot be landed by singing the one after it.
 *
 * The offset is when the first in-tune sample arrived, relative to the note's
 * start, and is kept for the read-out even though a live singer is scored on
 * the share rather than the offset.
 */
export function singVerdict(
  note: { timeMs: number; lengthMs?: number; row: number | null },
  melody: Pick<MelodyChart, "rootMidi">,
  trail: PitchTrail,
  tolerance: number,
): SungNote {
  if (note.row === null) {
    let heard = false;
    trailInWindow(trail, note.timeMs - ONSET_MS, note.timeMs + ONSET_MS, () => {
      heard = true;
    });
    return { hit: heard, offsetMs: 0, share: heard ? 1 : 0 };
  }

  const target = rowMidi(melody, note.row);
  // The judged window is the note's own length plus the grace: a late singer is
  // still delivering this note when the detector hears them.
  const length = Math.max(note.lengthMs ?? 0, 0);
  const endMs = note.timeMs + length + SING_GRACE_MS;
  // Time is credited **inside the note** only. The grace is still listened to, so
  // a late sample can settle the last part of the note, but a sample after its end
  // cannot add held time: otherwise a short note nobody sang could be landed by
  // singing the next one. The one exception is the detector's own span
  // (`SAMPLE_MS`), which is what lets a note shorter than one sample be judged at
  // all; the floor below is the same rule on the denominator.
  const creditEndMs = note.timeMs + Math.max(length, SAMPLE_MS);
  let previousMs = Number.NaN;
  let heldMs = 0;
  let firstMs: number | null = null;

  trailInWindow(trail, note.timeMs - SING_LEAD_MS, endMs, (atMs, midi) => {
    // Credit the time since the previous sample, so the share is a duration
    // rather than a count that a fast detector would inflate. The **lead** is
    // heard but never counted: singing the right pitch before the note belongs
    // to the note before it, and a short note must not be landed by an early
    // entry alone. The **grace** is heard so the detector can settle the end of
    // the note, but the credit still stops at the note's own end (or the span a
    // single sample stands for, for a note shorter than that).
    const fromMs = Number.isNaN(previousMs) ? atMs - SAMPLE_MS : previousMs;
    previousMs = atMs;
    if (pitchDistance(midi, target) > tolerance) return;
    if (firstMs === null) firstMs = atMs;
    const inside = Math.max(
      Math.min(atMs, creditEndMs) - Math.max(fromMs, note.timeMs),
      0,
    );
    heldMs += Math.min(inside, MAX_SAMPLE_GAP_MS);
  });

  // The denominator is the note's own length, with the detector's own span as the
  // floor: a sample stands for the time until the next one, and a note shorter
  // than that must not be landed by a single sample crediting more than it has.
  const share = Math.min(1, heldMs / Math.max(length, SAMPLE_MS));
  return {
    hit: share >= SUNG_HIT_SHARE,
    offsetMs: firstMs === null ? 0 : Math.round(firstMs - note.timeMs),
    share,
  };
}

/** What one singer's seat is judged from, and from how far off they may be. */
export interface SingerJudge {
  /**
   * Whether **this** singer's own seat has a microphone. One microphone is one
   * between the singers, but it is not every seat's: a seat the machine covers
   * plays itself however loud the room is.
   */
  live: boolean;
  /** The microphone's recent pitch, or `null` while nothing is being heard. */
  trail: PitchTrail | null;
  /** The tolerance of this singer's own level. */
  tolerance: number;
  /** The seed the machine plays this seat from, when it is the machine's. */
  seed: number;
  /**
   * How often the machine lands its note, when it is the machine's. The normal
   * player is `AUTO_ACCURACY`; the attract demo asks for a perfect one.
   */
  accuracy?: number;
}

/**
 * Which voice judges this note: the singer's own, or the machine's.
 *
 * A seat is judged from the microphone only when it **has one** (`live`) **and** a
 * trail is being recorded. That is the whole per-singer rule: one person singing
 * cannot judge the machine singer beside them, and a live seat whose stream has not
 * opened yet — or whose browser refused it — plays itself exactly as before, so a
 * refused microphone costs nobody their game. The rule is pure, and it is the only
 * place the choice is made.
 */
export function singerVerdict(
  note: MelodyNote,
  melody: Pick<MelodyChart, "rootMidi">,
  judge: SingerJudge,
): SungNote {
  if (judge.live && judge.trail) {
    return singVerdict(note, melody, judge.trail, judge.tolerance);
  }
  return autoVerdict(note, judge.seed, judge.accuracy ?? AUTO_ACCURACY);
}
