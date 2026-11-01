/**
 * The small rules a source translator shares with its neighbours.
 *
 * Nothing here knows a format. A year is a year whether a `.chart` wrote it in a
 * `[Song]` block or a `.txt` wrote it in a header; the rule that makes it one
 * belongs beside the translators rather than in each of them.
 */

import { resolveUrl } from "../read";
import { MAX_NOTE_LENGTH_MS, MAX_NOTE_TIME_MS } from "../track";

/**
 * Notes the game can actually draw, from whatever a translator produced.
 *
 * The JSON reader bounds its notes as it reads them, but a MIDI, `.chart` or
 * StepMania file goes through its own arithmetic: a pathological tempo map, a
 * truncated length or a hand-edited tick can put a note hundreds of days into the
 * "song". `chartProblems` would then drop the **whole chart** — and the duration,
 * already computed from the same notes, would still be the absurd value. So the
 * translators bound their notes **before** anything reads their length. A hold over
 * the ceiling is clamped (the note is still playable); a start past it is dropped
 * and named.
 */
export function boundNotes<T extends { timeMs: number; lengthMs: number }>(
  notes: readonly T[],
  dropped: (note: T) => void = () => undefined,
): T[] {
  const kept: T[] = [];
  for (const note of notes) {
    if (
      !Number.isFinite(note.timeMs) ||
      note.timeMs < 0 ||
      note.timeMs > MAX_NOTE_TIME_MS
    ) {
      dropped(note);
      continue;
    }
    kept.push(
      note.lengthMs > MAX_NOTE_LENGTH_MS
        ? { ...note, lengthMs: MAX_NOTE_LENGTH_MS }
        : note,
    );
  }
  return kept;
}

/**
 * A file a chart names for itself — UltraStar's `#MP3`, a `.chart`'s
 * `MusicStream`, StepMania's `#MUSIC` — resolved against the chart's own URL.
 *
 * A chart beside its audio names the file relative to itself, and a folder or a URL
 * is what makes that name a path: without a base the name is kept as it was written,
 * which is all a bare file name ever meant.
 */
export function resolveFileRef(ref: string | null, base: string | null): string | null {
  if (!ref) return null;
  if (!base) return ref;
  return resolveUrl(ref, base) ?? ref;
}

/**
 * A release year, or null when the number is not one.
 *
 * The window is deliberately wide — a band's first record and its reunion are
 * both music — and a missing or zero year is "not said" rather than year zero.
 */
export function yearOf(value: number): number | null {
  return Number.isFinite(value) && value > 1000 && value < 3000 ? Math.trunc(value) : null;
}

/**
 * Spans in time order, rounded and made non-negative, with anything overlapping
 * joined into one. A source can mark the same window twice — a section named
 * "fill" and a `[mix 8]` inside it, say — and one window is what that means.
 */
export function mergeSpans(
  spans: readonly { startMs: number; endMs: number }[],
): { startMs: number; endMs: number }[] {
  const sorted = spans
    .map((span) => ({
      startMs: Math.max(0, Math.round(span.startMs)),
      endMs: Math.max(0, Math.round(span.endMs)),
    }))
    .filter((span) => span.endMs > span.startMs)
    .sort((a, b) => a.startMs - b.startMs);
  const merged: { startMs: number; endMs: number }[] = [];
  for (const span of sorted) {
    const last = merged[merged.length - 1];
    if (last && span.startMs < last.endMs) {
      last.endMs = Math.max(last.endMs, span.endMs);
      continue;
    }
    merged.push({ ...span });
  }
  return merged;
}
