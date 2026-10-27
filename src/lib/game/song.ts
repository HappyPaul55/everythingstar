/**
 * The **song**: what a library lists and what a band is offered.
 *
 * A song is **not** a track. A track (`track.ts`) is what a run judges — its charts
 * and its melody, in memory. A song is where that comes from: a title, an artist, a
 * length, the art to draw it with, and **what there is to play**. Keeping the two
 * apart is what lets a playlist carry 500 of these and be read to draw a list, while
 * a chart is fetched only when a run actually asks for one.
 *
 * Everything here comes out of a playlist file and is pure: no fetching, no clock.
 */

import { hashString } from "./hash";
import {
  DIFFICULTIES,
  INSTRUMENT_KINDS,
  LANE_ROLES,
  VOCAL_DIFFICULTIES,
  type Difficulty,
  type InstrumentKind,
  type LaneRole,
} from "./track";

/**
 * How a song's parts are named in a playlist file.
 *
 * The instrument kinds, plus the two **guitar flavours**: a song can carry a lead
 * and a rhythm guitar, which are two different things to play and one instrument to
 * a band. `vocals` is the voice — a band's one place at the words, whichever way the
 * song's words are played.
 */
export type SongRole =
  | InstrumentKind
  | "lead_guitar"
  | "rhythm_guitar"
  | "vocals";

const SONG_ROLES: SongRole[] = [
  ...INSTRUMENT_KINDS,
  "lead_guitar",
  "rhythm_guitar",
  "vocals",
];

export function isSongRole(value: unknown): value is SongRole {
  return typeof value === "string" && SONG_ROLES.includes(value as SongRole);
}

/** What a role is to a band: a guitar flavour is a guitar, and the voice is `words`. */
export function roleKind(role: SongRole): InstrumentKind | "words" {
  if (role === "lead_guitar" || role === "rhythm_guitar") return "guitar";
  if (role === "vocals") return "words";
  return role;
}

/** The guitar role a song role names, or null for every other part. */
export function laneRoleOf(role: SongRole): LaneRole | null {
  if (role === "lead_guitar") return "lead";
  if (role === "rhythm_guitar") return "rhythm";
  return null;
}

/** The song role a guitar's lane role is called in a playlist or song document. */
export function songRoleFor(role: LaneRole): SongRole {
  return role === "lead" ? "lead_guitar" : "rhythm_guitar";
}

/**
 * The instrument roles a song offers, in the order a band screen shows them: the
 * two guitar flavours before a roleless guitar, then the other instruments. The
 * voice is not an instrument and lives in the offer's own `voice`.
 */
export const SONG_INSTRUMENT_ROLES: SongRole[] = [
  "lead_guitar",
  "rhythm_guitar",
  "guitar",
  ...INSTRUMENT_KINDS.filter((kind) => kind !== "guitar"),
];

export interface SongArtist {
  id: string;
  name: string;
  /** Artwork for the artist, when the playlist has any. */
  art: string | null;
}

export interface SongAlbum {
  id: string;
  name: string;
  year: number | null;
  art: string | null;
}

/** A song's words: the voice, and how many parts it sings in. */
export interface SongVoice {
  /** `vocals` carries pitch and is sung; `lyrics` is words only, and is typed. */
  chartType: "vocals" | "lyrics";
  /** 1 is a solo, 2 a duet — the **song's** fact, never a count of players. */
  parts: number;
}

/** One thing a song has to play, and how hard it can be played. */
export interface SongInstrument {
  kind: InstrumentKind;
  /**
   * Which guitar part this is, when the song names one. A lead and a rhythm
   * guitar are **two entries** of the same kind, because they are two seats with
   * their own charts.
   */
  role?: LaneRole;
  difficulties: Difficulty[];
}

/**
 * What a song offers a band. `instruments` normally holds one entry per kind — a
 * guitar, a bass, drums — but a guitar may appear **twice**, once as the lead and
 * once as the rhythm, because a seat binds to the role as well as the instrument.
 * The two entries carry their own difficulties, exactly as their charts do.
 */
export interface SongOffer {
  instruments: SongInstrument[];
  /** Null on an instrumental. */
  voice: SongVoice | null;
}

/** Where a song's backdrop comes from. Absent means a blank stage. */
export type SongVideo =
  | { kind: "youtube"; id: string }
  | { kind: "video"; url: string };

/**
 * One song, as the library knows it.
 *
 * All URLs are **absolute** by the time a song exists: a playlist's relative paths
 * are resolved against the playlist's own URL as it is read, so nothing downstream
 * has to know where a file came from.
 */
export interface Song {
  id: string;
  title: string;
  artist: SongArtist;
  album: SongAlbum | null;
  /** The song's own art. Absent falls back to the album's, then the artist's. */
  art: string | null;
  /** The colour for a song with no art at all: its tile is drawn in it. */
  accent: string | null;
  durationMs: number;
  /** Where a preview of it should start. */
  previewStartMs: number;
  offer: SongOffer;
  video: SongVideo | null;
  /** The song's own document, absolute. */
  doc: string;
  /** The playlist it came from, absolute — what the dialog groups by. */
  from: string;
  /**
   * A fingerprint of the playlist entry that named this song. A summary that
   * changes in place is a different revision, so its cached document and charts
   * are fetched again rather than trusting the old copy.
   */
  revision: string;
  /** The seed the simulated players use, from the id, so it is the same everywhere. */
  seed: number;
}

/** The song with this id, or null. A library is what ids are looked up in. */
export function songForId(songs: readonly Song[], id: string): Song | null {
  return songs.find((song) => song.id === id) ?? null;
}

/** Does this song have words at all? */
export function songWords(song: Pick<Song, "offer">): boolean {
  return song.offer.voice !== null;
}

/** Do its words carry pitch? (Vocals rather than Lyrics.) */
export function songHasPitch(song: Pick<Song, "offer">): boolean {
  return song.offer.voice?.chartType === "vocals";
}

/** How many parts its melody has: 1 is a solo, 2 a duet. */
export function songParts(song: Pick<Song, "offer">): number {
  return song.offer.voice?.parts ?? 1;
}

/** The guitar roles this song offers for a kind, in the order it offers them. */
export function songRoles(
  song: Pick<Song, "offer">,
  kind: InstrumentKind,
): LaneRole[] {
  const offered = new Set(
    song.offer.instruments
      .filter((instrument) => instrument.kind === kind && instrument.role)
      .map((instrument) => instrument.role as LaneRole),
  );
  return LANE_ROLES.filter((role) => offered.has(role));
}

/**
 * The role a seat takes on this song: the one it asked for when the song carries
 * it, otherwise what the song has — the lead when both roles are there, the only
 * one when there is one, and nothing when the song's guitar is roleless.
 */
export function resolveLaneRole(
  song: Pick<Song, "offer">,
  kind: InstrumentKind,
  role?: LaneRole,
): LaneRole | undefined {
  const roles = songRoles(song, kind);
  if (role !== undefined && roles.includes(role)) return role;
  // A plain guitar part is the lead; it wins over a role the song lists first.
  if (song.offer.instruments.some((entry) => entry.kind === kind && !entry.role)) {
    return undefined;
  }
  return roles[0];
}

/**
 * The difficulties a kind can be played at on this song.
 *
 * A **singer** always carries the three a voice has (`VOCAL_DIFFICULTIES`): singing
 * is never missing, and a level is the microphone's tolerance rather than a chart's.
 * A **typist** has none — a lyrics song is free play. An instrument gets exactly the
 * levels its charts carry, which is why this is asked rather than assumed. A guitar
 * role asks for that role's levels, and a role the song does not carry falls back to
 * what it has, as `resolveLaneRole` says.
 */
export function songDifficulties(
  song: Pick<Song, "offer">,
  kind: InstrumentKind | "words",
  role?: LaneRole,
): Difficulty[] {
  if (kind === "words") return songHasPitch(song) ? VOCAL_DIFFICULTIES : [];
  return songDifficultiesFor(song, kind, role);
}

function songDifficultiesFor(
  song: Pick<Song, "offer">,
  kind: InstrumentKind,
  role?: LaneRole,
): Difficulty[] {
  const roles = songRoles(song, kind);
  const wanted = roles.length > 0 ? resolveLaneRole(song, kind, role) : undefined;
  const carried = new Set<Difficulty>();
  for (const instrument of song.offer.instruments) {
    if (instrument.kind !== kind) continue;
    // A song with a role carries it on the entry: the roleless entry is not a
    // second copy of the same charts.
    if (roles.length > 0 && instrument.role !== wanted) continue;
    for (const difficulty of instrument.difficulties) carried.add(difficulty);
  }
  return DIFFICULTIES.filter((difficulty) => carried.has(difficulty));
}

/** Can anything be played on this kind — and this role — at all? */
export function songHasPart(
  song: Pick<Song, "offer">,
  kind: InstrumentKind | "words",
  role?: LaneRole,
): boolean {
  if (kind === "words") return songWords(song);
  const roles = songRoles(song, kind);
  if (roles.length > 0) {
    const wanted = resolveLaneRole(song, kind, role);
    return song.offer.instruments.some(
      (instrument) => instrument.kind === kind && instrument.role === wanted,
    );
  }
  return song.offer.instruments.some((instrument) => instrument.kind === kind);
}

/**
 * The artwork to draw a song with, nearest first: its own, then its album's, then
 * the artist's — and nothing at all, which the UI answers with a drawn tile.
 */
export function songArt(song: Pick<Song, "art" | "album" | "artist">): string | null {
  return song.art ?? song.album?.art ?? song.artist.art ?? null;
}

/** The seed a song is simulated with, from its id. */
export function seedForId(id: string): number {
  return hashString(id);
}

/**
 * A song's initials, for the tile drawn when it has no art: the first letter of its
 * first two words, so "Nine Lives" is `NL` and "1999 Forever" is `1F`.
 */
export function songInitials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = [...words[0]][0] ?? "?";
  const second = words.length > 1 ? ([...words[1]][0] ?? "") : "";
  return (first + second).toUpperCase();
}
