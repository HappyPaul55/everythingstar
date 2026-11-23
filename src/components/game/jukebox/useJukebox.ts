import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EMPTY_JUKEBOX,
  advance,
  clearQueue as clearQueueState,
  enqueue as enqueueState,
  markFailed,
  markFillerFailed,
  peekNext,
  playNext as playNextState,
  playNow as playNowState,
  reconcile,
  removeFromQueue as removeFromQueueState,
  setPosition,
  startJukebox,
  type JukeboxState,
} from "../../../lib/game/jukebox";
import { songForId, type Song } from "../../../lib/game/song";
import { docCanPlay } from "../../../lib/game/source";
import type { Track } from "../../../lib/game/track";
import type { Library } from "../library/useLibrary";
import { useSongTrack, type SongLoad } from "../library/useSongTrack";

/** The seats a Jukebox asks the loader for: none. */
const NO_SEATS = [] as const;

export type StagedReason = "user" | "prefetch";

/**
 * The Jukebox's state and its loader.
 *
 * The **current** song is what plays; a **staged** song is what comes next. A
 * stage is one of two things:
 *
 * - `user`: the player pressed Play now or Next. The current song keeps playing
 *   until the staged song's document and words are ready, then the switch is
 *   made. This is what makes changing a song feel like a change rather than a
 *   gap.
 * - `prefetch`: the shuffle's next song, loaded quietly while the current one
 *   plays. It is not shown as a queue entry and does not interrupt anything; it
 *   is simply ready when the current song ends.
 *
 * The queue is the player's, `bag` is the shuffle's, and `failed` is the list of
 * songs that would not play. The pure rules are in `lib/game/jukebox.ts`; this
 * hook is only the loading and the React state around them.
 */
export interface JukeboxController {
  /** The pure mode state (queue, bag, current id, saved position). */
  state: JukeboxState;
  current: Song | null;
  /** The current song's document, charts and words. */
  load: SongLoad;
  track: Track | null;
  /** The songs the player queued, in order. */
  queue: Song[];
  /** The song the player is waiting for, if a change is in flight. */
  pending: Song | null;
  /** The pending song's files are still arriving. */
  pendingLoading: boolean;
  /** The last song that would not play, if any. */
  failedTitle: string | null;
  playNow: (id: string) => void;
  playNext: (id: string) => void;
  enqueue: (id: string) => void;
  next: () => void;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
  /** Save where the current song is when the screen goes. */
  savePosition: (positionMs: number) => void;
  /** The transport reached the end of the current song. */
  onEnd: () => void;
  /** Bumped when the same song is started again (a one-song library, or Next). */
  restartToken: number;
}

export function useJukebox(
  library: Library,
  enabled: boolean,
): JukeboxController {
  const [state, setState] = useState<JukeboxState>(EMPTY_JUKEBOX);
  const [staged, setStaged] = useState<{ id: string; reason: StagedReason } | null>(null);
  const [failedTitle, setFailedTitle] = useState<string | null>(null);
  /** Was the failure a song the player asked for, or one the shuffle offered? */
  const [failedByUser, setFailedByUser] = useState(false);
  const [restartToken, setRestartToken] = useState(0);
  const failedByUserRef = useRef(failedByUser);
  failedByUserRef.current = failedByUser;
  /**
   * The shuffle's seed. It belongs to this visit: a reload is a new visit and a
   * new order, while moving between screens is the same Jukebox.
   */
  const seed = useRef(`jukebox:${Date.now()}`).current;
  /** The current song whose prefetch has already been tried once. */
  const prefetchDone = useRef<string | null>(null);

  const currentId = state.current;
  const songIds = useMemo(() => library.songs.map((song) => song.id), [library.songs]);
  const current = useMemo(
    () => (currentId ? songForId(library.songs, currentId) : null),
    [library.songs, currentId],
  );
  const currentLoad = useSongTrack(current, NO_SEATS, enabled);

  const stagedSong = useMemo(
    () => (staged ? songForId(library.songs, staged.id) : null),
    [library.songs, staged],
  );
  const stagedLoad = useSongTrack(
    stagedSong,
    NO_SEATS,
    enabled && staged !== null && staged.id !== currentId,
  );
  const stagedPlayable =
    stagedLoad.status === "ready" &&
    stagedLoad.doc !== null &&
    docCanPlay(stagedLoad.doc);
  const stagedReady = staged !== null && stagedPlayable;

  // The latest values for callbacks the transport holds. A new function identity
  // on every render must not restart the director's end watch.
  const stateRef = useRef(state);
  stateRef.current = state;
  const songIdsRef = useRef(songIds);
  songIdsRef.current = songIds;
  const stagedRef = useRef(staged);
  stagedRef.current = staged;

  // Follow a library that changed under the mode.
  useEffect(() => {
    setState((previous) => reconcile(previous, songIds));
  }, [songIds]);

  // The first song, and a new one after a library that had nothing. It is the
  // queue's head if the player queued something, otherwise the shuffle.
  useEffect(() => {
    if (!enabled || currentId !== null || songIds.length === 0) return;
    setState((previous) => startJukebox(previous, songIds, seed));
  }, [enabled, currentId, songIds, seed]);

  // Leaving the screen drops a pending change; the queue and the current song
  // stay, so coming back is a return rather than a reset.
  useEffect(() => {
    if (enabled) return;
    setStaged(null);
    setFailedTitle(null);
    setFailedByUser(false);
  }, [enabled]);

  /**
   * The current song cannot play: name it, remember it and move on. The sound
   * check is the document's own (`docCanPlay`) — a Jukebox has no chart to play
   * instead, and a silent track of the song's length is a lie.
   */
  useEffect(() => {
    if (!enabled || !currentId || currentLoad.status !== "ready") return;
    if (currentLoad.doc !== null && docCanPlay(currentLoad.doc)) return;
    const title = current?.title ?? null;
    setFailedTitle(title);
    setFailedByUser(false);
    setState((previous) =>
      markFailed(previous, currentId, songIds, seed),
    );
  }, [enabled, currentId, currentLoad.status, currentLoad.doc, current?.title, songIds, seed]);

  /**
   * A staged song that cannot play is dropped rather than waited for. The
   * current song is untouched: a failed choice is a failed choice, not a
   * stopped Jukebox.
   */
  useEffect(() => {
    if (!enabled || !staged || stagedLoad.status !== "ready") return;
    if (stagedLoad.doc !== null && docCanPlay(stagedLoad.doc)) return;
    if (staged.reason === "prefetch") {
      // A filler that will not play is dropped from the shuffle, not from the
      // player's queue. It is their song if they queued it; its own turn will
      // name it if it really cannot play.
      prefetchDone.current = currentId;
      setState((previous) => markFillerFailed(previous, staged.id));
      setStaged(null);
      return;
    }
    const title = stagedSong?.title ?? null;
    setFailedTitle(title);
    setFailedByUser(true);
    setState((previous) => markFailed(previous, staged.id, songIds, seed));
    setStaged(null);
  }, [enabled, staged, stagedLoad.status, stagedLoad.doc, stagedSong?.title, songIds, seed, currentId]);

  // A staged id that left the library is not a pending choice any more.
  useEffect(() => {
    if (staged && !stagedSong) setStaged(null);
  }, [staged, stagedSong]);

  // A prefetch belongs to the song that was playing when it was chosen. If the
  // current changes for any other reason — a failure, a Play now — its "next"
  // is stale, so it is dropped and the new current can choose its own.
  useEffect(() => {
    if (stagedRef.current?.reason === "prefetch") setStaged(null);
  }, [currentId]);

  // The queue is the player's priority. A change to it means the prepared
  // filler may no longer be next, so it is dropped and the prefetch picks the
  // queue head instead.
  useEffect(() => {
    if (stagedRef.current?.reason === "prefetch") setStaged(null);
  }, [state.queue]);

  // A successful current song clears a failure the shuffle caused. A failure
  // the player asked for stays until they choose something else: it is the
  // answer to their press, not a line about the song that is playing.
  useEffect(() => {
    if (!enabled || failedByUser) return;
    if (currentLoad.status !== "ready" || currentLoad.doc === null) return;
    if (!docCanPlay(currentLoad.doc)) return;
    setFailedTitle(null);
  }, [enabled, failedByUser, currentLoad.status, currentLoad.doc]);

  // A failure the player asked for belongs to the song that was playing when
  // they asked. A new current song is a new answer, so the line goes.
  useEffect(() => {
    if (!failedByUserRef.current) return;
    setFailedTitle(null);
    setFailedByUser(false);
  }, [currentId]);

  // A chosen song is committed only when it can actually play. Until then the
  // current song keeps going. `playNowState` also removes it from the queue and
  // the shuffle, so it cannot come round twice because it was asked for.
  useEffect(() => {
    if (!staged || staged.reason !== "user" || !stagedReady) return;
    setState((previous) => playNowState(previous, staged.id));
    setStaged(null);
    setFailedTitle(null);
    setFailedByUser(false);
  }, [staged, stagedReady]);

  // A new current song is a new chance to prepare the next one.
  useEffect(() => {
    prefetchDone.current = null;
  }, [currentId]);

  // The shuffle's next song is prepared while this one plays. It is not a queue
  // entry and it does not move the current song; it only means the next switch
  // has less to wait for. One failed prefetch per current song is enough: a
  // library of unplayable files must not turn into a fetch loop.
  useEffect(() => {
    if (!enabled || currentId === null || staged !== null) return;
    if (prefetchDone.current === currentId) return;
    const id = peekNext(state, songIds, seed);
    if (!id || id === currentId) return;
    setStaged({ id, reason: "prefetch" });
  }, [enabled, currentId, state, songIds, seed, staged]);

  const playNow = useCallback((id: string) => {
    setFailedTitle(null);
    setFailedByUser(false);
    setStaged({ id, reason: "user" });
  }, []);

  const playNext = useCallback(
    (id: string) => {
      setFailedTitle(null);
      setFailedByUser(false);
      setState((previous) => playNextState(previous, id));
    },
    [],
  );

  const enqueue = useCallback((id: string) => {
    setFailedTitle(null);
    setFailedByUser(false);
    setState((previous) => {
      return enqueueState(previous, id);
    });
  }, []);

  const next = useCallback(() => {
    setFailedTitle(null);
    setFailedByUser(false);
    const id = peekNext(stateRef.current, songIdsRef.current, seed);
    if (!id) return;
    if (id === stateRef.current.current) {
      // A one-song library: Next is the same song again, not a staged load.
      setRestartToken((token) => token + 1);
      return;
    }
    setStaged({ id, reason: "user" });
  }, [seed]);

  const removeFromQueue = useCallback((id: string) => {
    setState((previous) => removeFromQueueState(previous, id));
  }, []);

  const clearQueue = useCallback(() => {
    setState((previous) => clearQueueState(previous));
  }, []);

  const savePosition = useCallback((positionMs: number) => {
    setState((previous) => setPosition(previous, positionMs));
  }, []);

  /**
   * The song ran out. A prefetched next song is promoted to *the* pending song
   * and the current-songs effect waits for it; without one, the queue or the
   * shuffle supplies the next. A user pending is already on its way and must
   * not be raced by a second choice.
   */
  const onEnd = useCallback(() => {
    const currentStaged = stagedRef.current;
    if (currentStaged) {
      if (currentStaged.reason === "prefetch") {
        setStaged({ id: currentStaged.id, reason: "user" });
      }
      return;
    }
    const previous = stateRef.current;
    const next = advance(previous, songIdsRef.current, seed);
    setState(next);
    if (next.current !== null && next.current === previous.current) {
      // The shuffle came back to the same song (a one-song library): start it
      // again rather than leaving the transport ended.
      setRestartToken((token) => token + 1);
    }
  }, [seed]);

  const queue = useMemo(
    () =>
      state.queue
        .map((id) => songForId(library.songs, id))
        .filter((song): song is Song => song !== null),
    [library.songs, state.queue],
  );

  return {
    state,
    current,
    load: currentLoad,
    track: currentLoad.track,
    queue,
    pending: staged && staged.reason === "user" ? stagedSong : null,
    pendingLoading: staged !== null && staged.reason === "user" && !stagedReady,
    failedTitle,
    playNow,
    playNext,
    enqueue,
    next,
    removeFromQueue,
    clearQueue,
    savePosition,
    onEnd,
    restartToken,
  };
}
