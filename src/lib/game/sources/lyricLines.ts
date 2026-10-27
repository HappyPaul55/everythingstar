/**
 * Syllables into words, and words into lines.
 *
 * A melody in the game is whole **words** the typists type and whole **lines** the
 * views page through, but the sources hand back **syllables**: a lyric event per
 * sung note, split wherever the singer holds. Guitar Hero charts write the
 * split with a trailing hyphen (`a-`, `no-`, `ther`) and a `+` for a note with no
 * characters of its own (a hum or a held vowel). Getting this wrong is the
 * difference between typing "another" and typing "a-no-ther".
 *
 * This is deliberately one module and purely a function of the syllables, because
 * every source that carries words — the MIDI lyric track, a karaoke file, a lyric
 * sheet — ends up here, and the grouping is the fiddliest part of reading any of
 * them.
 */

import type { MelodyLine, MelodyNote } from "../track";

/** One syllable as a source gives it: a sung note, its text, and where it starts. */
export interface Syllable {
  timeMs: number;
  lengthMs: number;
  /** The absolute MIDI pitch, or null for a spoken (freeform) syllable. */
  midi: number | null;
  /** The text exactly as the file wrote it — may end in `-`, or be `+`. */
  text: string;
  /** The source marks a new lyric line here (the phrase note, usually 105). */
  lineStart: boolean;
  /**
   * The source says whether this syllable **starts a word** rather than leaving it
   * to a trailing hyphen. UltraStar writes a new word with a leading space and a
   * continuation with a leading `~`, so its `-` is punctuation rather than a join.
   * Absent means the Guitar Hero convention (`a-` + `ther`).
   */
  wordStart?: boolean;
  /** A golden note: the word is a hero, worth `HERO_MULTIPLE`. */
  hero?: boolean;
}

export interface GroupedLyrics {
  lines: MelodyLine[];
  notes: Omit<MelodyNote, "id">[];
  /** The MIDI note row 0 sounds. */
  rootMidi: number;
  /** How many rows the roll has. */
  rows: number;
  /** Whether any of the words carry pitch at all. */
  hasPitch: boolean;
  problems: string[];
}

/** A gap longer than this with no continuation marker is a new word. */
const WORD_GAP_MS = 1500;
/** A gap longer than this with no line marker is a new line. */
const LINE_GAP_MS = 1500;
/** The roll never has fewer rows than this, so a narrow song still has a roll. */
const MIN_ROWS = 6;

export interface GroupOptions {
  /** How far up the roll starts, so a range narrower than `MIN_ROWS` is centred. */
  minRows?: number;
  /**
   * Fixed roll boundaries, so several parts of one song share one roll. A trio
   * whose parts sit in different octaves must still be drawn on the same rows.
   */
  rootMidi?: number;
  rows?: number;
}

/**
 * Group one part's syllables into the words and lines the game reads.
 *
 * `part` is which voice this stream belongs to. The pitch roll's range is taken
 * from the syllables themselves — a row is a semitone, so the words are placed
 * against the lowest note they actually sing — and a song whose words carry no
 * pitch at all still comes back as a melody, just one with no rows to draw.
 */
export function groupLyrics(
  syllables: readonly Syllable[],
  part: number,
  options: GroupOptions = {},
): GroupedLyrics {
  const problems: string[] = [];
  const minRows = Math.max(1, Math.trunc(options.minRows ?? MIN_ROWS));
  const ordered = [...syllables].sort((a, b) => a.timeMs - b.timeMs);

  const words = splitWords(ordered);
  const pitched = ordered.filter(
    (syllable): syllable is Syllable & { midi: number } => syllable.midi !== null,
  );
  const hasPitch = pitched.length > 0;

  let rootMidi = options.rootMidi ?? 57;
  let rows = options.rows ?? minRows;
  if (hasPitch) {
    const pitches = pitched.map((syllable) => syllable.midi);
    const low = Math.min(...pitches);
    const high = Math.max(...pitches);
    if (options.rootMidi !== undefined) {
      // A roll shared across parts: keep its floor and grow it to fit this part.
      rows = Math.max(rows, high - rootMidi + 1);
    } else {
      const span = Math.max(1, high - low + 1);
      if (span < minRows) {
        // Centre a narrow range in the roll rather than pinning it to the floor.
        rootMidi = low - Math.floor((minRows - span) / 2);
        rows = minRows;
      } else {
        rootMidi = low;
        rows = span;
      }
    }
  }

  const lines: MelodyLine[] = [];
  const notes: Omit<MelodyNote, "id">[] = [];
  for (const lineWord of splitLines(words)) {
    const firstWord = lineWord[0];
    const lastWord = lineWord[lineWord.length - 1];
    const first = firstWord.syllables[0];
    const words_ = lineWord
      // A word of no characters (a `+` note on its own) is a note, not something to
      // type, so it stays off the line's words and on the roll's notes.
      .filter((word) => word.text !== "")
      .map((word) => ({
        text: word.text,
        timeMs: Math.round(word.syllables[0].timeMs),
        hero: word.hero,
      }));
    const freeform = lineWord
      .flatMap((word) => word.syllables)
      .every((syllable) => syllable.midi === null);
    lines.push({
      timeMs: Math.round(first.timeMs),
      endMs: Math.round(
        Math.max(...lastWord.syllables.map((syllable) => syllable.timeMs + syllable.lengthMs)),
      ),
      parts: [{ part, offset: 0 }],
      freeform,
      words: words_,
    });
    for (const word of lineWord) {
      for (const syllable of word.syllables) {
        notes.push({
          timeMs: Math.round(syllable.timeMs),
          lengthMs: Math.max(0, Math.round(syllable.lengthMs)),
          part,
          row: hasPitch && syllable.midi !== null ? syllable.midi - rootMidi : null,
          text: syllable.clean,
          hero: syllable.hero === true,
        });
      }
    }
  }

  notes.sort((a, b) => a.timeMs - b.timeMs || a.part - b.part);
  return { lines, notes, rootMidi, rows, hasPitch, problems };
}

/** A syllable with its on-screen characters decided. */
interface CleanSyllable extends Syllable {
  /** The text with any continuation hyphen removed; `""` for a `+` note. */
  clean: string;
}

/** A word: the syllables it is sung across, and what it reads as. */
interface Word {
  syllables: CleanSyllable[];
  text: string;
  hero: boolean;
}

/**
 * Syllables into words.
 *
 * A trailing `-` says the next syllable continues this word; a `+` (or an empty
 * lyric) is a note with no characters that carries the word on; anything else
 * starts a new word. A long gap with no marker starts one too, so a file that never
 * marked its continuations still breaks its words sensibly.
 */
function splitWords(syllables: readonly Syllable[]): Word[] {
  const words: Word[] = [];
  let current: Word | null = null;
  let open = false;
  let lastEnd = Number.NEGATIVE_INFINITY;
  for (const syllable of syllables) {
    const raw = syllable.text.trim();
    const noText = raw === "" || raw === "+";
    // UltraStar decides its own word boundaries, so its trailing `-` is a hyphen
    // somebody sang rather than a continuation marker. Guitar Hero still uses the
    // trailing hyphen, and still gets a gap fallback.
    const explicit = syllable.wordStart !== undefined;
    const clean = noText
      ? ""
      : explicit
        ? raw
        : raw.replace(/-+$/, "");

    if (explicit) {
      if (syllable.wordStart === true && current) {
        words.push(current);
        current = null;
      }
      current ??= { syllables: [], text: "", hero: false };
      current.syllables.push({ ...syllable, clean });
      current.text += clean;
      current.hero ||= syllable.hero === true;
      lastEnd = syllable.timeMs + syllable.lengthMs;
      continue;
    }

    const detached = syllable.timeMs - lastEnd > WORD_GAP_MS;
    // The previous word is finished when it asked for no continuation, when it never
    // got any characters of its own (a lone `+` hum), or when a long gap has ended it
    // whether it asked or not.
    const closes =
      !!current &&
      (!open ||
        (current.text === "" && !noText) ||
        (detached && current.syllables.length > 0));
    if (current && closes) {
      words.push(current);
      current = null;
    }
    current ??= { syllables: [], text: "", hero: false };
    current.syllables.push({ ...syllable, clean });
    current.text += clean;
    current.hero ||= syllable.hero === true;
    // Only a hyphen leaves a word open; a `+` note is characters-less but says
    // nothing about what follows it.
    open = !noText && raw.endsWith("-");
    lastEnd = syllable.timeMs + syllable.lengthMs;
  }
  if (current && current.syllables.length > 0) words.push(current);
  return words;
}

/** Words into lines, at an explicit marker or across a long gap. */
function splitLines(words: readonly Word[]): Word[][] {
  const lines: Word[][] = [];
  let current: Word[] = [];
  let lastEnd = Number.NEGATIVE_INFINITY;
  for (const word of words) {
    const first = word.syllables[0];
    const end = Math.max(
      ...word.syllables.map((syllable) => syllable.timeMs + syllable.lengthMs),
    );
    const breaks =
      current.length > 0 && (first.lineStart || first.timeMs - lastEnd > LINE_GAP_MS);
    if (breaks) {
      lines.push(current);
      current = [];
    }
    current.push(word);
    lastEnd = end;
  }
  if (current.length > 0) lines.push(current);
  return lines;
}
