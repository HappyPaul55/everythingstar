/**
 * The **Jukebox**: what plays next when nobody is choosing.
 *
 * The Jukebox is a listening mode, not a run: it plays a song, shows its words
 * and moves on. This module is the whole decision — which song is playing, what
 * the player queued, what the shuffle offers when the queue runs dry — and it is
 * pure, so the rules are unit-tested rather than spread through effects.
 *
 * Two lists, deliberately apart:
 *
 * - `queue` is the **player's** list. It only ever holds songs they chose with
 *   Play now, Play next or Add to queue.
 * - `bag` is the **shuffle**: a shuffled order of the library. A song from the
 *   bag is a filler, and a filler is never written into `queue`. That is what
 *   makes the queue count mean "songs I picked" rather than "songs that happen
 *   to be coming".
 *
 * `failed` remembers songs that would not play, so one broken file cannot trap
 * the mode in a skip loop. A failure is forgotten when the player asks for that
 * song again by name.
 *
 * The current song is an id, not a `Song`: the library is the authority, and a
 * playlist refresh can change what an id means. `reconcile` is how the lists
 * follow it.
 */

import { hashUnit } from "./hash";

export interface JukeboxState {
  /** The song playing now, or null before the first one. */
  current: string | null;
  /** The player's own list, in play order. Fillers never enter it. */
  queue: string[];
  /** The shuffled fillers still to come. */
  bag: string[];
  /** Songs that would not play; skipped until asked for by name again. */
  failed: string[];
  /** Which shuffle round the bag belongs to, so a refill is a new order. */
  round: number;
  /** Where the current song was when the Jukebox was left, in ms. */
  positionMs: number;
}

export const EMPTY_JUKEBOX: JukeboxState = {
  current: null,
  queue: [],
  bag: [],
  failed: [],
  round: 0,
  positionMs: 0,
};

/**
 * A shuffled copy of `ids`.
 *
 * Seeded rather than `Math.random`, so a test can say what a round is and a
 * session can have its own order without storing it. Ties fall back to the id so
 * two songs that hash alike still have one answer.
 */
export function shuffleIds(ids: readonly string[], seed: string): string[] {
  return ids
    .map((id) => ({ id, order: hashUnit(`${seed}:${id}`) }))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .map((entry) => entry.id);
}

/** Does this list already contain the id? */
function has(list: readonly string[], id: string): boolean {
  return list.includes(id);
}

/** Remove an id from a list, keeping the order of what stays. */
function without(list: readonly string[], id: string): string[] {
  return list.filter((entry) => entry !== id);
}

/**
 * A fresh filler order.
 *
 * Songs the player queued are left out: they have their own turn, and hearing
 * one twice because it was also a filler is the kind of "shuffle" a listener
 * notices. Failed songs and the current song are left out for the same reason.
 * If that leaves nothing — a one-song library, or every song queued — the
 * current song is the honest filler rather than silence.
 */
function refill(
  state: JukeboxState,
  songIds: readonly string[],
  seed: string,
): { bag: string[]; round: number } {
  const excluded = new Set([...state.queue, ...state.failed]);
  if (state.current) excluded.add(state.current);
  const pool = songIds.filter((id) => !excluded.has(id));
  const fallback = pool.length > 0
    ? pool
    : songIds.filter((id) => !state.failed.includes(id));
  const round = state.round + 1;
  return { bag: shuffleIds(fallback, `${seed}:${round}`), round };
}

/** The next song, from the queue first and the shuffle after it. */
function takeNext(
  state: JukeboxState,
  songIds: readonly string[],
  seed: string,
): { next: string | null; queue: string[]; bag: string[]; round: number } {
  if (state.queue.length > 0) {
    return {
      next: state.queue[0] ?? null,
      queue: state.queue.slice(1),
      bag: state.bag,
      round: state.round,
    };
  }
  if (state.bag.length > 0) {
    return {
      next: state.bag[0] ?? null,
      queue: state.queue,
      bag: state.bag.slice(1),
      round: state.round,
    };
  }
  const filled = refill(state, songIds, seed);
  return {
    next: filled.bag[0] ?? null,
    queue: state.queue,
    bag: filled.bag.slice(1),
    round: filled.round,
  };
}

/**
 * What would play next, without changing anything.
 *
 * The preloader asks this while the current song is still playing. `advance`
 * takes the same answer, so the song prepared in the background is the song
 * that starts.
 */
export function peekNext(
  state: JukeboxState,
  songIds: readonly string[],
  seed: string,
): string | null {
  return takeNext(state, songIds, seed).next;
}

/** Start the Jukebox if nothing is playing: the queue first, then the shuffle. */
export function startJukebox(
  state: JukeboxState,
  songIds: readonly string[],
  seed: string,
): JukeboxState {
  if (state.current !== null) return state;
  return advance(state, songIds, seed);
}

/** Move on to the next song: the queue head, or the next filler. */
export function advance(
  state: JukeboxState,
  songIds: readonly string[],
  seed: string,
): JukeboxState {
  const taken = takeNext(state, songIds, seed);
  return {
    ...state,
    current: taken.next,
    queue: taken.queue,
    bag: taken.bag,
    round: taken.round,
    positionMs: 0,
  };
}

/**
 * Play this song now.
 *
 * The queue is not cleared: it is the player's list, and interrupting one song
 * is not a reason to throw the rest away. The new current does leave the queue
 * and the bag, so it cannot come round twice on the strength of having been
 * asked for.
 */
export function playNow(state: JukeboxState, id: string): JukeboxState {
  return {
    ...state,
    current: id,
    queue: without(state.queue, id),
    bag: without(state.bag, id),
    failed: without(state.failed, id),
    positionMs: 0,
  };
}

/**
 * Put this song at the front of the player's queue.
 *
 * With nothing playing it is the next song, so it starts now. A song already in
 * the queue is moved to the front rather than duplicated.
 */
export function playNext(state: JukeboxState, id: string): JukeboxState {
  if (state.current === null) return playNow(state, id);
  if (state.current === id) return state;
  return {
    ...state,
    queue: [id, ...without(state.queue, id)],
    bag: without(state.bag, id),
    failed: without(state.failed, id),
  };
}

/**
 * Add this song to the end of the player's queue.
 *
 * A song already queued or playing is left where it is: pressing Add twice is a
 * double press, not a request to hear it twice.
 */
export function enqueue(state: JukeboxState, id: string): JukeboxState {
  if (state.current === id || has(state.queue, id)) return state;
  return {
    ...state,
    queue: [...state.queue, id],
    bag: without(state.bag, id),
    failed: without(state.failed, id),
  };
}

/** Remove one song from the player's queue. */
export function removeFromQueue(state: JukeboxState, id: string): JukeboxState {
  return { ...state, queue: without(state.queue, id) };
}

/** Empty the player's queue. What is playing keeps playing. */
export function clearQueue(state: JukeboxState): JukeboxState {
  return { ...state, queue: [] };
}

/**
 * A song would not play.
 *
 * It is remembered so the shuffle leaves it alone, and if it was the current
 * song the mode moves on at once. Asking for it by name again clears the mark
 * (`playNow`, `playNext`, `enqueue`), because a player may have fixed the file.
 */
export function markFailed(
  state: JukeboxState,
  id: string,
  songIds: readonly string[],
  seed: string,
): JukeboxState {
  const failed = has(state.failed, id) ? state.failed : [...state.failed, id];
  const next: JukeboxState = {
    ...state,
    failed,
    queue: without(state.queue, id),
    bag: without(state.bag, id),
  };
  return next.current === id ? advance(next, songIds, seed) : next;
}

/**
 * A filler would not play.
 *
 * The shuffle remembers it so it is not offered again, but the player's queue is
 * left alone: a song the listener queued is theirs even if the prefetch that
 * happened to be looking at it failed. If it really cannot play, it will be
 * named when its own turn comes.
 */
export function markFillerFailed(state: JukeboxState, id: string): JukeboxState {
  return {
    ...state,
    failed: has(state.failed, id) ? state.failed : [...state.failed, id],
    bag: without(state.bag, id),
  };
}

/** Follow a library that changed under the mode. */
export function reconcile(
  state: JukeboxState,
  songIds: readonly string[],
): JukeboxState {
  const known = new Set(songIds);
  const current = state.current !== null && known.has(state.current) ? state.current : null;
  return {
    ...state,
    current,
    queue: state.queue.filter((id) => known.has(id)),
    bag: state.bag.filter((id) => known.has(id)),
    failed: state.failed.filter((id) => known.has(id)),
  };
}

/** Where the current song was when the screen was left. */
export function setPosition(state: JukeboxState, positionMs: number): JukeboxState {
  const at = Number.isFinite(positionMs) ? Math.max(0, positionMs) : 0;
  return state.positionMs === at ? state : { ...state, positionMs: at };
}

/** How many songs the player has waiting. Fillers are not counted. */
export function queueCount(state: JukeboxState): number {
  return state.queue.length;
}
