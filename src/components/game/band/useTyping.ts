import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { autoTyping } from "../../../lib/game/simulate";
import { notesBaseScore } from "../../../lib/game/scoring";
import {
  advanceTyping,
  applyTypingKey,
  emptyTyping,
  typingConfigFor,
  typingReport,
  type TypingLevel,
  type TypingState,
} from "../../../lib/game/typing";
import type { MelodyChart } from "../../../lib/game/track";
import { publishDue } from "../../../lib/game/publish";
import { useAudio } from "../audio/StageAudio";
import { useRunBoard, type RunIdentity, type RunEntry } from "./RunBoard";
import { useRunMode } from "./RunMode";
import { useStageControls } from "./StageControls";
import { useClock } from "./StageClock";

/** What one word of a part is doing, for the view to draw it. */
export interface WordProgress {
  status: "pending" | "done" | "missed";
  /** What has been typed of it, for the word in hand. */
  input: string;
}

/** What each typist has made of their part, and the words they are reading. */
export interface MelodyTyping {
  /** One per typist, in the order the players were listed. */
  typists: {
    part: number;
    score: number;
    /** What the words this typist has to type pay at ×1. */
    baseScore: number;
    /** How many words their part has. */
    total: number;
    combo: number;
    bestCombo: number;
    hits: number;
    misses: number;
    judged: number;
    /** How many hero words this typist hit; a read-out for their cue. */
    heroHits: number;
    auto: boolean;
  }[];
  /** Per part: what the typist(s) on it have made of each word, by its moment. */
  words: Map<number, WordProgress>[];
}

export interface TypingOptions {
  melody: MelodyChart;
  /** The part each typist takes and their level, in player order. */
  players: { part: number; level: TypingLevel }[];
  /** The band seat each of those typists sits in, so their input can find them. */
  seats: number[];
  seed: number;
  /**
   * The **seat** of the typist who has the keyboard, or `null` when nobody does.
   * The rest type themselves: one keyboard cannot be two typists without two of
   * them. It is a seat rather than an index because the plan owns who types — a
   * machine typist in the lower box must not take the keyboard from the person
   * above it, and a re-seat must not silently swap two people's runs.
   */
  keyboardSeat: number | null;
  /** Who each typist is on the board, in the same order as `players`. */
  identities: RunIdentity[];
}

/** What one typist's word results came to. */
function wordCounts(state: TypingState): { hits: number; misses: number } {
  let hits = 0;
  let misses = 0;
  for (const result of state.results) {
    if (result === "hit") hits += 1;
    else if (result === "miss") misses += 1;
  }
  return { hits, misses };
}

/**
 * The typists' runs: one pure engine each, so every typist keeps their own score
 * and combo — and their own difficulty, since that is a slot's own business now.
 * The judging runs every frame in a ref and is handed to the view on a throttle —
 * and at once when a key lands, so a keystroke is never a frame late.
 */
export function useTyping({
  melody,
  players,
  seats,
  seed,
  keyboardSeat,
  identities,
}: TypingOptions): MelodyTyping {
  const clock = useClock();
  const { timeRef: clockTimeRef, seekSerialRef } = clock;
  const { ports } = useStageControls();
  const { play } = useAudio();
  const board = useRunBoard();
  const { perfect } = useRunMode();
  /**
   * The keyboard typist's place in this region's own list, found by their seat.
   * `-1` when the plan gives the keyboard to nobody, so every typist plays
   * themselves. Deriving it from `seats` rather than trusting a position is what
   * keeps the person who is actually typing attached to their own run.
   */
  const keyboard = keyboardSeat === null ? -1 : seats.indexOf(keyboardSeat);
  /**
   * What the typists *are*, as one string. The region above re-renders on every
   * clock tick, so the array it hands down is a new one every frame: keyed on its
   * identity, the configs would be rebuilt (and the run restarted) every frame, and
   * no word could ever be finished. The key is what matters, not the array.
   */
  const source = players.map((player) => `${player.part}:${player.level}`).join(",");
  const configs = useMemo(
    () =>
      players.map((player) => typingConfigFor(melody, player.part, player.level)),
    [melody, source],
  );
  const baseScores = useMemo(
    () => configs.map((config) => notesBaseScore(config.words)),
    [configs],
  );
  const [, bump] = useState(0);
  // Built once, on the first render: the runs are a buffer the frame loop mutates,
  // not a value to allocate and discard every render.
  const runs = useRef<TypingState[] | null>(null);
  runs.current ??= configs.map((config) => emptyTyping(config, clockTimeRef.current));
  const published = useRef(0);
  /** Whether a run has changed since it was last handed to React. */
  const dirty = useRef(false);
  /**
   * The seek serial this run was last reset for. Initialised **during render**
   * rather than in an effect, so a seek `StageDirector` makes between this render
   * and the first frame is still seen as a change.
   */
  const lastSeek = useRef(seekSerialRef.current);
  /**
   * Every typist's current state, written to the board. Rebuilt every render so a
   * changed label or slot is picked up, and read through a ref by the flush so the
   * callbacks stay registered once.
   */
  const reportRef = useRef<() => void>(() => {});
  reportRef.current = () => {
    const states = runs.current ?? [];
    states.forEach((state, index) => {
      const identity = identities[index];
      if (!identity) return;
      const counts = wordCounts(state);
      const entry: RunEntry = {
        ...identity,
        score: state.score,
        baseScore: baseScores[index] ?? 0,
        total: configs[index]?.words.length ?? 0,
        combo: state.combo,
        bestCombo: state.bestCombo,
        hits: counts.hits,
        misses: counts.misses,
        judged: counts.hits + counts.misses,
        heroHits: state.heroHits,
        unit: "words",
        // A seat the machine types is not a typing report: its keys land inside one
        // frame, and the span floor turns a long word into hundreds of words a
        // minute. Only the person with the keyboard is measured.
        typing: keyboard === index ? (typingReport(state) ?? undefined) : undefined,
      };
      board.report(entry);
    });
  };
  /**
   * The last frame, asked for by `RunBoard.flush` just before the screen changes.
   * It writes the board immediately from the same refs the frame loop judges in, so
   * a final word is not lost to a render that may never come.
   */
  const publishNow = useCallback(() => {
    if (dirty.current) {
      published.current = clockTimeRef.current;
      dirty.current = false;
      bump((version) => version + 1);
    }
    reportRef.current();
  }, [clockTimeRef]);

  useEffect(() => board.register(publishNow), [board, publishNow]);

  // A hero word landing is the typists' own small event, taken from the runs so a
  // pair on one part answers as one stage moment. One rise is one cue (a word is a
  // word, however many syllables it has), and a rewind or a new attempt only resets
  // what the effect remembers.
  const heroTotal = (runs.current ?? []).reduce(
    (total, state) => total + state.heroHits,
    0,
  );
  const heroRef = useRef(0);
  useEffect(() => {
    if (heroTotal > heroRef.current) {
      play("sparkle");
    }
    heroRef.current = heroTotal;
  }, [heroTotal, play]);

  // A different melody, part, difficulty or seed starts the typists over, seeded
  // where the clock stands: a practice count-in has already seeked by then.
  useEffect(() => {
    const from = clockTimeRef.current;
    runs.current = configs.map((config) => emptyTyping(config, from));
    lastSeek.current = seekSerialRef.current;
    published.current = 0;
    dirty.current = false;
    bump((version) => version + 1);
    // The board takes the new attempt, not the score the previous one ended on.
    reportRef.current();
  }, [configs, source, seed, clockTimeRef, seekSerialRef]);

  useEffect(() => {
    return clock.subscribe(() => {
      const now = clockTimeRef.current;
      // A deliberate move of the playhead starts the typists over, seeded at the
      // new position — the practice count-in and its loop both arrive this way.
      const reset = seekSerialRef.current !== lastSeek.current;
      if (reset) {
        lastSeek.current = seekSerialRef.current;
        published.current = 0;
        dirty.current = false;
      }
      let changed = false;
      const previous = runs.current ?? [];
      const next = previous.map((state, index) => {
        const config = configs[index];
        if (!config) return state;
        if (reset) return emptyTyping(config, now);
        const advanced = advanceTyping(state, config, now);
        const played =
          index === keyboard
            ? advanced
            : autoTyping(advanced, config, seed + index, now, perfect ? 1 : undefined);
        // The engine hands back the same object when nothing happened, so a frame
        // that judged nothing is not a reason to publish.
        if (played !== state) changed = true;
        return played;
      });
      runs.current = next;
      if (changed) dirty.current = true;

      // A reset is published at once, whatever the throttle says: the view must
      // not keep the score of a run that has just been started over.
      if (reset) {
        published.current = now;
        dirty.current = false;
        bump((version) => version + 1);
        // A reset is a new attempt, and the board must follow it at once rather
        // than keep the previous run's last score.
        reportRef.current();
        return;
      }
      if (
        publishDue({
          now,
          published: published.current,
          durationMs: clock.durationMs,
          playing: clock.playing,
          dirty: dirty.current,
        })
      ) {
        published.current = now;
        dirty.current = false;
        bump((version) => version + 1);
        reportRef.current();
      }
    });
  }, [clock, configs, keyboard, seed, perfect, clockTimeRef, seekSerialRef]);

  useEffect(() => {
    const seat = keyboard >= 0 ? seats[keyboard] : undefined;
    const config = keyboard >= 0 ? configs[keyboard] : undefined;
    if (seat === undefined || !config) return;
    // Characters come straight from the stage route as they are typed — the
    // route has already decided that the stage is moving and that this typist is
    // the one with the keyboard.
    return ports.onChars(seat, ({ char, atMs }) => {
      const current = runs.current;
      if (!current) return;
      const state = current[keyboard];
      const live = configs[keyboard];
      if (!live || !state) return;
      const played = applyTypingKey(state, live, char, atMs);
      if (played === state) return;
      const copy = current.slice();
      copy[keyboard] = played;
      runs.current = copy;
      // A key is published at once, so it is never a frame late — and that counts
      // as the last publish, so the throttle starts again from here.
      published.current = clockTimeRef.current;
      dirty.current = false;
      bump((version) => version + 1);
      // The board takes the keystroke's result now, just as the view does.
      reportRef.current();
      // The typist's own feedback, and it is three comparisons rather than a new
      // seam: the engine counts **error keys**, and it moves its **pointer** when a
      // word is finished — so a key that lands, a key that was wrong, and a word
      // completed are all told apart rather than guessed at.
      if (played.errorKeys > state.errorKeys) play("type_miss");
      else play("type_key");
      if (played.pointer > state.pointer) play("type_word");
    });
  }, [ports, seats, configs, keyboard, play]);

  // What the views read. Rebuilt on each render, which the runs above schedule.
  const words: Map<number, WordProgress>[] = Array.from(
    { length: Math.max(1, melody.parts) },
    () => new Map<number, WordProgress>(),
  );
  (runs.current ?? []).forEach((state, index) => {
    const config = configs[index];
    if (!config) return;
    const map = words[players[index]?.part ?? 0] ?? words[0];
    config.words.forEach((word, at) => {
      const result = state.results[at];
      const status: WordProgress["status"] =
        result === "hit" ? "done" : result === "miss" ? "missed" : "pending";
      const existing = map.get(word.start);
      // The furthest typist on a shared part is the one the words show.
      if (!existing || (existing.status === "pending" && status !== "pending")) {
        map.set(word.start, {
          status,
          input: at === state.pointer ? state.input : "",
        });
      }
    });
  });

  return {
    typists: (runs.current ?? []).map((state, index) => {
      const counts = wordCounts(state);
      return {
        part: players[index]?.part ?? 0,
        score: state.score,
        baseScore: baseScores[index] ?? 0,
        total: configs[index]?.words.length ?? 0,
        combo: state.combo,
        bestCombo: state.bestCombo,
        hits: counts.hits,
        misses: counts.misses,
        judged: counts.hits + counts.misses,
        heroHits: state.heroHits,
        auto: index !== keyboard,
      };
    }),
    words,
  };
}
