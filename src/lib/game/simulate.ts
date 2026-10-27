import { hashUnit } from "./hash";
import {
  advanceTyping,
  applyTypingKey,
  requiredText,
  wordDeadlineMs,
  wordOpenMs,
  type TypingConfig,
  type TypingState,
} from "./typing";

/**
 * The automated players: a bot that hits most notes and misses the rest, with a
 * little timing jitter, and one that types the words the same way. Derived from
 * the note's (or word's) own identity and the seed, so the same run always plays
 * out the same way.
 *
 * This is product behaviour, not fixture code. The machine is a controller like
 * any other, so a seat nobody is holding — or one a player handed to the machine
 * — still plays, and a second typist plays itself because one keyboard cannot be
 * two. It gives no shortcut around the judging: a singer's verdict is the same
 * shape a microphone hands back, and the typist types through the real engine.
 */

export interface Verdict {
  hit: boolean;
  /** How late (or early) the note was played, in ms. */
  offsetMs: number;
}

/** How often the bot lands a note. */
export const AUTO_ACCURACY = 0.92;
/**
 * The accuracy of the attract demo's machine player.
 *
 * It is still the same judging path — the perfect run earns its score and its
 * multiplier like any other — but nobody is watching to see the bot fumble.
 */
export const PERFECT_ACCURACY = 1;
/** How far either side of the beat the bot plays. */
const AUTO_JITTER_MS = 85;

/** The bot's verdict for one note. Pure. */
export function autoVerdict(
  note: { id: string },
  seed: number,
  accuracy = AUTO_ACCURACY,
): Verdict {
  const hit = hashUnit(`${seed}:hit:${note.id}`) < accuracy;
  const jitter = (hashUnit(`${seed}:at:${note.id}`) * 2 - 1) * AUTO_JITTER_MS;
  return { hit, offsetMs: Math.round(jitter) };
}

/**
 * The automated typist, as keystrokes: when its word comes round it types the
 * word out (through the real engine, so every difficulty is exercised), and when
 * it is going to miss one it lets the deadline pass. Pure.
 */
export function autoTyping(
  state: TypingState,
  config: TypingConfig,
  seed: number,
  nowMs: number,
  accuracy = AUTO_ACCURACY,
): TypingState {
  const index = state.pointer;
  const word = config.words[index];
  if (!word) return state;
  if (nowMs < wordOpenMs(config, index) || nowMs < word.start) return state;

  if (hashUnit(`${seed}:type:${word.start}`) >= accuracy) {
    // Going to miss it: let the clock run it out.
    return nowMs >= wordDeadlineMs(config, index)
      ? advanceTyping(state, config, nowMs)
      : state;
  }

  let next = state;
  for (const char of requiredText(word.text, config.level)) {
    next = applyTypingKey(next, config, char, nowMs);
  }
  // Nothing took, which should not happen; move past it rather than stall.
  return next.pointer === index
    ? advanceTyping(next, config, wordDeadlineMs(config, index) + 1)
    : next;
}
