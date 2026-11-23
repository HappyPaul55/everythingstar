import { useEffect, useRef } from "react";
import { useSongAudioPreload, useSongAudioProgress } from "../band/SongAudioStatus";
import { useClock } from "../band/StageClock";

/**
 * The Jukebox's transport, held apart from the screen that draws it.
 *
 * It renders nothing. It seats a song on the one `StageClock` when its document
 * and its sound are ready, keeps the saved position on re-entry, and reports the
 * end once so the queue can move on. It is the Jukebox's `StageDirector`: the
 * same clock, the same sound-following, and no second frame loop.
 *
 * A song change is a **pause first**: the old elements are about to unmount and
 * the new ones have not loaded yet. The start is delayed until both the document
 * and the sound can play, which is what lets the previous song keep playing
 * while the next one is prepared. The current song is only swapped by the
 * session once the staged one is ready.
 */
interface Props {
  /** The song the mode has committed to, or null while the library is empty. */
  songId: string | null;
  /** Where to start when this screen is entered (a re-entry), in ms. */
  positionMs: number;
  /** The document is ready and names a playable sound. */
  ready: boolean;
  /** The current song ran out. */
  onEnd: () => void;
  /** Save where the song was when the screen went. */
  onPosition: (positionMs: number) => void;
  /** Bumped when the same song should start again from the top. */
  restartToken: number;
}

export function JukeboxDirector({
  songId,
  positionMs,
  ready,
  onEnd,
  onPosition,
  restartToken,
}: Props) {
  const clock = useClock();
  const audio = useSongAudioProgress();
  const preload = useSongAudioPreload();
  const clockRef = useRef(clock);
  clockRef.current = clock;
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const onPositionRef = useRef(onPosition);
  onPositionRef.current = onPosition;
  /** The song this director has seated. A play/pause must not seat it again. */
  const startedFor = useRef<string | null>(null);
  /** The last `clock.ended` this director reacted to, so one end is one report. */
  const lastEnded = useRef(clock.ended);
  /**
   * The last playhead this song actually had while it was moving.
   *
   * The screen's own Back handler saves the clock's position before it leaves,
   * but an Escape (or a pad's B) changes the screen directly, and the screen
   * change seeks the clock to the top on its way out. This is the bookmark the
   * cleanup uses, so leaving by either route resumes where the song was.
   */
  const lastPosition = useRef(0);
  /** The restart token this director has already answered (the mount's is not one). */
  const lastRestart = useRef(restartToken);

  // A different song is a stopped transport until its own sound is ready. The
  // old song is already gone at this point; the session does not commit a new
  // one until it can play.
  useEffect(() => {
    startedFor.current = null;
    lastPosition.current = 0;
    clockRef.current.pause();
  }, [songId]);

  // The menu press that opened the Jukebox is the gesture a phone needs to start
  // fetching a song it would otherwise leave alone; `preload` is the same muted
  // nudge the band's Play button gives its stems. The elements are registered by
  // the time this runs.
  useEffect(() => {
    if (!songId || !ready) return;
    preload.prime();
  }, [songId, ready, preload]);

  // The one clock is already running; following it here is not a second loop.
  useEffect(() => {
    return clock.subscribe(() => {
      if (clock.playing) lastPosition.current = clock.timeRef.current;
    });
  }, [clock]);

  // Seat the song once, at the saved position on a re-entry and at the top after
  // a change. The play button is the only other thing that moves this transport.
  useEffect(() => {
    if (!songId || !ready || !audio.ready) return;
    if (startedFor.current === songId) return;
    startedFor.current = songId;
    clockRef.current.seek(positionMs);
    clockRef.current.play();
  }, [songId, ready, audio.ready, positionMs]);

  // The same song asked for again (a one-song library, or Next on it): start it
  // from the top. The token on mount is the saved one, not a request.
  useEffect(() => {
    if (restartToken === lastRestart.current) return;
    lastRestart.current = restartToken;
    startedFor.current = songId;
    clockRef.current.seek(0);
    clockRef.current.play();
  }, [restartToken, songId]);

  // The song ran out: tell the mode once. A seek or a new song clears `ended`, so
  // the next end is a new transition.
  useEffect(() => {
    if (lastEnded.current === clock.ended) return;
    lastEnded.current = clock.ended;
    if (clock.ended) onEndRef.current();
  }, [clock.ended]);

  // Leaving the screen is a pause and a bookmark, not a lost position. The
  // cleanup runs before the screens change; the playhead is still the song's.
  useEffect(
    () => () => {
      clockRef.current.pause();
      onPositionRef.current(
        lastPosition.current > 0 ? lastPosition.current : clockRef.current.timeRef.current,
      );
    },
    [],
  );

  return null;
}
