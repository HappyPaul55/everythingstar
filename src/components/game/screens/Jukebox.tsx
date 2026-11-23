import { lazy, Suspense, useEffect, useState } from "react";
import { useT } from "../../../i18n/react";
import { docCanPlay } from "../../../lib/game/source";
import type { Song } from "../../../lib/game/song";
import { useClock } from "../band/StageClock";
import { YouTubeStageAudio } from "../band/YouTubeStageAudio";
import { JukeboxDirector } from "../jukebox/JukeboxDirector";
import { JukeboxLyrics } from "../jukebox/JukeboxLyrics";
import { JukeboxTransport } from "../jukebox/JukeboxTransport";
import { Vinyl } from "../jukebox/Vinyl";
import type { GameSession } from "../useGameSession";
import { ScreenBackButton } from "./ScreenBackButton";

/**
 * The Jukebox: a song, its words and a record, with no band and no score.
 *
 * It is a page in the same island as the run rather than a second app. The one
 * clock plays it, `SongAudio` streams it, the mixer's music family sets its
 * level, and the library is the same library Songs reads. The Jukebox's own
 * decisions — the queue, the shuffle, the song that comes next — live in
 * `lib/game/jukebox.ts`; this file draws them.
 *
 * The **record** is the song's cover as its label, because the cover is the one
 * picture a listener already has. The **words** sit beside it on a wide screen
 * and under it in portrait; they are the same timed lines the stage would read.
 * The queue is the player's list only: the shuffle fills the gaps without ever
 * being written into it.
 *
 * The picker is lazy: a listener who presses Play and never opens it does not
 * download the search or the queue list.
 */
const JukeboxPicker = lazy(() =>
  import("../jukebox/JukeboxPicker").then((module) => ({
    default: module.JukeboxPicker,
  })),
);

interface Props {
  session: GameSession;
}

export function Jukebox({ session }: Props) {
  const t = useT();
  const { jukebox, playback, library } = session;
  const clock = useClock();
  const [picker, setPicker] = useState<null | "songs" | "queue">(null);
  const lost = clock.sourceLost;

  const song = jukebox.current;
  const songId = song?.id ?? null;
  const nextSong = jukebox.next;
  const load = jukebox.load;
  const ready =
    load.status === "ready" && load.doc !== null && docCanPlay(load.doc);
  const art = load.doc?.art ?? undefined;
  const album = song?.album?.name ?? null;
  const reading = library.loading && library.songs.length === 0;
  const empty = !reading && library.songs.length === 0;
  const waiting = !reading && !empty && song === null;

  // A song whose sound never arrives is skipped rather than left playing
  // silent for four minutes. The clock's own loss notice is the signal; a stem
  // that comes back in time clears it and cancels the skip.
  useEffect(() => {
    if (!lost || !songId) return;
    const timer = window.setTimeout(() => nextSong(), 3_000);
    return () => window.clearTimeout(timer);
  }, [lost, songId, nextSong]);

  const playNow = (chosen: Song) => {
    if (song?.id === chosen.id) {
      // The song is already here: Play now means start it again, not load it.
      clock.seek(0);
      clock.play();
    } else {
      session.jukebox.playNow(chosen.id);
    }
    setPicker(null);
  };

  const back = () => {
    jukebox.savePosition(clock.timeRef.current);
    session.dispatch("back");
  };

  const queueLine =
    jukebox.queue.length > 0
      ? `${t("screen.jukeboxUpNext")}: ${jukebox.queue[0]?.title ?? ""}`
      : t("screen.jukeboxShuffling");

  return (
    <div className="screen screen--jukebox">
      <div className="screen__panel screen__panel--page jukebox-screen">
        <div className="jukebox__heading">
          <ScreenBackButton label={t("screen.backToMenu")} onBack={back} />
          <h2 className="screen__title">{t("screen.jukeboxTitle")}</h2>
          <div className="jukebox__heading-actions">
            <button
              type="button"
              className="band-btn jukebox__heading-action"
              aria-haspopup="dialog"
              data-sound="open"
              onClick={() => setPicker("songs")}
            >
              {t("screen.jukeboxPick")}
            </button>
            <button
              type="button"
              className="band-btn jukebox__heading-action"
              aria-haspopup="dialog"
              data-sound="open"
              onClick={() => setPicker("queue")}
            >
              {t("screen.jukeboxQueue")}
              <span className="jukebox__queue-count">{jukebox.queue.length}</span>
            </button>
          </div>
        </div>

        {reading ? (
          <p className="jukebox__empty">{t("screen.libraryLoading")}</p>
        ) : null}

        {empty ? (
          <div className="jukebox__empty">
            <p>{t("screen.jukeboxEmpty")}</p>
            <button
              type="button"
              className="band-btn band-btn--primary"
              data-sound="select"
              onClick={() => session.dispatch("songs")}
            >
              {t("screen.jukeboxEmptyAction")}
            </button>
          </div>
        ) : null}

        {waiting ? (
          <div className="jukebox__empty">
            <p>
              {jukebox.failedTitle
                ? `${t("screen.jukeboxError")} ${jukebox.failedTitle}`
                : t("screen.jukeboxLoading")}
            </p>
            {jukebox.failedTitle ? (
              <button
                type="button"
                className="band-btn band-btn--primary"
                data-sound="select"
                onClick={() => session.dispatch("songs")}
              >
                {t("screen.jukeboxEmptyAction")}
              </button>
            ) : null}
          </div>
        ) : null}

        {song && !empty ? (
          <div className="jukebox__body">
            <div className="jukebox__disc-column">
              <Vinyl song={song} art={art} playing={clock.playing} />
              <JukeboxTransport
                durationMs={playback.track.durationMs}
                ready={ready}
                onNext={jukebox.next}
              />
              <div className="jukebox__up-next">
                <p className="jukebox__up-next-line">{queueLine}</p>
                <p className="jukebox__queue-hint-line">
                  {jukebox.queue.length > 0
                    ? t("screen.jukeboxQueueHint")
                    : t("screen.jukeboxQueueEmpty")}
                </p>
              </div>
            </div>

            <div className="jukebox__words-column">
              <header className="jukebox__track">
                <p className="jukebox__eyebrow">{t("screen.nowPlaying")}</p>
                <h3 className="jukebox__title">{song.title}</h3>
                <p className="jukebox__artist">
                  {album
                    ? t("screen.songByAlbum", {
                        artist: song.artist.name,
                        album,
                      })
                    : song.artist.name}
                </p>
              </header>

              {jukebox.pending && jukebox.pendingLoading ? (
                <p className="jukebox__pending" role="status" aria-live="polite">
                  {t("screen.jukeboxLoading")} {jukebox.pending.title}
                </p>
              ) : null}
              {jukebox.failedTitle ? (
                <p className="jukebox__failed" role="status" aria-live="polite">
                  {t("screen.jukeboxError")} {jukebox.failedTitle}
                </p>
              ) : null}
              {lost ? (
                <p className="jukebox__failed" role="status" aria-live="polite">
                  {t("screen.jukeboxNoSound")}
                </p>
              ) : null}

              <JukeboxLyrics loading={load.status !== "ready"} />
            </div>
          </div>
        ) : null}

        <JukeboxDirector
          songId={song?.id ?? null}
          positionMs={jukebox.state.positionMs}
          ready={ready}
          onEnd={jukebox.onEnd}
          onPosition={jukebox.savePosition}
          restartToken={jukebox.restartToken}
        />

        {playback.youtubeAudio ? (
          <div className="jukebox__youtube">
            <YouTubeStageAudio
              videoId={playback.youtubeAudio.videoId}
              volume={playback.youtubeAudio.volume}
              musicLevel={playback.youtubeAudio.musicLevel}
              lagMs={playback.youtubeAudio.lagMs}
              rate={playback.youtubeAudio.rate}
              practice={playback.youtubeAudio.practice}
            />
          </div>
        ) : null}
      </div>

      {picker ? (
        <Suspense fallback={null}>
          <JukeboxPicker
            library={library}
            current={song}
            queue={jukebox.queue}
            initialTab={picker}
            onPlayNow={playNow}
            onPlayNext={(chosen) => jukebox.playNext(chosen.id)}
            onEnqueue={(chosen) => jukebox.enqueue(chosen.id)}
            onRemove={jukebox.removeFromQueue}
            onClear={jukebox.clearQueue}
            onFindSongs={() => {
              setPicker(null);
              session.dispatch("songs");
            }}
            onClose={() => setPicker(null)}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
