/**
 * How long a song is, when the file does not say.
 *
 * Plenty of charts never state a length — some early charts have no
 * `song_length` in their `song.ini` at all, and a MIDI has nowhere to put one — so
 * the answer has to come from the notes themselves: the last thing that sounds, plus
 * a tail for the noise after it. A stated length always wins; this is only the
 * fallback, and it is better than a song that reads `0:00` in the jukebox.
 */

import type { LaneChart, MelodyChart } from "../track";

/** The silence kept after the last note, so a run does not end on its final beat. */
export const SONG_TAIL_MS = 3000;

/** How long the notes run, end to end. */
export function contentDuration(
  lanes: readonly LaneChart[],
  melody: MelodyChart | null,
): number {
  let end = 0;
  for (const chart of lanes) {
    for (const note of chart.notes) end = Math.max(end, note.timeMs + note.lengthMs);
  }
  for (const line of melody?.lines ?? []) end = Math.max(end, line.endMs);
  return end;
}
