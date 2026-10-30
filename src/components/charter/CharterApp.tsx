import { useCallback, useEffect, useMemo, useState } from "react";
import { withLocale } from "../../i18n/react";
import { DEFAULT_PLAYLIST } from "../../lib/game/defaultPlaylist";
import type { Song } from "../../lib/game/song";
import { EMPTY_MELODY } from "../../lib/game/source";
import type { Track } from "../../lib/game/track";
import { useLibrary } from "../game/library/useLibrary";
import { StageClockProvider } from "../game/band/StageClock";
import { SongAudio } from "../game/band/SongAudio";
import { SongAudioStatusProvider } from "../game/band/SongAudioStatus";
import { SongProvider } from "../game/band/SongContext";
import { PartAudioProvider } from "../game/band/PartAudio";
import { CharterPicker } from "./CharterPicker";
import { CharterWorkspace, type CharterProject } from "./CharterWorkspace";
import { useCharterSong } from "./useCharterSong";

/**
 * The charter island: its own root, its own clock and its own song audio.
 *
 * It is deliberately not the game's session loop. A charter is a tool, and the
 * run's band, judging and score board have no place in it; the song's audio and
 * the one clock are the only stage pieces it borrows.
 */
function CharterApp() {
  const library = useLibrary(DEFAULT_PLAYLIST);
  const [song, setSong] = useState<Song | null>(null);
  const [loadingSong, setLoadingSong] = useState(false);
  const load = useCharterSong(song);
  const [speed, setSpeed] = useState(1);

  const open = useCallback((next: Song) => {
    setLoadingSong(true);
    setSong(next);
  }, []);

  // The menu is the usual way in, so history is the usual way out. A direct visit
  // has no game page behind it and falls back to `/play` (the website's game).
  const leaveGame = useCallback(() => {
    try {
      const referrer = document.referrer ? new URL(document.referrer) : null;
      if (referrer && referrer.origin === window.location.origin) {
        window.history.back();
        return;
      }
    } catch {
      // A malformed referrer is not a reason to strand the player.
    }
    window.location.assign("/play");
  }, []);

  useEffect(() => {
    if (load.status === "ready") setLoadingSong(false);
  }, [load.status]);

  const project = useMemo<CharterProject | null>(() => {
    if (!song || load.status !== "ready" || !load.doc) return null;
    return {
      song,
      doc: load.doc,
      charts: load.charts,
      grid: load.grid,
      problems: load.problems,
    };
  }, [song, load]);

  const track = useMemo<Track>(
    () => ({
      id: song?.id ?? "charter",
      title: song?.title ?? "Charter",
      durationMs: load.doc?.durationMs ?? song?.durationMs ?? 0,
      melody: EMPTY_MELODY,
      charts: [],
      ...(load.doc?.sections && load.doc.sections.length > 0
        ? { sections: load.doc.sections }
        : {}),
    }),
    [song, load.doc],
  );

  const audio =
    load.doc &&
    load.doc.audio.source === "stems" &&
    load.doc.audio.stems.length > 0;

  return (
    <div className="charter-root">
      <StageClockProvider durationMs={load.doc?.durationMs ?? song?.durationMs ?? 0}>
        <SongAudioStatusProvider preload={!!load.doc}>
          <SongProvider track={track} seed={song?.seed ?? 0} doc={load.doc}>
            <PartAudioProvider>
              {audio && load.doc ? (
                <SongAudio
                  doc={load.doc}
                  volume={1}
                  musicLevel={1}
                  lagMs={0}
                  sung={false}
                  rate={speed}
                  practice={speed !== 1}
                />
              ) : null}
              {project ? (
                <CharterWorkspace
                  key={project.song.id}
                  project={project}
                  speed={speed}
                  onSpeed={setSpeed}
                  onBack={() => setSong(null)}
                  onGame={leaveGame}
                />
              ) : (
                <CharterPicker
                  library={library}
                  loadingSong={loadingSong}
                  error={
                    song && load.status === "ready" && !load.doc
                      ? load.problems[0] ?? "The song could not be opened."
                      : null
                  }
                  onOpen={open}
                  onBack={leaveGame}
                />
              )}
            </PartAudioProvider>
          </SongProvider>
        </SongAudioStatusProvider>
      </StageClockProvider>
    </div>
  );
}

export default withLocale(CharterApp);
