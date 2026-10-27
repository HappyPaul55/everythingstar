/**
 * What a **source** hands back: one file, read into our own format.
 *
 * A source is somebody else's file — a Guitar Hero `notes.mid`, a Clone Hero
 * `.chart`, an UltraStar `.txt`, a karaoke lyric sheet — and a translator is what
 * turns it into the shape the game already judges. Every translator returns the
 * same bundle, so nothing below this line knows where a track came from (the rule
 * `track.ts` states), and the same parser can serve both the offline converter and
 * a song fetched at runtime.
 *
 * Nothing here fetches anything: a translator is given bytes, or text, and the
 * paths a caller found beside them. Loading is the caller's business.
 */

import type { SourceAudio } from "../source";
import type { SongVideo } from "../song";
import type { LaneChart, MelodyChart, TrackSection } from "../track";

/** A song's own identity, as its source states it. */
export interface SourceMeta {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  year: number | null;
  /** How long the song runs, when the source says. Zero when it does not. */
  durationMs: number;
  /** Where a preview should start, in ms. Zero when the source does not say. */
  previewStartMs: number;
  /** The reference the source gave for its art, resolved by the caller. */
  art: string | null;
  video: SongVideo | null;
}

/**
 * Everything one source adds up to.
 *
 * `lanes` is a chart per instrument **and** difficulty (a source may carry one
 * level for the guitar and none for the bass); `melody` is the words, pitched or
 * not, or null when the source has no voice at all. `problems` is anything the
 * translator had to drop or could not make sense of, named — a source that is
 * half-readable is still worth playing.
 */
export interface ParsedSource {
  meta: SourceMeta;
  audio: SourceAudio;
  lanes: LaneChart[];
  melody: MelodyChart | null;
  sections: TrackSection[];
  problems: string[];
}

/** An empty bundle, so a translator only says what it found. */
export function emptySource(id: string, title: string): ParsedSource {
  return {
    meta: {
      id,
      title,
      artist: "",
      album: null,
      year: null,
      durationMs: 0,
      previewStartMs: 0,
      art: null,
      video: null,
    },
    audio: { source: "stems", stems: [], mixPresets: [], preview: null },
    lanes: [],
    melody: null,
    sections: [],
    problems: [],
  };
}

/** The parts a source's audio files can be, in the order we name them. */
export type StemRole =
  | "master"
  | "lead_guitar"
  | "rhythm_guitar"
  | "bass"
  | "drums"
  | "drums_2"
  | "drums_3"
  | "drums_4"
  | "keys"
  | "vocals"
  | "harmony"
  | "crowd";
