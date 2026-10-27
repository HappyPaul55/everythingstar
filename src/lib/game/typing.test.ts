import { describe, expect, test } from "bun:test";
import {
  LINE_CATCH_UP,
  LINE_HEAD_START,
  advanceTyping,
  applyTypingKey,
  emptyTyping,
  normalise,
  requiredText,
  typedCharIndices,
  typedChars,
  typingConfigFor,
  wordDeadlineMs,
  wordOpenMs,
  type TypingConfig,
  type TypingLevel,
  type TypingState,
} from "./typing";
import type { MelodyChart } from "./track";

/** A melody with two lines, so the edges between them can be tested exactly. */
const MELODY: MelodyChart = {
  parts: 1,
  hasPitch: true,
  rows: 6,
  rootMidi: 57,
  notes: [],
  lines: [
    {
      timeMs: 1000,
      endMs: 2000,
      parts: [{ part: 0, offset: 0 }],
      freeform: false,
      words: [
        { text: "bring", timeMs: 1000, hero: false },
        { text: "the", timeMs: 1400, hero: false },
        { text: "roof", timeMs: 1700, hero: false },
      ],
    },
    {
      timeMs: 3000,
      endMs: 3600,
      parts: [{ part: 0, offset: 0 }],
      freeform: false,
      words: [{ text: "down", timeMs: 3000, hero: false }],
    },
  ],
};

const CONFIG = typingConfigFor(MELODY, 0, "normal");

/** Type a string of characters, one key at a time. */
function type(state: TypingState, config: TypingConfig, keys: string, timeMs: number) {
  return Array.from(keys).reduce(
    (next, key) => applyTypingKey(next, config, key, timeMs),
    state,
  );
}

/** One word on its own, so an accent can be tested without the fixture's lines. */
function wordConfig(text: string, level: TypingLevel): TypingConfig {
  return {
    words: [{ text, start: 0, end: 1000, line: 0, hero: false }],
    lines: [{ start: 0, end: 1000 }],
    level,
  };
}

describe("what a difficulty asks for", () => {
  test("easy wants the first letter of each word", () => {
    expect(requiredText("Straight", "easy")).toBe("s");
    expect(requiredText("'Cause", "easy")).toBe("c");
  });

  test("normal wants the letters, punctuation optional", () => {
    expect(requiredText("don't", "normal")).toBe("dont");
    expect(requiredText("Hey!", "normal")).toBe("hey");
  });

  test("hard wants the punctuation too, but never the case", () => {
    expect(requiredText("don't", "hard")).toBe("don't");
    expect(requiredText("Hey!", "hard")).toBe("hey!");
  });

  test("normalise drops case, punctuation and apostrophes", () => {
    expect(normalise("Don't stop!")).toBe("dont stop");
  });

  test("which characters count is what the words are drawn from", () => {
    expect(typedCharIndices("don't", "normal")).toEqual([0, 1, 2, 4]);
    expect(typedCharIndices("don't", "hard")).toEqual([0, 1, 2, 3, 4]);
    expect(typedCharIndices("don't", "easy")).toEqual([0]);
  });
});

describe("typedChars", () => {
  test("marks what is done, what is next, and what does not count", () => {
    const chars = typedChars("don't", "normal", "don");
    expect(chars.map((char) => char.char).join("")).toBe("don't");
    expect(chars[0]).toMatchObject({ done: true, counts: true, caret: false });
    expect(chars[3]).toMatchObject({ char: "'", counts: false });
    expect(chars[4]).toMatchObject({ caret: true, done: false });
  });

  test("splits by code point, so any script works the same way", () => {
    const chars = typedChars("さくら", "hard", "さ");
    expect(chars).toHaveLength(3);
    expect(chars[0].done).toBe(true);
    expect(chars[1].caret).toBe(true);
  });
});

describe("accented words", () => {
  test("normal drops the accent, so a plain keyboard can type the word", () => {
    expect(requiredText("Café", "normal")).toBe("cafe");
    expect(requiredText("Zürich", "normal")).toBe("zurich");
    // Easy is the first letter, accent or not.
    expect(requiredText("Écoute", "easy")).toBe("e");
  });

  test("either the letter or the accented letter completes the word", () => {
    const config = wordConfig("Café", "normal");
    const plain = type(emptyTyping(config), config, "cafe", 0);
    const accented = type(emptyTyping(config), config, "café", 0);
    expect(plain.results[0]).toBe("hit");
    expect(accented.results[0]).toBe("hit");
    expect(accented.score).toBe(plain.score);
    expect(accented.combo).toBe(plain.combo);
    expect(plain.errorKeys).toBe(0);
    expect(accented.errorKeys).toBe(0);
  });

  test("a punctuation key that means nothing is not a wrong answer", () => {
    const config = wordConfig("Café", "normal");
    const half = type(emptyTyping(config), config, "caf", 0);
    const punctuated = applyTypingKey(half, config, ".", 0);
    expect(punctuated).toBe(half);
    expect(punctuated.errorKeys).toBe(0);
  });

  test("hard keeps the accent, and either way of writing it compares equal", () => {
    const composed = wordConfig("Café", "hard");
    const decomposed = wordConfig("Cafe\u0301", "hard");
    const typed = type(emptyTyping(composed), composed, "café", 0);
    const other = type(emptyTyping(decomposed), decomposed, "café", 0);
    expect(typed.results[0]).toBe("hit");
    expect(other.results[0]).toBe("hit");
    // Hard is the strict level: the accent is part of the word, not punctuation.
    const unaccented = type(emptyTyping(composed), composed, "cafe", 0);
    expect(unaccented.results[0]).toBe("pending");
    expect(unaccented.errorKeys).toBe(1);
  });

  test("the caret is after the last letter, never on a combining mark", () => {
    const chars = typedChars("Cafe\u0301", "normal", "cafe");
    expect(chars).toHaveLength(4);
    expect(chars.map((char) => char.char).join("")).toBe("Café");
    expect(chars.every((char) => char.done)).toBe(true);
    expect(chars.some((char) => char.caret)).toBe(false);
    const three = typedChars("Café", "normal", "caf");
    expect(three[3]).toMatchObject({ caret: true, done: false });
  });
});

describe("typing a line", () => {
  test("a word typed out is a hit, and moves on", () => {
    const done = type(emptyTyping(CONFIG), CONFIG, "bring", 1900);
    expect(done.results[0]).toBe("hit");
    expect(done.pointer).toBe(1);
    expect(done.score).toBeGreaterThan(0);
  });

  test("case is never a wrong answer", () => {
    const done = type(emptyTyping(CONFIG), CONFIG, "BRING", 1900);
    expect(done.results[0]).toBe("hit");
  });

  test("a punctuation-only word is not a word to type", () => {
    const punctuation: MelodyChart = {
      ...MELODY,
      lines: [
        {
          ...MELODY.lines[0],
          words: [
            { text: "bring", timeMs: 1000, hero: false },
            { text: ",", timeMs: 1500, hero: false },
            { text: "roof", timeMs: 1700, hero: false },
          ],
        },
      ],
    };
    const config = typingConfigFor(punctuation, 0, "normal");
    expect(config.words.map((word) => word.text)).toEqual(["bring", "roof"]);
  });

  test("a hero word is worth five times as much", () => {
    const plain = type(emptyTyping(CONFIG), CONFIG, "bring", 1900);
    const heroConfig: TypingConfig = {
      ...CONFIG,
      words: CONFIG.words.map((word, index) => ({ ...word, hero: index === 0 })),
    };
    const hero = type(emptyTyping(heroConfig), heroConfig, "bring", 1900);
    expect(hero.score).toBe(plain.score * 5);
    expect(plain.heroHits).toBe(0);
    expect(hero.heroHits).toBe(1);
  });

  test("a hero word skipped onto is still a hero hit", () => {
    // "r" skips to "roof"; make that word the hero and the skipped one is a miss.
    const heroConfig: TypingConfig = {
      ...CONFIG,
      words: CONFIG.words.map((word, index) => ({ ...word, hero: index === 2 })),
    };
    const skipped = applyTypingKey(emptyTyping(heroConfig), heroConfig, "r", 1900);
    expect(skipped.results[2]).toBe("hit");
    expect(skipped.heroHits).toBe(1);
  });

  test("a partial word keeps the characters typed", () => {
    const half = applyTypingKey(emptyTyping(CONFIG), CONFIG, "b", 1900);
    expect(half.input).toBe("b");
    expect(half.pointer).toBe(0);
    expect(half.results[0]).toBe("pending");
  });

  test("backspace takes the last character back", () => {
    const typed = applyTypingKey(emptyTyping(CONFIG), CONFIG, "b", 1900);
    const undone = applyTypingKey(typed, CONFIG, "Backspace", 1900);
    expect(undone.input).toBe("");
    expect(undone.results[0]).toBe("pending");
  });

  test("a wrong key that begins nothing is just a typo, and can be retried", () => {
    const typo = applyTypingKey(emptyTyping(CONFIG), CONFIG, "z", 1900);
    expect(typo.errorKeys).toBe(1);
    expect(typo.input).toBe("");
    expect(typo.results[0]).toBe("pending");
  });
});

describe("forgiving skips", () => {
  test("a key that begins a later word jumps ahead, missing what it passed", () => {
    // "r" cannot continue "bring", but it begins "roof" later on the line.
    const skipped = applyTypingKey(emptyTyping(CONFIG), CONFIG, "r", 1900);
    expect(skipped.pointer).toBe(3);
    expect(skipped.results[0]).toBe("miss");
    expect(skipped.results[1]).toBe("miss");
    expect(skipped.results[2]).toBe("hit");
    expect(skipped.combo).toBe(1);
    expect(skipped.errorKeys).toBe(1);
  });

  test("a key that begins the next line is not trapped behind this one", () => {
    // The line after "bring the roof" opens a second early, and "d" begins "down".
    // It is exactly 2000: the line's own edge, where the next one opens.
    const skipped = applyTypingKey(emptyTyping(CONFIG), CONFIG, "d", 2000);
    expect(skipped.pointer).toBe(4);
    expect(skipped.results.slice(0, 3)).toEqual(["miss", "miss", "miss"]);
    expect(skipped.results[3]).toBe("hit");
    expect(skipped.combo).toBe(1);
    expect(skipped.errorKeys).toBe(1);
  });
});

describe("the edges of a line", () => {
  test("a line opens early, so dead air is never dead", () => {
    expect(wordOpenMs(CONFIG, 0)).toBe(CONFIG.lines[0].start - LINE_HEAD_START);
  });

  test("a line never opens into the one before it", () => {
    const firstOfSecond = CONFIG.words.findIndex((word) => word.line === 1);
    expect(wordOpenMs(CONFIG, firstOfSecond)).toBeGreaterThanOrEqual(
      CONFIG.lines[0].end,
    );
  });

  test("the last word of a line may be caught up into the gap after it", () => {
    expect(wordDeadlineMs(CONFIG, 2)).toBe(
      Math.min(CONFIG.lines[1].start, CONFIG.lines[0].end + LINE_CATCH_UP),
    );
  });

  test("a word in the middle of a line just gets its grace", () => {
    expect(wordDeadlineMs(CONFIG, 0)).toBe(CONFIG.words[0].end + 600);
  });

  test("a word typed before its line opens is ignored", () => {
    const early = applyTypingKey(
      emptyTyping(CONFIG),
      CONFIG,
      "b",
      CONFIG.lines[0].start - LINE_HEAD_START - 1,
    );
    expect(early).toEqual(emptyTyping(CONFIG));
  });
});

describe("emptyTyping at a seek point", () => {
  test("starts at the first word at or after the seek, judging none before it", () => {
    const seeded = emptyTyping(CONFIG, 2500);
    // "bring", "the" and "roof" all start before 2500; "down" starts at 3000.
    expect(seeded.pointer).toBe(3);
    expect(seeded.results).toEqual(["pending", "pending", "pending", "pending"]);
    expect(seeded.input).toBe("");
    expect(seeded.finished).toBe(false);

    const advanced = advanceTyping(seeded, CONFIG, 3000);
    expect(advanced.results).toEqual(["pending", "pending", "pending", "pending"]);
    expect(advanced.pointer).toBe(3);
  });

  test("only the words after the seek can be missed", () => {
    const seeded = emptyTyping(CONFIG, 2500);
    const advanced = advanceTyping(seeded, CONFIG, 20_000);
    expect(advanced.results.slice(0, 3)).toEqual(["pending", "pending", "pending"]);
    expect(advanced.results[3]).toBe("miss");
    expect(advanced.finished).toBe(true);
  });

  test("a word exactly at the seek point is still typeable", () => {
    const seeded = emptyTyping(CONFIG, 3000);
    expect(seeded.pointer).toBe(3);
    expect(type(seeded, CONFIG, "down", 3000).results[3]).toBe("hit");
  });

  test("a word begun before the seek is not restarted", () => {
    // 1500 lands mid-line: "bring" and "the" are behind the pointer, "roof" is next.
    expect(emptyTyping(CONFIG, 1500).pointer).toBe(2);
  });

  test("seeding at zero is the ordinary empty run", () => {
    expect(emptyTyping(CONFIG, 0)).toEqual(emptyTyping(CONFIG));
    expect(emptyTyping(CONFIG).pointer).toBe(0);
  });
});

describe("advanceTyping", () => {
  test("a word let past its deadline is a miss, and breaks the chain", () => {
    const run = advanceTyping(emptyTyping(CONFIG), CONFIG, 20_000);
    expect(run.results[0]).toBe("miss");
    expect(run.combo).toBe(0);
    expect(run.pointer).toBe(CONFIG.words.length);
    expect(run.finished).toBe(true);
  });

  test("nothing is missed while it can still be typed", () => {
    const run = advanceTyping(emptyTyping(CONFIG), CONFIG, CONFIG.words[0].start);
    expect(run.results[0]).toBe("pending");
    expect(run.pointer).toBe(0);
  });
});

describe("a key arrives between frames", () => {
  const config = wordConfig("cafe", "normal");

  test("a key past the deadline cannot finish the word", () => {
    const deadline = wordDeadlineMs(config, 0);
    const late = type(emptyTyping(config), config, "cafe", deadline + 1);
    expect(late.results[0]).toBe("miss");
    expect(late.finished).toBe(true);
    expect(late.score).toBe(0);
  });

  test("the deadline itself is already too late, as the frame loop says", () => {
    const deadline = wordDeadlineMs(config, 0);
    const at = applyTypingKey(emptyTyping(config), config, "c", deadline);
    expect(at.results[0]).toBe("miss");
    expect(at.pointer).toBe(config.words.length);
  });

  test("a typo cannot skip into a word that has expired", () => {
    // Every word in CONFIG is past its deadline, so there is nowhere live to skip
    // to. The key is not a second chance at a word the frame loop has let go.
    const late = applyTypingKey(emptyTyping(CONFIG), CONFIG, "d", 20_000);
    expect(late.results).toEqual(["miss", "miss", "miss", "miss"]);
    expect(late.pointer).toBe(CONFIG.words.length);
    expect(late.finished).toBe(true);
    expect(late.score).toBe(0);
  });

  test("a typo cannot skip into a later word while an earlier one is still live", () => {
    // "beta" ends its line with the next line close behind, so its deadline (1600)
    // comes before "alpha"'s (2000). At 1700 the run is still on "alpha", but "beta"
    // has already gone and a key beginning it is a plain typo, not a skip.
    const config: TypingConfig = {
      words: [
        { text: "alpha", start: 1000, end: 1400, line: 0, hero: false },
        { text: "beta", start: 1400, end: 1500, line: 0, hero: false },
        { text: "gamma", start: 1600, end: 2200, line: 1, hero: false },
      ],
      lines: [
        { start: 1000, end: 1500 },
        { start: 1600, end: 2200 },
      ],
      level: "normal",
    };
    expect(wordDeadlineMs(config, 0)).toBe(2000);
    expect(wordDeadlineMs(config, 1)).toBe(1600);

    const typo = applyTypingKey(emptyTyping(config), config, "b", 1700);
    expect(typo.pointer).toBe(0);
    expect(typo.results[0]).toBe("pending");
    expect(typo.results[1]).toBe("pending");
    expect(typo.errorKeys).toBe(1);
  });
});
