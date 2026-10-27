/**
 * The attract demo: what it plays, who it puts on stage, and how long it looks at
 * each thing.
 *
 * An arcade machine left alone plays itself. EverythingStar's version is the game
 * doing the loop a person would: choose a song, choose a band, play it, show the
 * results, go round again. This module is the **decisions** — pure, so the ordering
 * and the arithmetic are unit-tested — and `useAttract` is only the timers and the
 * input that drive it.
 *
 * The demo is not a setting and it never writes anything down. It reads the library
 * the player already has, generates a band for the song in front of it, and leaves
 * the remembered band, the score board and the settings exactly as they were.
 */

import { hashUnit } from "./hash";
import {
  resolveLaneRole,
  songDifficulties,
  songHasPart,
  type Song,
} from "./song";
import type { BandPlan, BandSlot } from "./band/types";
import { INSTRUMENT_KINDS, type InstrumentKind } from "./track";

/** How many lane instruments the arcade band shows off. */
export const ATTRACT_INSTRUMENTS = 3;

/** How many songs it looks at before it settles: the two it stops on and the one it picks. */
export const ATTRACT_STOPS = 3;

/** The idle before a page that is left alone starts playing itself, in ms. */
export const ATTRACT_IDLE_MS = 30_000;

/** A beat for the jukebox's own list to build before the first row is chosen. */
export const ATTRACT_SETTLE_MS = 400;

/** How long it rests on each song it is thinking about. */
export const ATTRACT_HOP_MS = 1_600;

/** How long the chosen song sits in the now-playing slot before the band screen. */
export const ATTRACT_CHOOSE_MS = 1_200;

/** How long the band screen is up. It is a beat, not a feature. */
export const ATTRACT_BAND_MS = 1_000;

/** How long the results stay up before the demo starts again. */
export const ATTRACT_RESULTS_MS = 5_000;

/** How long a load may take before the demo gives up on that song. */
export const ATTRACT_LOAD_LIMIT_MS = 20_000;

/** How long an empty library is waited for before the demo returns to the welcome. */
export const ATTRACT_LIBRARY_LIMIT_MS = 15_000;

export type AttractPlayers = 1 | "band";

/**
 * How the demo should sound.
 *
 * `auto` is the honest default for a page nobody has touched yet: browsers will not
 * let a document make a sound before a gesture, so the demo takes the silent frame
 * clock unless the document has already been activated. `on` is for a kiosk whose
 * browser allows autoplay; `off` is the homepage window.
 */
export type AttractSound = "auto" | "on" | "off";

export interface AttractConfig {
  /** One player for the phone-sized window, a band for the full entry. */
  players: AttractPlayers;
  sound: AttractSound;
  /** Start at once rather than after the idle. The homepage window wants this. */
  demo: boolean;
  /** Keep the stage corner (fullscreen and the dev panel). */
  chrome: boolean;
}

/**
 * Read the demo's options from an address bar's query string.
 *
 * `/arcade` is statically built, so the document cannot vary by query at build time
 * — the island reads it after mount, exactly as `/open` reads its link.
 */
export function readAttractConfig(search: string): AttractConfig {
  const params = new URLSearchParams(search);
  const audience = params.get("players");
  const sound = params.get("sound");
  return {
    players: audience === "1" ? 1 : "band",
    sound:
      sound === "0" || sound === "off"
        ? "off"
        : sound === "1" || sound === "on"
          ? "on"
          : "auto",
    demo: params.get("demo") === "1" || params.get("instant") === "1",
    chrome: params.get("chrome") !== "0",
  };
}

/**
 * Does the demo make sound?
 *
 * A browser's autoplay rule is per document, and a new navigation starts without
 * activation. `auto` therefore takes the silent path unless somebody has already
 * pressed something on this page. `on` is a deliberate kiosk choice.
 */
export function attractSoundOn(config: AttractConfig, hasActivation: boolean): boolean {
  if (config.sound === "off") return false;
  if (config.sound === "on") return true;
  return hasActivation;
}

/**
 * The songs the demo can actually show.
 *
 * A song with no playable part has nothing to put on stage; a local folder can be
 * locked on a later visit; and a package is a large download for a preview. All
 * three are matched by the library's own summary, without fetching a document.
 */
export function playableAttractSongs(songs: readonly Song[]): Song[] {
  return songs.filter((song) => {
    if (song.durationMs <= 0) return false;
    if (isLocalUrl(song.doc) || isPackageUrl(song.doc)) return false;
    return (
      song.offer.voice !== null ||
      song.offer.instruments.some((instrument) => instrument.difficulties.length > 0)
    );
  });
}

/**
 * The songs one pass looks at: a couple to stop on, then the one it picks.
 *
 * Derived from a seed so the sequence is stable for a test and different from one
 * pass to the next. The chosen song is the last one, and every stop is distinct
 * when the library has enough songs.
 */
export interface AttractCycle {
  /** The songs it rests on before settling. */
  hops: Song[];
  /** The one it actually plays. */
  chosen: Song;
}

export function attractCycle(
  songs: readonly Song[],
  seed: number,
  players: AttractPlayers = "band",
): AttractCycle | null {
  const playable = playableAttractSongs(songs);
  if (playable.length === 0) return null;
  // The phone window is one lane, and a lone highway is what fills it. A song
  // with no instrument would leave the melody in the top half and the rest of the
  // frame empty, so the window prefers a song with a lane when one exists.
  const lanes = playable.filter((song) =>
    INSTRUMENT_KINDS.some((kind) => songHasPart(song, kind)),
  );
  // The arcade's whole point is showing the band, so a song with several
  // instruments comes before a voice-only one. A library of only voice-only
  // songs still gets its turn: the filter falls back rather than going empty.
  const bandSongs = playable.filter(
    (song) =>
      new Set(song.offer.instruments.map((instrument) => instrument.kind)).size >= 2,
  );
  const pool =
    players === 1
      ? lanes.length > 0
        ? lanes
        : playable
      : bandSongs.length > 0
        ? bandSongs
        : playable;
  const ordered = pool
    .map((song) => ({ song, order: hashUnit(`${seed}:${song.id}`) }))
    .sort((a, b) => a.order - b.order)
    .map((entry) => entry.song);
  const count = Math.min(ATTRACT_STOPS, ordered.length);
  return {
    hops: ordered.slice(0, Math.max(0, count - 1)),
    chosen: ordered[count - 1] as Song,
  };
}

/**
 * The band the demo puts on stage for a song.
 *
 * One player is the homepage window: a lane instrument, so the stage fills the
 * phone-shaped screen, falling back to the words if the song is voice-only. The
 * arcade version takes up to **three offered instruments**, rotating the choice by
 * the song's seed so different songs show different parts, plus the words when the
 * song has them. A pitched voice is sung; lyrics-only words are typed.
 *
 * Every seat is the **machine**: `{ on: "none" }` is the same "nobody is holding
 * this" a player can choose, so it needs no special case on the stage and it never
 * asks for the microphone.
 */
export function attractBand(
  song: Song,
  players: AttractPlayers,
  seed = song.seed,
): BandPlan {
  const offered = INSTRUMENT_KINDS.filter((kind) => songHasPart(song, kind))
    .map((kind) => instrumentSlot(song, kind))
    .filter((slot): slot is BandSlot => slot !== null);
  const ordered = offered
    .map((slot) => ({ slot, order: hashUnit(`${seed}:${song.id}:${slot.kind}`) }))
    .sort((a, b) => a.order - b.order)
    .map((entry) => entry.slot);

  const slots: BandSlot[] = [];
  if (players === 1) {
    // The phone window is one lane: a lone highway fills it, while the melody
    // alone would only take the top half.
    if (ordered[0]) slots.push(ordered[0]);
    else {
      const words = wordsSlot(song);
      if (words) slots.push(words);
    }
  } else {
    slots.push(...ordered.slice(0, ATTRACT_INSTRUMENTS));
    const words = wordsSlot(song);
    if (words) slots.push(words);
  }
  return { slots };
}

/** One instrument seat, at the hardest chart the song carries for it. */
function instrumentSlot(song: Song, kind: InstrumentKind): BandSlot | null {
  const role = kind === "guitar" ? resolveLaneRole(song, kind) : undefined;
  const difficulties = songDifficulties(song, kind, role);
  if (difficulties.length === 0) return null;
  const difficulty = difficulties[difficulties.length - 1] ?? "normal";
  return {
    kind,
    ...(role ? { role } : {}),
    difficulty,
    controller: { on: "none" },
  };
}

/** The words seat, if the song has words at all. Sung when they carry pitch. */
function wordsSlot(song: Song): BandSlot | null {
  const voice = song.offer.voice;
  if (!voice) return null;
  return {
    kind: "words",
    difficulty: "normal",
    wordsMode: voice.chartType === "vocals" ? "sing" : "type",
    controller: { on: "none" },
  };
}

/** A local folder is a source that may be locked on a later visit. */
function isLocalUrl(url: string): boolean {
  return url.slice(0, "folder:".length) === "folder:";
}

/** A `.sng` is a package, not a small preview request. */
function isPackageUrl(url: string): boolean {
  try {
    return new URL(url).pathname.toLowerCase().endsWith(".sng");
  } catch {
    return false;
  }
}
