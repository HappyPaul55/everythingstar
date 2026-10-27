/**
 * Small helpers for building a melody, shared by the sources that carry words.
 *
 * `groupLyrics` (`lyricLines.ts`) does the hard part — syllables into words and
 * lines. These are the two shapes on top of it: a full melody numbered and made
 * whole, and a **words-only** melody for a source with no pitch at all (a lyric
 * sheet), which is a melody with lines and no notes.
 */

import { MAX_PARTS, type MelodyChart, type MelodyLine } from "../track";
import type { GroupedLyrics } from "./lyricLines";

/**
 * Several grouped parts as one melody: a duet, or a solo that went through the
 * same door. The **roll is shared** — every part's notes are re-numbered against
 * one root and one row count — so a low bass voice and a high harmony still sit on
 * the same piano roll instead of each having a private one.
 */
export function melodyOfParts(
  groups: readonly GroupedLyrics[],
  id: string,
): MelodyChart {
  const used = groups.slice(0, MAX_PARTS);
  const parts = Math.max(1, used.length);
  const hasPitch = used.some((group) => group.hasPitch);

  const midis = used.flatMap((group) =>
    group.notes.flatMap((note) =>
      note.row === null ? [] : [group.rootMidi + note.row],
    ),
  );

  let rootMidi = used[0]?.rootMidi ?? 57;
  let rows = used[0]?.rows ?? 6;
  if (hasPitch && midis.length > 0) {
    const low = Math.min(...midis);
    const high = Math.max(...midis);
    const span = Math.max(1, high - low + 1);
    if (span < 6) {
      rootMidi = low - Math.floor((6 - span) / 2);
      rows = 6;
    } else {
      rootMidi = low;
      rows = span;
    }
  }

  const lines = used
    .flatMap((group) => group.lines)
    .sort(
      (a, b) =>
        a.timeMs - b.timeMs ||
        (a.parts[0]?.part ?? 0) - (b.parts[0]?.part ?? 0),
    );

  const notes = used
    .flatMap((group) =>
      group.notes.map((note) => ({
        ...note,
        row: note.row === null ? null : group.rootMidi + note.row - rootMidi,
      })),
    )
    .sort((a, b) => a.timeMs - b.timeMs || a.part - b.part)
    .map((note, index) => ({ ...note, id: `${id}-voice:${index}` }));

  return { parts, hasPitch, rows, rootMidi, lines, notes };
}

/**
 * A lyric sheet's cues as lines: each cue is a line, its words spread evenly across
 * it. There is no pitch to place them against, so the spacing is the only timing
 * there is — which is what a typist reads.
 */
export function cueLines(
  cues: { startMs: number; endMs: number; text: string }[],
): MelodyLine[] {
  return cues
    .filter((cue) => cue.text.trim() !== "")
    .map((cue) => {
      const words = cue.text.trim().split(/\s+/);
      const span = Math.max(0, cue.endMs - cue.startMs);
      const step = words.length > 0 ? span / words.length : 0;
      return {
        timeMs: Math.round(cue.startMs),
        endMs: Math.round(cue.endMs),
        parts: [{ part: 0, offset: 0 }],
        freeform: true,
        words: words.map((word, index) => ({
          text: word,
          timeMs: Math.round(cue.startMs + index * step),
          hero: false,
        })),
      };
    });
}

/** A melody of words only, for a source that has no pitch at all. */
export function lyricMelody(lines: MelodyLine[]): MelodyChart {
  return { parts: 1, hasPitch: false, rows: 6, rootMidi: 57, lines, notes: [] };
}
