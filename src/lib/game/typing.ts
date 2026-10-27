import { noteValue } from "./scoring";
import type { MelodyChart } from "./track";

/**
 * Typing a lyric line: one pure engine per typist, so their score is theirs
 * alone. The rules are TypeStar's, which have been through a lot of players —
 * ported rather than reinvented.
 *
 * - **Levels.** Easy is the first letter of each word, normal is the whole word
 *   with punctuation optional, hard is the whole word with punctuation required.
 *   Nothing is case-strict. Normal also **drops diacritics**, so `Café` is typed
 *   `cafe`; hard keeps them, because an accent is part of the spelling rather than
 *   punctuation. Typing has **its own three**, not the four an
 *   instrument's charts can carry: a lyrics song has no levels at all (it is free
 *   play), and nobody types an expert chart.
 * - **Forgiving skips.** A keystroke that cannot continue the current word but
 *   *does* begin a later word jumps ahead: the words passed over are missed (the
 *   chain breaks) and play carries on. The search runs to the end of the line and
 *   then the first word of the next, so skipping the tail of a word — or moving
 *   on to the next line — never traps the player.
 * - **Grace at the edges of a line.** A line opens up to a second early and its
 *   last word stays typeable up to a second into the gap after it, so the dead
 *   air either side of a line is never dead.
 * - **A line opens together.** Only the line's own timing is real, so a player
 *   who races ahead is never blocked part-way through it.
 */

/** What a typist has to do. There is no harder mode than the punctuation. */
export type TypingLevel = "easy" | "normal" | "hard";

/**
 * A lyrics song has no levels — it is free play — so this is what its typists
 * type: the letters, with the punctuation optional.
 */
export const FREE_PLAY: TypingLevel = "normal";

/** How early a line may open, stretching back over the gap before it. */
export const LINE_HEAD_START = 1000;
/** How far a line's last word may be typed into the gap after it. */
export const LINE_CATCH_UP = 1000;
/** How long after a word's own moment it stops being typeable. */
const WORD_GRACE = 600;

export interface TypeWord {
  text: string;
  start: number;
  end: number;
  /** Index into the lines, for the forgiving edges. */
  line: number;
  hero: boolean;
}

export interface TypeLine {
  start: number;
  end: number;
}

export interface TypingConfig {
  words: TypeWord[];
  lines: TypeLine[];
  level: TypingLevel;
}

export type WordResult = "pending" | "hit" | "miss";

export interface TypingState {
  /** The word being typed. */
  pointer: number;
  /** What has been typed of it so far. */
  input: string;
  results: WordResult[];
  correctKeys: number;
  errorKeys: number;
  score: number;
  combo: number;
  bestCombo: number;
  /** How many hero words were hit. A read-out for their cue, never a judging rule. */
  heroHits: number;
  finished: boolean;
}

/**
 * A typist's run that starts at `fromMs` rather than at the top of the song.
 *
 * A practice count-in seeks to the section the player chose, so a run seeded at
 * zero would miss every word before the section on its first advance. The rule
 * is the same one the note runs use: the pointer starts at the first word whose
 * **start is at or after** `fromMs`. A word already under way when the seek
 * landed belongs to the stretch before the section, so it is left behind the
 * pointer and its result stays `pending` — never a hit and never a miss. Only a
 * config with no words at all starts finished.
 */
export function emptyTyping(
  config: Pick<TypingConfig, "words">,
  fromMs = 0,
): TypingState {
  const atMs = Math.max(0, fromMs);
  const start = config.words.findIndex((word) => word.start >= atMs);
  return {
    pointer: start < 0 ? config.words.length : start,
    input: "",
    results: config.words.map(() => "pending"),
    correctKeys: 0,
    errorKeys: 0,
    score: 0,
    combo: 0,
    bestCombo: 0,
    heroHits: 0,
    finished: config.words.length === 0,
  };
}

/** The words one part has to type, in time order, with their line boundaries —
 *  everything the typing engine needs and nothing it does not. */
export function typingConfigFor(
  melody: MelodyChart,
  part: number,
  level: TypingLevel,
): TypingConfig {
  const words: TypeWord[] = [];
  const lines: TypeLine[] = [];
  for (const line of melody.lines) {
    if (!line.parts.some((sung) => sung.part === part)) continue;
    const lineIndex = lines.length;
    line.words.forEach((word, index) => {
      // A word with nothing to type — a lone comma under normal play — is shown
      // but not waited for; otherwise the run can never get past it.
      if (requiredText(word.text, level).length === 0) return;
      words.push({
        text: word.text,
        start: word.timeMs,
        end: line.words[index + 1]?.timeMs ?? line.endMs,
        line: lineIndex,
        hero: word.hero,
      });
    });
    lines.push({ start: line.timeMs, end: line.endMs });
  }
  return { words, lines, level };
}

/**
 * Lower-cased, with punctuation, symbols and **diacritics** dropped: what normal
 * typing wants. Stripping the marks is what makes `Café` typeable on a keyboard
 * that has no `é` — a decomposed `e` + acute and a precomposed `é` both become
 * `e` — and it keeps an accented letter one letter in the target.
 */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\p{M}\p{P}\p{S}]/gu, "");
}

/** The text the player has to type to clear a word. */
export function requiredText(text: string, level: TypingLevel): string {
  if (level === "easy") {
    return Array.from(normalise(text)).slice(0, 1).join("");
  }
  if (level === "normal") return normalise(text);
  // Hard wants the punctuation **and the accents** too — an accent is part of the
  // word's spelling, not punctuation — but never the case. Both sides are NFC, so
  // a source written decomposed and a keyboard's precomposed key are one character.
  return text.normalize("NFC").toLowerCase();
}

/**
 * What one keystroke contributes at a level, or `""` when it contributes nothing.
 * It is the same rule `requiredText` uses, so a key and the word it is typed into
 * cannot disagree about what a character is.
 */
function typedKey(key: string, level: TypingLevel): string {
  if (level === "hard") return key.normalize("NFC").toLowerCase();
  return normalise(key);
}

/**
 * The indices of `text` that count towards the target, so the words can show
 * exactly which characters are still needed. The text is shown as **NFC**: a
 * source written decomposed must not put a combining mark of its own beside the
 * letter it belongs to.
 */
export function typedCharIndices(text: string, level: TypingLevel): number[] {
  const chars = Array.from(text.normalize("NFC"));
  if (level === "easy") {
    const first = chars.findIndex((char) => /[\p{L}\p{N}]/u.test(char));
    return first < 0 ? [] : [first];
  }
  return chars
    .map((char, index) => ({ char, index }))
    .filter(({ char }) =>
      level === "hard" ? !/\s/u.test(char) : /[\p{L}\p{N}]/u.test(char),
    )
    .map(({ index }) => index);
}

/** What each character of a word is doing, for the view to draw it. */
export interface CharState {
  char: string;
  /** Part of the thing that has to be typed. */
  counts: boolean;
  done: boolean;
  /** The next character the player needs. */
  caret: boolean;
}

/**
 * Map what has been typed onto the characters on screen. This is why the
 * comparison is by code point: a word in any script splits the same way, and an
 * unfinished IME composition simply has not arrived yet.
 */
export function typedChars(
  text: string,
  level: TypingLevel,
  input: string,
): CharState[] {
  const indices = typedCharIndices(text, level);
  const typed = Array.from(input).length;
  return Array.from(text.normalize("NFC")).map((char, index) => {
    const at = indices.indexOf(index);
    return {
      char,
      counts: at >= 0,
      done: at >= 0 && at < typed,
      caret: at === typed,
    };
  });
}

/** Whether the word at `index` is the last of its line. */
function endsLine(config: Pick<TypingConfig, "words">, index: number): boolean {
  const word = config.words[index];
  const next = config.words[index + 1];
  return !next || next.line !== word.line;
}

/** The earliest a word may be typed: its whole line opens together, early. */
export function wordOpenMs(
  config: Pick<TypingConfig, "words" | "lines">,
  index: number,
): number {
  const word = config.words[index];
  if (!word) return Number.POSITIVE_INFINITY;
  const line = config.lines[word.line];
  const previous = config.lines[word.line - 1];
  const headStart = (line?.start ?? word.start) - LINE_HEAD_START;
  // Never into the line before it: a long instrumental must not let a player
  // race ahead of the music.
  return Math.max(headStart, previous?.end ?? 0);
}

/** The last moment a word may still be typed. */
export function wordDeadlineMs(
  config: Pick<TypingConfig, "words" | "lines">,
  index: number,
): number {
  const word = config.words[index];
  if (!word) return Number.POSITIVE_INFINITY;
  if (!endsLine(config, index)) return word.end + WORD_GRACE;
  const next = config.lines[word.line + 1];
  const catchUp = (config.lines[word.line]?.end ?? word.end) + LINE_CATCH_UP;
  return next ? Math.min(next.start, catchUp) : catchUp;
}

/**
 * Type one key. Returns the run without the key when the key cannot mean
 * anything — a word not yet open, a key that is not a character, or a finished run.
 *
 * The run is **brought up to the key's own moment first**, exactly as the frame
 * loop would: a word whose deadline has passed is already a miss, so a key cannot
 * finish it after the fact, and a typo cannot skip into a word that has expired.
 */
export function applyTypingKey(
  state: TypingState,
  config: TypingConfig,
  key: string,
  timeMs: number,
): TypingState {
  const current = advanceTyping(state, config, timeMs);
  if (current.finished || current.pointer >= config.words.length) return current;
  if (timeMs < wordOpenMs(config, current.pointer)) return current;

  if (key === "Backspace") {
    return { ...current, input: current.input.slice(0, -1) };
  }
  if (Array.from(key).length !== 1) return current;

  // The key goes through the level's own rule before it meets the word. A key
  // that means nothing there — a full stop when punctuation is optional — is not
  // a wrong answer: it is a key this word has no use for.
  const char = typedKey(key, config.level);
  if (char.length === 0) return current;

  const target = requiredText(config.words[current.pointer].text, config.level);
  // Nothing here is case-strict: Shift is not a wrong answer.
  const typed = current.input + char;

  if (target.startsWith(typed)) {
    if (typed.length >= target.length) {
      const done = finishWord(current, config, current.pointer);
      return { ...done, correctKeys: current.correctKeys + 1 };
    }
    return { ...current, input: typed, correctKeys: current.correctKeys + 1 };
  }

  // Not this word. Does the key begin a later one? Then the player is skipping.
  const skipTo = skipTarget(config, current.pointer, char, timeMs);
  if (skipTo >= 0) {
    let next = current;
    for (let at = current.pointer; at < skipTo; at += 1) next = missed(next, at);
    next = finishWord(next, config, skipTo);
    return { ...next, input: "", errorKeys: current.errorKeys + 1 };
  }

  // A plain typo: the word stands, and the player may try again.
  return { ...current, input: "", errorKeys: current.errorKeys + 1 };
}

/** Where a mistyped key could skip to, or -1 if it begins nothing later. */
function skipTarget(
  config: TypingConfig,
  from: number,
  char: string,
  timeMs: number,
): number {
  const line = config.words[from]?.line ?? 0;
  for (let at = from + 1; at < config.words.length; at += 1) {
    const word = config.words[at];
    if (word.line > line) {
      // The rest of this line, then the **first word of the next one** — which is
      // how a typo at the end of a line still moves the run on rather than trapping
      // the player behind a word that has already gone.
      if (
        word.line === line + 1 &&
        timeMs >= wordOpenMs(config, at) &&
        timeMs < wordDeadlineMs(config, at)
      ) {
        if (requiredText(word.text, config.level).startsWith(char)) return at;
      }
      break;
    }
    if (timeMs < wordOpenMs(config, at)) continue;
    // A word the frame loop has already let go is not a place to skip to: the
    // deadline is the word's, and arriving with a key does not reopen it.
    if (timeMs >= wordDeadlineMs(config, at)) continue;
    if (requiredText(word.text, config.level).startsWith(char)) return at;
  }
  return -1;
}

function finishWord(
  state: TypingState,
  config: TypingConfig,
  index: number,
): TypingState {
  const results = state.results.slice();
  results[index] = "hit";
  const combo = state.combo + 1;
  return {
    ...state,
    results,
    pointer: index + 1,
    input: "",
    combo,
    bestCombo: Math.max(state.bestCombo, combo),
    score: state.score + noteValue(config.words[index].hero, combo - 1),
    heroHits: state.heroHits + (config.words[index].hero ? 1 : 0),
    finished: index + 1 >= config.words.length,
  };
}

function missed(state: TypingState, index: number): TypingState {
  const results = state.results.slice();
  results[index] = "miss";
  return { ...state, results, combo: 0 };
}

/**
 * Move the run on: anything that opened and was never typed in time is a miss.
 */
export function advanceTyping(
  state: TypingState,
  config: TypingConfig,
  timeMs: number,
): TypingState {
  let next = state;
  while (
    next.pointer < config.words.length &&
    timeMs >= wordDeadlineMs(config, next.pointer)
  ) {
    next = missed(next, next.pointer);
    next = { ...next, pointer: next.pointer + 1, input: "" };
  }
  if (next.pointer >= config.words.length && !next.finished) {
    next = { ...next, finished: true };
  }
  return next;
}
