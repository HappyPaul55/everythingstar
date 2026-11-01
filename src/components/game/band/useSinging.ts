import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { advanceRun, emptyRunFrom, type RunState } from "../../../lib/game/run";
import { notesBaseScore } from "../../../lib/game/scoring";
import {
  VOCAL_TOLERANCE,
  singerVerdict,
  type PitchTrail,
  type SungNote,
} from "../../../lib/game/singing";
import { partNotes, type MelodyNote, type VocalDifficulty } from "../../../lib/game/track";
import { publishDue } from "../../../lib/game/publish";
import { useAudio } from "../audio/StageAudio";
import { useRunBoard, type RunIdentity, type RunEntry } from "./RunBoard";
import { useRunMode } from "./RunMode";
import { useClock } from "./StageClock";

/**
 * The singers' runs: one pure engine each, so every singer keeps their own score,
 * combo and difficulty — and what they are judged *from* is **their own seat**.
 *
 * With a microphone listening, a note is judged from the pitch **trail** across its
 * own span (`singing.ts`); with none, the simulator plays it, exactly as it did before
 * there was a way to sing. Which of the two is a **per-singer** question — one
 * microphone is one between the singers, but a seat the machine covers is the
 * machine's however loud the room is (`singerVerdict`). Both arrive as the same
 * verdict, so the run does not know the difference and a refused microphone costs
 * nobody their game.
 *
 * All the runs live here, in one hook, because both the roll and the score rail read
 * them: a note's hit or miss in the roll *is* the singer's own verdict, not a
 * parallel guess at one.
 */

export interface SingerSummary {
  part: number;
  score: number;
  /** What this singer's part pays at ×1. */
  baseScore: number;
  /** How many notes their part has. */
  total: number;
  combo: number;
  bestCombo: number;
  hits: number;
  misses: number;
  judged: number;
  /** How many hero words this singer hit; a read-out for their cue. */
  heroHits: number;
  /** Whether this singer is being heard, or played by the machine. */
  live: boolean;
}

/** One singer: their part, their level, and whether their own seat has a microphone. */
export interface SingingPlayer {
  part: number;
  level: VocalDifficulty;
  /**
   * Whether this seat is sung by a person. The capability comes from the control
   * plan, which is what seats the microphone; a seat without one plays itself.
   */
  live: boolean;
}

export interface MelodySinging {
  /** One per singer, in the order they were listed. */
  singers: SingerSummary[];
  /** What each note came to, by its id — what the roll draws. */
  verdicts: Map<string, SungNote>;
}

export interface SingingOptions {
  notes: readonly MelodyNote[];
  /** The part each singer takes, the level they are listened at, and their seat. */
  players: SingingPlayer[];
  rootMidi: number;
  seed: number;
  /** The microphone's recent pitch, or `null` while it is not listening. */
  trail: PitchTrail | null;
  /** Who each singer is on the board, in the same order as `players`. */
  identities: RunIdentity[];
}

export function useSinging({
  notes,
  players,
  rootMidi,
  seed,
  trail,
  identities,
}: SingingOptions): MelodySinging {
  const clock = useClock();
  const { timeRef: clockTimeRef, seekSerialRef } = clock;
  const board = useRunBoard();
  const { perfect } = useRunMode();
  const { play } = useAudio();
  const source = players.map((player) => `${player.part}:${player.level}`).join(",");
  const parts = useMemo(
    () => players.map((player) => partNotes(notes, player.part)),
    [notes, source],
  );
  const baseScores = useMemo(
    () => parts.map((part) => notesBaseScore(part)),
    [parts],
  );
  // The runs and verdicts are built once, on the first render: they are buffers
  // the frame loop mutates, not values to allocate and discard every render.
  const runs = useRef<RunState[] | null>(null);
  runs.current ??= parts.map((part) => emptyRunFrom(part, clockTimeRef.current));
  const verdicts = useRef<Map<string, SungNote> | null>(null);
  verdicts.current ??= new Map();
  const published = useRef(0);
  /** Whether a run or a verdict has changed since the last publish. */
  const dirty = useRef(false);
  /**
   * The seek serial this run was last reset for. Initialised **during render**
   * rather than in an effect, so a seek `StageDirector` makes between this render
   * and the first frame is still seen as a change.
   */
  const lastSeek = useRef(seekSerialRef.current);
  const [, bump] = useState(0);
  /**
   * The latest players, read by the frame loop **through a ref**: the caller builds
   * that array every render, and a run must not re-subscribe (or start over) because
   * the roll re-rendered. What a seat is judged from can change mid-song — a
   * microphone opening, permission being granted — and that is a change of *how* the
   * next note is judged, not a reason to reset anybody's run.
   */
  const playersRef = useRef(players);
  playersRef.current = players;
  /** Whether a trail is being recorded at all; a seat still needs its own microphone. */
  const listening = trail !== null;
  /**
   * Every singer's current state, written to the board. Rebuilt every render so a
   * changed label or level is picked up, and read through a ref by the flush so the
   * callbacks stay registered once.
   */
  const reportRef = useRef<() => void>(() => {});
  reportRef.current = () => {
    const states = runs.current ?? [];
    states.forEach((state, index) => {
      const identity = identities[index];
      if (!identity) return;
      const entry: RunEntry = {
        ...identity,
        score: state.score,
        baseScore: baseScores[index] ?? 0,
        total: parts[index]?.length ?? 0,
        combo: state.combo,
        bestCombo: state.bestCombo,
        hits: state.hits,
        misses: state.misses,
        judged: state.judged,
        heroHits: state.heroHits,
      };
      board.report(entry);
    });
  };
  /**
   * The last frame, asked for by `RunBoard.flush` just before the screen changes.
   * It writes the board immediately from the same refs the frame loop judges in, so
   * a final note is not lost to a render that may never come.
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

  // A hero word landing is the singers' own small event. The total is read off the
  // runs so a duet's two parts answer as one stage moment, and one note with two
  // hero syllables is still one rise — one cue, not one per word. A rewind or a new
  // attempt drops the total, which only resets what the effect remembers.
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

  // A different song, part or level starts the singers over, seeded where the
  // clock stands: a practice count-in has already seeked to its section by then.
  useEffect(() => {
    const from = clockTimeRef.current;
    runs.current = parts.map((part) => emptyRunFrom(part, from));
    verdicts.current = new Map();
    lastSeek.current = seekSerialRef.current;
    published.current = 0;
    dirty.current = false;
    bump((version) => version + 1);
    // The board takes the new attempt, not the score the previous one ended on.
    reportRef.current();
  }, [parts, source, seed, clockTimeRef, seekSerialRef]);

  useEffect(() => {
    // The roll draws at 12.5 Hz and a note is judged from the trail across its
    // span, so the pure engine does not need every frame: twenty looks a second is
    // plenty. A seek still resets at once, below.
    let lastAdvance = 0;
    return clock.subscribe(() => {
      const now = clockTimeRef.current;
      // A deliberate move of the playhead starts the singers over, seeded at the
      // new position — the practice count-in and its loop both arrive this way.
      const reset = seekSerialRef.current !== lastSeek.current;
      if (reset) {
        lastSeek.current = seekSerialRef.current;
        runs.current = parts.map((part) => emptyRunFrom(part, now));
        verdicts.current = new Map();
        published.current = 0;
        dirty.current = false;
      }

      const at = performance.now();
      if (at - lastAdvance < 50) return;
      lastAdvance = at;

      const previous = runs.current ?? [];
      const verdictsBefore = verdicts.current?.size ?? 0;
      const next = previous.map((state, index) => {
        const chart = parts[index];
        // The latest seat, read at the frame: a microphone that opens or closes
        // mid-song changes the next note's judge, never this run's history.
        const player = playersRef.current[index];
        const level = player?.level ?? "normal";
        return advanceRun(state, chart, now, (note) => {
          // **Per singer**: a seat with a microphone is heard, and every other
          // seat is the machine's even while somebody else is singing.
          const verdict: SungNote = singerVerdict(note, { rootMidi }, {
            live: player?.live === true,
            trail,
            tolerance: VOCAL_TOLERANCE[level],
            seed: seed + index,
            accuracy: perfect ? 1 : undefined,
          });
          // Recorded as it is judged, which is what the roll reads back.
          verdicts.current?.set(note.id, verdict);
          return verdict;
        });
      });
      // A frame that judged nothing and drained no meter leaves the runs where
      // they were — that is not a reason to publish, however many arrays the map
      // happened to make.
      let changed = (verdicts.current?.size ?? 0) > verdictsBefore;
      next.forEach((state, index) => {
        if (state !== previous[index]) changed = true;
      });
      runs.current = next;
      if (changed) dirty.current = true;

      // A reset is published at once, whatever the throttle says: the roll must
      // not keep the verdicts of a run that has just been started over.
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
  }, [
    clock,
    parts,
    rootMidi,
    seed,
    perfect,
    trail,
    clockTimeRef,
    seekSerialRef,
  ]);

  return {
    singers: (runs.current ?? []).map((state, index) => ({
      part: players[index]?.part ?? 0,
      score: state.score,
      baseScore: baseScores[index] ?? 0,
      total: parts[index]?.length ?? 0,
      combo: state.combo,
      bestCombo: state.bestCombo,
      hits: state.hits,
      misses: state.misses,
      judged: state.judged,
      heroHits: state.heroHits,
      // **This** singer's own answer: their seat has a microphone, and one is
      // actually being heard. One live singer does not make the band live.
      live: players[index]?.live === true && listening,
    })),
    verdicts: verdicts.current ?? new Map(),
  };
}
