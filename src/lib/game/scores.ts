/**
 * The score board: what a finished run saves, and what the menu and the results
 * screen read back.
 *
 * It is deliberately **local** for now — this browser's own storage, no account
 * and no server — but it is the shape a real board will arrive in rather than a
 * different design. Everything except the two storage calls is pure, so the
 * rules that matter (what counts as a best, how many are kept) are unit-tested.
 */

import type { Difficulty } from "./track";
import type { LineupPlayer } from "./band/types";

/** One finished run, as the board keeps it. */
export interface SavedRun {
  /** The song's id, and the title to show for it. */
  song: string;
  title: string;
  /**
   * A lost run from an older build is kept — it happened — but it never counts as
   * a best. New lost runs are not put on the board at all: a verdict is not a score.
   */
  failed: boolean;
  score: number;
  bestCombo: number;
  hits: number;
  misses: number;
  /** One line per player, in the order they were on stage, at their own
   *  difficulty — or none, for lyrics, which have no levels. */
  players: { label: string; score: number; difficulty: Difficulty | null }[];
  /**
   * The band this run was played by: each player's instrument and difficulty, and
   * for a words player whether they sang or typed. A **stable, unlocalised key**
   * from `lineupKey`, never a translated label, and optional because entries saved
   * before lineups were recorded have none.
   */
  lineup?: string;
  /**
   * The run's rating, when it was saved under the star-scoring model. Older
   * entries have none, and still read as runs: a score and a history are enough.
   */
  baseScore?: number;
  stars?: number;
  gold?: boolean;
  average?: number;
  /** When it was played, in ms since the epoch. */
  at: number;
}

/**
 * What a typist's key says where a singer or an instrument names a level: a lyric
 * has no levels, so there is one token rather than a difficulty that was never
 * played. It is storage and a sentence on the history, never a level a chart could
 * carry.
 */
export const LINEUP_FREE_PLAY = "free";

/**
 * The comparable unit of a score board entry: **the lineup, not the song's
 * difficulty**.
 *
 * Difficulty belongs to a chart and to the player holding it (AGENTS.md), so a
 * song has no single difficulty to key a run by — one band can have an Easy guitar
 * and an Expert line to sing. What makes two runs comparable is therefore the whole
 * lineup: each player's instrument and the difficulty they were **actually judged
 * at**, a guitar's lead or rhythm role, and whether a words player sang or typed.
 * The key is sorted so the order of seats does not matter, and it is deliberately
 * unlocalised: it is storage, not something a player reads. `lineupPlayers` is what
 * settles a slot's wish against the song before the key is built.
 *
 * A words player with no mode recorded takes the band screen's default, `sing`; a
 * caller that knows the song can settle it to `type` for a lyrics-only song before
 * calling.
 */
export function lineupKey(players: readonly LineupPlayer[]): string {
  return players
    .map((player) => {
      // A words player says how the words were played; a guitar says which part it
      // took. Lead is the default a roleless guitar has always meant, so it keeps
      // the old key and a board saved before roles existed still matches. Only the
      // non-default rhythm needs a segment.
      const extra =
        player.kind === "words"
          ? `:${player.wordsMode ?? "sing"}`
          : player.role === "rhythm"
            ? ":rhythm"
            : "";
      // A typist's own run reports no difficulty, so the key says the same rather
      // than keeping the slot's wish: normal and hard are one typed band.
      return `${player.kind}:${player.difficulty ?? LINEUP_FREE_PLAY}${extra}`;
    })
    .sort()
    .join("+");
}

/** How many runs the board keeps. Enough to be a history, small enough not to grow. */
export const BOARD_LIMIT = 50;

/** How many a results screen shows for one song. */
const BEST_LIMIT = 5;

/** How many of a song's most recent runs the results screen lists. */
const RECENT_LIMIT = 5;

/**
 * The scoring model changed from three-point grades to 50-point notes and a ×4
 * streak. The key is versioned so an old board's tiny scores are not compared
 * with new ones: old runs are left in storage, not migrated into a different scale.
 */
const STORAGE_KEY = "everythingstar:scores:v2";

/**
 * Read a board out of stored JSON. Anything unreadable is an empty board.
 *
 * A run is kept against its **song**, and the comparable unit within that is its
 * **lineup** — each player's instrument and difficulty, and whether the words were
 * sung or typed. There is no single song difficulty to key by, because difficulty
 * belongs to a player's chart. Entries saved before lineups were recorded have no
 * `lineup`; they are their own group, so they still count in the song-wide view but
 * never match a specific lineup.
 */
export function parseBoard(raw: string | null): SavedRun[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // The board is capped on write and on import; reading one that grew some
    // other way — a hand-edited file, an older build — caps it here too, so a
    // screen never has to render thousands of rows.
    return parsed.filter(isSavedRun).slice(0, BOARD_LIMIT);
  } catch {
    return [];
  }
}

/**
 * A stored entry is only trusted for the fields a saved run has and the screens
 * draw.
 *
 * The results and the jukebox print the date, the score and how many played; a row
 * missing one of those is not a run a screen can draw, and accepting it used to put
 * "Invalid Date" in the history. `title` and each player's `label` are what this
 * game writes even where a screen reads the song's own title, so a record without
 * them is not one of ours. `players` is checked because its length is the band size.
 */
function isSavedRun(value: unknown): value is SavedRun {
  if (typeof value !== "object" || value === null) return false;
  const run = value as Partial<SavedRun>;
  if (
    typeof run.song !== "string" ||
    typeof run.title !== "string" ||
    typeof run.score !== "number" ||
    !Number.isFinite(run.score) ||
    typeof run.failed !== "boolean" ||
    typeof run.at !== "number" ||
    !Number.isFinite(run.at) ||
    !Array.isArray(run.players)
  ) {
    return false;
  }
  return run.players.every(
    (player) =>
      typeof player === "object" &&
      player !== null &&
      typeof (player as { label?: unknown }).label === "string" &&
      typeof (player as { score?: unknown }).score === "number",
  );
}

/** The board with a run added: newest first, oldest trimmed away. */
export function boardWithRun(
  board: SavedRun[],
  run: SavedRun,
  limit = BOARD_LIMIT,
): SavedRun[] {
  return [run, ...board].slice(0, Math.max(1, limit));
}

/**
 * A song's saved runs, best first.
 *
 * With a `lineup`, only runs of that exact band count — the same instruments at the
 * same difficulties, with the words sung or typed the same way. Without one, it is
 * the song-wide list across every lineup, which is the history the results screen
 * shows.
 * Entries saved before lineups were recorded have no key, so they count only in the
 * song-wide view and never match a specific lineup.
 *
 * The numeric third argument is the older limit-only call, kept so existing callers
 * keep working.
 */
export function topFor(
  board: SavedRun[],
  song: string,
  limit?: number,
): SavedRun[];
export function topFor(
  board: SavedRun[],
  song: string,
  lineup?: string,
  limit?: number,
): SavedRun[];
export function topFor(
  board: SavedRun[],
  song: string,
  lineupOrLimit?: string | number,
  limit = BEST_LIMIT,
): SavedRun[] {
  const lineup = typeof lineupOrLimit === "string" ? lineupOrLimit : undefined;
  const cap = typeof lineupOrLimit === "number" ? lineupOrLimit : limit;
  return board
    .filter(
      (run) => run.song === song && (lineup === undefined || run.lineup === lineup),
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, cap);
}

/**
 * A song's saved runs, **most recent first** — the history the results screen
 * shows under "your last N on this song". Reading it from `topFor` was the bug:
 * that sorts by score, so a weak run could be missing from a list that says it
 * is the last one. Ties keep the board's own order, which is newest first.
 */
export function recentFor(
  board: SavedRun[],
  song: string,
  limit = RECENT_LIMIT,
): SavedRun[] {
  return board
    .filter((run) => run.song === song)
    .sort((a, b) => b.at - a.at)
    .slice(0, Math.max(0, limit));
}

/**
 * The best score saved for a song, or null. Failed runs do not count.
 *
 * With a `lineup`, the answer is the best **for this band**; without one, it is the
 * song-wide best across every lineup, which is still the useful headline for a
 * jukebox. An entry saved before lineups were recorded has no key, so it is its own
 * group: it counts in the song-wide view and never matches a specific lineup.
 */
export function bestFor(
  board: SavedRun[],
  song: string,
  lineup?: string,
): number | null {
  let best: number | null = null;
  for (const run of board) {
    if (run.song !== song || run.failed) continue;
    if (lineup !== undefined && run.lineup !== lineup) continue;
    if (best === null || run.score > best) best = run.score;
  }
  return best;
}

/** What a finished run says about itself, for the one question of keeping it. */
interface RunSummary {
  /** How many runs the band published. Listen publishes none. */
  runs: number;
  /** A lost run is a verdict, not a score. */
  failed: boolean;
  /** How much of the band's parts was judged at all. */
  judged: number;
  score: number;
}

/**
 * Is this finished run one the board should keep?
 *
 * Three ways it is not. **Nobody played** — Listen publishes no run, and a panel
 * whose chart never arrived (or whose folder the browser would not open) publishes
 * zeroes. **The band lost it** — a verdict is not a score. And **nothing was
 * judged**, so there is no performance to record however the score reads. Without
 * this, a silent stage saves 0 and announces it as the song's best.
 */
export function shouldSaveRun(run: RunSummary): boolean {
  return run.runs > 0 && !run.failed && run.judged > 0 && run.score > 0;
}

/** The board, read from this browser. Storage being unavailable is an empty board. */
export function loadBoard(): SavedRun[] {
  try {
    return parseBoard(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

/** Save a run to this browser, and hand back the board it landed on. */
export function saveRun(run: SavedRun): SavedRun[] {
  const board = boardWithRun(loadBoard(), run);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
  } catch {
    // A full or blocked store is not worth losing the run over.
  }
  return board;
}

/**
 * Replace this browser's whole board — what importing a profile does.
 *
 * It is the same tolerance as reading one: the board is put through `parseBoard`
 * before it is written, so an entry that is not a run is dropped rather than
 * becoming a row no screen can read, and the same `BOARD_LIMIT` caps what is kept.
 * A blocked store leaves the board as it was and returns what would have been kept,
 * which is a change not remembered rather than a failed import of the other three
 * records.
 */
export function replaceBoard(board: readonly SavedRun[]): SavedRun[] {
  const kept = parseBoard(JSON.stringify(board)).slice(0, BOARD_LIMIT);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
  } catch {
    // The import still replaced the settings, band and hints.
  }
  return kept;
}
