import { describe, expect, test } from "bun:test";
import { groupLyrics, type Syllable } from "./lyricLines";

/** The syllables of the first two lines of "When I'm Gone", as the MIDI has them. */
function whenImGone(): Syllable[] {
  const raw: [number, number, string, number | null, boolean][] = [
    [18693, 200, "There's", 67, true],
    [18930, 200, "a-", 69, false],
    [19168, 200, "no-", 69, false],
    [19470, 200, "ther", 69, false],
    [19830, 200, "world", 69, false],
    [20370, 200, "in-", 69, false],
    [20850, 200, "side", 72, false],
    [20940, 200, "+", 74, false],
    [21360, 200, "of", 72, false],
    [21810, 200, "me", 71, false],
    [21990, 200, "+", 69, false],
    [22565, 200, "That", 69, true],
    [23040, 200, "you", 67, false],
    [23400, 200, "may", 64, false],
    [23730, 200, "ne-", 67, false],
    [24000, 200, "ver", 67, false],
    [24480, 200, "see", 64, false],
  ];
  return raw.map(([timeMs, lengthMs, text, midi, lineStart]) => ({
    timeMs,
    lengthMs,
    text,
    midi,
    lineStart,
  }));
}

describe("groupLyrics", () => {
  test("joins hyphens into words and drops the continuation characters", () => {
    const grouped = groupLyrics(whenImGone(), 0);
    expect(grouped.lines).toHaveLength(2);
    expect(grouped.lines[0].words.map((word) => word.text)).toEqual([
      "There's",
      "another",
      "world",
      "inside",
      "of",
      "me",
    ]);
    expect(grouped.lines[1].words.map((word) => word.text)).toEqual([
      "That",
      "you",
      "may",
      "never",
      "see",
    ]);
  });

  test("a word's moment is its first syllable's", () => {
    const grouped = groupLyrics(whenImGone(), 0);
    expect(grouped.lines[0].words[1].timeMs).toBe(18930);
  });

  test("keeps a note for every syllable, including the ones with no text", () => {
    const grouped = groupLyrics(whenImGone(), 0);
    // Eleven syllables in the first line, the two `+` notes among them.
    expect(grouped.notes).toHaveLength(17);
    const plus = grouped.notes.find((note) => note.timeMs === 20940);
    expect(plus?.text).toBe("");
    expect(plus?.row).not.toBeNull();
  });

  test("the roll is numbered from the lowest note the words actually sing", () => {
    const grouped = groupLyrics(whenImGone(), 0);
    expect(grouped.hasPitch).toBe(true);
    // The words run from E4 (64) to D5 (74): eleven semitones.
    expect(grouped.rows).toBe(11);
    const rows = grouped.notes.map((note) => note.row ?? -1);
    expect(Math.min(...rows)).toBe(0);
    expect(Math.max(...rows)).toBeLessThan(grouped.rows);
  });

  test("a range narrower than the roll is centred in it", () => {
    const syllables: Syllable[] = [
      { timeMs: 0, lengthMs: 200, midi: 60, text: "low", lineStart: true },
      { timeMs: 300, lengthMs: 200, midi: 61, text: "high", lineStart: false },
    ];
    const grouped = groupLyrics(syllables, 0);
    expect(grouped.rows).toBe(6);
    // Two semitones centred in six rows: two below them.
    expect(grouped.rootMidi).toBe(58);
  });

  test("a stream with no pitch is still a melody, centred and unpitched", () => {
    const syllables: Syllable[] = [
      { timeMs: 0, lengthMs: 300, midi: null, text: "hello", lineStart: true },
      { timeMs: 400, lengthMs: 300, midi: null, text: "there", lineStart: false },
    ];
    const grouped = groupLyrics(syllables, 0);
    expect(grouped.hasPitch).toBe(false);
    expect(grouped.notes.every((note) => note.row === null)).toBe(true);
    expect(grouped.lines[0].freeform).toBe(true);
  });

  test("a gap with no continuation marker starts a new word", () => {
    const syllables: Syllable[] = [
      { timeMs: 0, lengthMs: 200, midi: 60, text: "hello", lineStart: true },
      // No trailing hyphen, so this is its own word even though it follows closely.
      { timeMs: 400, lengthMs: 200, midi: 60, text: "there", lineStart: false },
      // A long gap ends the word even though it was left open.
      { timeMs: 6000, lengthMs: 200, midi: 60, text: "world", lineStart: false },
    ];
    const grouped = groupLyrics(syllables, 0);
    expect(grouped.lines.flatMap((line) => line.words.map((word) => word.text))).toEqual([
      "hello",
      "there",
      "world",
    ]);
  });

  test("a part is the part it was handed", () => {
    const grouped = groupLyrics(whenImGone(), 2);
    expect(grouped.lines.every((line) => line.parts[0].part === 2)).toBe(true);
    expect(grouped.notes.every((note) => note.part === 2)).toBe(true);
  });

  test("an explicit word start joins syllables without a hyphen", () => {
    // UltraStar writes "Mon" + "key" as two syllables of one word: no trailing `-`,
    // just a new-word flag on "Mon" and a continuation on "key".
    const syllables: Syllable[] = [
      { timeMs: 0, lengthMs: 200, midi: 60, text: "Code", lineStart: true, wordStart: true },
      { timeMs: 200, lengthMs: 200, midi: 60, text: "Mon", lineStart: false, wordStart: true },
      { timeMs: 400, lengthMs: 200, midi: 62, text: "key", lineStart: false, wordStart: false },
    ];
    const grouped = groupLyrics(syllables, 0);
    expect(grouped.lines[0].words.map((word) => word.text)).toEqual(["Code", "Monkey"]);
  });

  test("a golden syllable makes its whole word a hero", () => {
    const syllables: Syllable[] = [
      { timeMs: 0, lengthMs: 200, midi: 60, text: "gold", lineStart: true, wordStart: true },
      { timeMs: 200, lengthMs: 200, midi: 60, text: "en", lineStart: false, wordStart: false, hero: true },
    ];
    const grouped = groupLyrics(syllables, 0);
    expect(grouped.lines[0].words[0].hero).toBe(true);
    expect(grouped.notes[1].hero).toBe(true);
    expect(grouped.notes[0].hero).toBe(false);
  });
});
