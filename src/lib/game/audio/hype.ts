/**
 * The band's entrance: the sounds a run opens with, one per **part** rather than
 * one per player.
 *
 * A stage full of guitars is still one guitar, and three guitar entrances at once
 * would be a pile-up rather than a welcome. So the cues are deduplicated by the
 * recorded part — three guitars (or a lead and a rhythm, or a guitar and keys)
 * share the one guitar entrance; drums and a dance mat share the drum roll; a duet
 * of singers shares the microphone tap. What is genuinely different about the band
 * — a guitar, a bass, a drummer, a singer — is heard together.
 *
 * **Mixing**: the unique cues are spread evenly across a restrained stereo field
 * in band order. One part is centre; two are a quarter left and a quarter right;
 * three add a centre point, and more parts sit between. The outer cues never go
 * past ±25%, so an entrance is placed without turning the stage into a panning
 * demonstration.
 *
 * The mapping is data, not a second band model: `keys` reuses the guitar entrance
 * and `dance` the drums until either has a recording of its own, which is a
 * manifest entry and one line here. A typist is not a voice, so only a singer on a
 * pitched song brings the microphone tap.
 */

import { isLaneKind, type BandSetup, type LaneKind } from "../band/types";

/** The four entrances that have been recorded. */
export type HypeType =
  | "hype_guitar"
  | "hype_bass"
  | "hype_drums"
  | "hype_vocals";

/** One thing the band brings to the stage, and where it sits in the mix. */
export interface HypeCue {
  /** What the mixer plays: one of the `hype_*` types in the sound manifest. */
  type: HypeType;
  /** -1..1, between the two channels. The game keeps these inside ±0.25. */
  pan: number;
}

/** How far the outermost entrance sits from centre, as a fraction of the field. */
const HYPE_PAN = 0.25;

/**
 * How long each recorded entrance lasts, in milliseconds, as measured from its
 * shipped file. The song waits for the longest cue a band brings, so a hype is an
 * intro rather than a sound over the first bars. A replaced file is a new number
 * here, beside its type — and a test reads the shipped Ogg files' own last granule
 * position and holds these to ±20 ms, so the two cannot drift apart.
 *
 * The guitar and bass files are the same recording with the amp's 2.35 s lead-in
 * trimmed off, so an entrance is the chord rather than the wait before it. What is
 * left is the quiet run-up to the attack, which is kept on purpose: cutting on the
 * onset itself risks clipping it.
 */
export const HYPE_LENGTH_MS: Record<HypeType, number> = {
  hype_guitar: 3420,
  hype_bass: 3396,
  hype_drums: 2024,
  hype_vocals: 2454,
};

/**
 * The stage's entrance timing, mirrored in `band.css` through the
 * `--entrance-lead` and `--entrance-slide` properties `BandStage` sets.
 *
 * A run opens on a **quiet beat**: the stage mounts with the song's background and
 * the score rails, and the highways and the words stay offscreen for the lead. Then
 * the band's hype and the slide begin **together** — the highways rise from the
 * floor, the words drop from the top — and the run gets a short breath before the
 * song. The entrance as a whole is the lead plus whichever is longer, the slide or
 * the hype, plus that breath.
 */
export const ENTRANCE_LEAD_MS = 1200;
export const ENTRANCE_SLIDE_MS = 650;
const ENTRANCE_TAIL_MS = 250;

/**
 * How long the stage's entrance lasts before the song may start.
 *
 * It is the **lead**, then the **longest hype cue** the band brings or the slide
 * when that is longer, plus a short tail. A band with a guitar waits for the amp
 * and chord; a band with only drums waits for the roll; Listen waits only for the
 * slide. This is what makes the entrance an intro rather than a cue played over
 * the song's opening.
 */
export function hypeEntranceMs(cues: readonly HypeCue[]): number {
  const longest = Math.max(0, ...cues.map((cue) => HYPE_LENGTH_MS[cue.type]));
  return ENTRANCE_LEAD_MS + Math.max(longest, ENTRANCE_SLIDE_MS) + ENTRANCE_TAIL_MS;
}

/**
 * Which recorded entrance an instrument uses. `keys` and `dance` borrow the
 * nearest part that has a file rather than going silent; replacing them is a new
 * sound in the manifest and a line in this table.
 */
const HYPE_FOR: Record<LaneKind, HypeType> = {
  guitar: "hype_guitar",
  bass: "hype_bass",
  drums: "hype_drums",
  keys: "hype_guitar",
  dance: "hype_drums",
};

/**
 * The unique entrances a band brings, in band order, with their pans.
 *
 * `wordsPitched` is the song's own fact: only then can a words player be singing,
 * and only a singer gets `hype_vocals`. A player who chose Type, or a song whose
 * words have no pitch, stays silent — a typist is not a voice.
 */
export function hypeCues(setup: BandSetup, wordsPitched: boolean): HypeCue[] {
  const types: HypeType[] = [];
  const seen = new Set<HypeType>();
  for (const player of setup.players) {
    const type = isLaneKind(player.kind)
      ? HYPE_FOR[player.kind]
      : wordsPitched && player.wordsMode !== "type"
        ? "hype_vocals"
        : null;
    if (!type || seen.has(type)) continue;
    seen.add(type);
    types.push(type);
  }
  return types.map((type, index) => ({ type, pan: panFor(index, types.length) }));
}

/** Place one cue in the field: centre alone, otherwise spread across ±`HYPE_PAN`. */
function panFor(index: number, count: number): number {
  if (count <= 1) return 0;
  return -HYPE_PAN + (2 * HYPE_PAN * index) / (count - 1);
}
