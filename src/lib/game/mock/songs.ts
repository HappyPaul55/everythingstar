/**
 * The mock song list — the content behind the default playlist, and nothing else.
 *
 * A jukebox needs a few hundred songs before an index means anything, so the list
 * is **generated**: a handful written by hand for the songs worth naming, then
 * every pairing of two word lists. It is deterministic, so every machine gets the
 * same list, and it is throwaway with the rest of `mock/` — a real playlist replaces
 * it. `files.ts` is what turns it into the documents the game reads.
 *
 * A song declares **what it offers**: whether its words carry pitch, how many parts
 * they are sung in, and **which charts it carries** — which instruments, at which
 * difficulties. A real chart does not come in every difficulty, so one song is Hard
 * and Expert on the guitar and the next is nothing but Easy, and a song may have no
 * instruments at all. What a song never declares is how hard it *is*: difficulty is
 * a chart's, not a song's.
 */

import { DIFFICULTIES, INSTRUMENT_KINDS, type Difficulty, type InstrumentKind } from "../track";
import type { SongChart } from "./track";
import { createRandom, randomInt } from "./random";
import { hashString } from "../hash";
import { slug } from "../text";

/** One song, as the mock's own list knows it. */
export interface MockSong {
  id: string;
  title: string;
  artist: string;
  /** Parts its melody has: 1 is a solo, 2 a duet. The **song's** own property. */
  parts: number;
  /** Whether the words carry pitch (Vocals) or are only words (Lyrics). */
  hasPitch: boolean;
  /** The charts it carries: which instruments, at which difficulties. */
  charts: SongChart[];
  durationMs: number;
  /** The seed its lyrics and charts are built from. */
  seed: number;
}

const MINUTE = 60_000;

type SongFacts = Omit<MockSong, "id" | "seed">;

/** Songs worth naming, so the list opens on a few with names of their own. */
const NAMED: SongFacts[] = [
  {
    title: "Turn the Volume Up",
    artist: "The Everything Star Band",
    parts: 1,
    hasPitch: true,
    // A full band, and a keyboard that only ever turned up in hard and expert.
    charts: [
      { instrument: "guitar", difficulties: ["easy", "normal", "hard"] },
      { instrument: "bass", difficulties: ["easy", "normal", "hard"] },
      { instrument: "drums", difficulties: ["normal", "hard"] },
      { instrument: "keys", difficulties: ["hard", "expert"] },
    ],
    durationMs: 3.5 * MINUTE,
  },
  {
    title: "Two Part Harmony",
    artist: "The Everything Star Band",
    parts: 2,
    hasPitch: true,
    charts: [
      { instrument: "guitar", difficulties: ["easy", "normal", "hard"] },
      { instrument: "bass", difficulties: ["easy", "normal", "hard"] },
      { instrument: "keys", difficulties: ["normal", "hard"] },
    ],
    durationMs: 3 * MINUTE,
  },
  {
    // Words only: a song to type, and nothing to strum.
    title: "Read the Room",
    artist: "Paper Hands",
    parts: 1,
    hasPitch: false,
    charts: [],
    durationMs: 2.5 * MINUTE,
  },
  {
    title: "Nine Lives",
    artist: "Static Bloom",
    parts: 1,
    hasPitch: true,
    // Everything, at every difficulty there is.
    charts: INSTRUMENT_KINDS.map((instrument) => ({
      instrument,
      difficulties: [...DIFFICULTIES],
    })),
    durationMs: 3.75 * MINUTE,
  },
  {
    // One difficulty, and it is the hardest one.
    title: "Hold the Note",
    artist: "Static Bloom",
    parts: 2,
    hasPitch: true,
    charts: [
      { instrument: "guitar", difficulties: ["expert"] },
      { instrument: "keys", difficulties: ["hard", "expert"] },
    ],
    durationMs: 3.25 * MINUTE,
  },
  {
    // Twelve minutes, so the mounted window and the culling get a proper
    // workout at least once in the list.
    title: "The Long Way Round",
    artist: "The Everything Star Band",
    parts: 1,
    hasPitch: true,
    charts: INSTRUMENT_KINDS.map((instrument) => ({
      instrument,
      difficulties: ["easy", "normal", "hard"],
    })),
    durationMs: 12 * MINUTE,
  },
  {
    // One that starts with a digit, so the index's "#" has something to hold —
    // and a guitar that never got beyond easy.
    title: "1999 Forever",
    artist: "Marble Run",
    parts: 1,
    hasPitch: true,
    charts: [
      { instrument: "guitar", difficulties: ["easy"] },
      { instrument: "dance", difficulties: ["easy"] },
    ],
    durationMs: 4 * MINUTE,
  },
];

/** The two halves of a generated title. Twelve of each is a hundred and forty-four. */
const FIRST_WORDS = [
  "Neon",
  "Paper",
  "Static",
  "Midnight",
  "Golden",
  "Broken",
  "Electric",
  "Silver",
  "Velvet",
  "Lonely",
  "Dizzy",
  "Bright",
];

const SECOND_WORDS = [
  "Hearts",
  "Highway",
  "Radio",
  "Fire",
  "Machine",
  "Daylight",
  "Ghosts",
  "Anthem",
  "Weather",
  "Fever",
  "Crown",
  "Signals",
];

const ARTISTS = [
  "Paper Hands",
  "Static Bloom",
  "The Everything Star Band",
  "Velvet Hours",
  "Nine Volt Choir",
  "The Late Show",
  "Marble Run",
  "Hollow Keys",
];

/** The whole list: the named songs, then every pairing of the two word lists. */
export const MOCK_SONGS: MockSong[] = [
  ...NAMED.map((song) => build(song.title, song)),
  ...FIRST_WORDS.flatMap((first) =>
    SECOND_WORDS.map((second) => {
      const title = `${first} ${second}`;
      // Everything the title does not decide is rolled from its own hash, so the
      // same song is the same song on every machine and every reload.
      const random = createRandom(hashString(title));
      return build(title, {
        title,
        artist: ARTISTS[randomInt(random, 0, ARTISTS.length - 1)],
        parts: random() < 0.25 ? 2 : 1,
        hasPitch: random() < 0.7,
        charts: rollCharts(random),
        durationMs: Math.round((2 + random() * 2.5) * MINUTE),
      });
    }),
  ),
];

/**
 * Which charts a generated song carries. A guitar is the common case, a drum kit
 * or a bass most of the time, keys and a dance mat occasionally — and sometimes
 * **no instruments at all**, because a song with no parts to play is a real thing
 * to have in a library (words to type, and a band that cannot join in).
 */
function rollCharts(random: () => number): SongChart[] {
  const carries: Record<InstrumentKind, number> = {
    guitar: 0.82,
    bass: 0.66,
    drums: 0.68,
    keys: 0.24,
    dance: 0.12,
  };
  return INSTRUMENT_KINDS.filter((instrument) => random() < carries[instrument]).map(
    (instrument) => ({ instrument, difficulties: rollDifficulties(random) }),
  );
}

/**
 * The difficulties one instrument has in a generated song. A chart comes as it
 * comes: the lot, the upper half (a part that never had an easy version), the
 * hardest pair, or a single one.
 */
function rollDifficulties(random: () => number): Difficulty[] {
  const roll = random();
  if (roll < 0.38) return ["easy", "normal", "hard"];
  if (roll < 0.58) return [...DIFFICULTIES];
  if (roll < 0.74) return ["normal", "hard"];
  if (roll < 0.88) return ["hard", "expert"];
  if (roll < 0.95) return ["easy"];
  return ["normal"];
}

/** Fill in what a title decides: its id and its seed. */
function build(title: string, song: SongFacts): MockSong {
  const id = slug(title);
  return { ...song, id, seed: hashString(id) };
}

