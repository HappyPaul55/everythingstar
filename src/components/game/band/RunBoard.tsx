import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { Difficulty } from "../../../lib/game/track";
import type { PlayerKind, WordsMode } from "../../../lib/game/band/types";
import type { TypingReport } from "../../../lib/game/typing";
import {
  createRunBoard,
  type RunBoardRegistry,
} from "../../../lib/game/runBoard";

/** One run's final word, as the results screen reads it. */
export interface RunEntry {
  /** Stable identity: this player, this part, this role. */
  key: string;
  /** What to call it on the results screen ("Player 1 · Guitar", "Typist 1"). */
  label: string;
  /**
   * What they took. A read-out like the rest of this entry: it lets the results
   * screen draw the words in the vocals tone without guessing from the label.
   */
  kind: PlayerKind;
  /**
   * How the words' place was played: sung or typed. It lets the results screen
   * draw **only a singer** in the vocals tone — Typing is its own way to play.
   */
  wordsMode?: WordsMode;
  /**
   * Their place in the band. A run is a **seat's**, so the results screen can put
   * the cards back in band order however the runs happened to report.
   */
  seat: number;
  /** What they were playing at. It is theirs, not the band's — and lyrics have
   *  no levels, so a typist's is nothing at all. */
  difficulty: Difficulty | null;
  score: number;
  /**
   * What this player's part pays at ×1: the denominator their star rating is read
   * against. A player the song gave nothing to play has zero and no rating.
   */
  baseScore: number;
  /**
   * How many notes or words their part has in all. Gold stars need every one of
   * them, so a seek or a quit cannot make a partial run gold.
   */
  total: number;
  combo: number;
  bestCombo: number;
  hits: number;
  misses: number;
  judged: number;
  /**
   * How many hero notes or words this run hit. A read-out only: the results screen
   * does not need it yet, but the cue that marks one already reaches this far.
   */
  heroHits?: number;
  /**
   * How many freestyle **fill hits** this run landed. They are in `score` but not
   * in `baseScore`, so the results screen's rating takes them back out
   * (`ratingScore`); a fill is something the drummer played, not a note to rate.
   */
  fillHits?: number;
  /**
   * What this run earned from **slides**. They are in `score` but not in
   * `baseScore`, so the results screen's rating takes them back out
   * (`ratingScore`): only a touch screen can glide, and a rating must not reward
   * a controller. Zero or absent for every run that never slid.
   */
  slidePoints?: number;
  /**
   * What this player's counts are of. A highway counts **notes** and a typist
   * counts **words**, so the results screen can name the right thing instead of
   * calling every count a note. Left out, it is notes.
   */
  unit?: "notes" | "words";
  /**
   * A typist's typing numbers — words a minute and key accuracy — for the results
   * card. Absent for every other seat, and for a typist who never landed a
   * meaningful key. A read-out like the rest of the entry, never read back into
   * judging.
   */
  typing?: TypingReport;
}

/**
 * The part of an entry that does not change while the run plays: who this run is,
 * and what the board should call it. A hook is handed this, and fills the rest
 * from its own live refs, so a renamed slot or a changed difficulty is picked up
 * without restarting anybody's run.
 */
export type RunIdentity = Pick<
  RunEntry,
  "key" | "label" | "kind" | "wordsMode" | "seat" | "difficulty" | "unit"
>;

type RunBoardValue = RunBoardRegistry<RunEntry>;

const RunBoardContext = createContext<RunBoardValue | null>(null);

/**
 * Where every run leaves its score, so the results screen has something real to
 * show.
 *
 * **Publish-only, and never part of judging.** A run writes what it has made of
 * its *own* chart and its *own* input; nothing here is read back into anyone's
 * judging, so the rule that no player can be affected by another still holds by
 * construction.
 *
 * The entries live in the registry's map and the board has no state of its own, so
 * reporting costs no re-render — which matters, because a run reports on its own
 * throttle and there can be a dozen of them. The one exception is `flush`: a run's
 * **last** frame must reach the results screen even if the stage unmounts before the
 * next tick, so each mounted run registers a `publishNow`, and a flush writes them
 * all and bumps one revision for the screen that reads the board.
 */
export function RunBoardProvider({ children }: { children: ReactNode }) {
  const board = useMemo(() => createRunBoard<RunEntry>(), []);
  return (
    <RunBoardContext.Provider value={board}>
      {children}
    </RunBoardContext.Provider>
  );
}

export function useRunBoard(): RunBoardValue {
  const value = useContext(RunBoardContext);
  if (!value) throw new Error("useRunBoard must be used inside a RunBoardProvider.");
  return value;
}

/**
 * The board's revision: it changes on a flush, so a screen can take its snapshot
 * again after every run has written its last frame. Reports stay quiet.
 */
export function useRunBoardVersion(): number {
  const board = useRunBoard();
  return useSyncExternalStore(board.subscribe, board.version, board.version);
}
