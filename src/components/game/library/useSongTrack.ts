import { useEffect, useRef, useState } from "react";
import type {
  Difficulty,
  LaneChart,
  LaneRole,
  MelodyChart,
  Track,
} from "../../../lib/game/track";
import type { PlayerKind } from "../../../lib/game/band/types";
import type { Song } from "../../../lib/game/song";
import {
  assembleTrack,
  readChart,
  readSongDoc,
  wantedCharts,
  type SourceSongDoc,
} from "../../../lib/game/source";
import { sourceToSongDoc, trackFromSource } from "../../../lib/game/sources/write";
import { isLocalFolderLocked, isLocalUrl, readLocalSource } from "./folder";
import { isSngUrl } from "./sngUrl";
import { cachedJson } from "./store";

/**
 * The song the band is about to play, fetched.
 *
 * A playlist says what a song *has*; this fetches what it *is* — the song document
 * once, then **one chart per seat** — and adds them up into the track the stage
 * judges. Only what somebody is playing is fetched, which is the whole point of a
 * song listing its charts rather than carrying them.
 *
 * Nothing here is fatal. A chart that cannot be read leaves its player with nothing
 * to play and the rest of the band playing, and the loading screen waits for exactly
 * as long as this does.
 */
export interface Seat {
  kind: PlayerKind;
  difficulty: Difficulty;
  /** Which guitar part the seat takes, when the song names one. */
  role?: LaneRole;
}

export interface SongLoad {
  /** The song's own document, for what a loaded track does not carry. */
  doc: SourceSongDoc | null;
  track: Track | null;
  status: "idle" | "loading" | "ready";
  /** Anything the files said was wrong, named. */
  problems: string[];
  /** Let go of any object URLs the load made. */
  release?: () => void;
}

const IDLE: SongLoad = { doc: null, track: null, status: "idle", problems: [] };

export function useSongTrack(
  song: Song | null,
  seats: readonly Seat[],
  /** Nothing is fetched while the jukebox is up: browsing is not playing. */
  enabled: boolean,
): SongLoad {
  const [load, setLoad] = useState<SongLoad>(IDLE);
  const release = useRef<(() => void) | null>(null);
  // What is on screen right now, and the song it belongs to, so a seat change keeps
  // it while the new charts come in.
  const shown = useRef<SongLoad>(IDLE);
  const loadedId = useRef<string | null>(null);
  // What the effect runs on: the song, the seats, and whether to fetch at all.
  // Built from values rather than identities, so a re-render is not a re-fetch.
  const seatKey = seats
    .map((seat) => `${seat.kind}:${seat.role ?? ""}:${seat.difficulty}`)
    .join(",");

  useEffect(() => {
    if (!song || !enabled) {
      release.current?.();
      release.current = null;
      loadedId.current = null;
      shown.current = IDLE;
      setLoad(IDLE);
      return;
    }
    let alive = true;
    const abort = new AbortController();
    // Keep what is already loaded for this song: a seat changing is not a reason to
    // take the charts off the stage and put them back. It is still a **load in
    // flight**, though, and the band must not say its charts are ready while the
    // next seat's chart is being fetched — Play would start on the old difficulty
    // and the run would reset when the new chart landed.
    const previous = shown.current;
    const next: SongLoad =
      loadedId.current === song.id
        ? { ...previous, status: "loading" }
        : { ...IDLE, status: "loading" };
    shown.current = next;
    setLoad(next);
    void (async () => {
      const loaded = await loadSong(song, seats, abort.signal);
      if (!alive) {
        loaded.release?.();
        return;
      }
      // A load that came back with nothing for a song whose charts are on screen
      // leaves them there: a seat change that fails must not replace working charts
      // with none.
      const current = shown.current;
      const retained =
        loadedId.current === song.id && (current.doc !== null || current.track !== null);
      if (!loaded.doc && !loaded.track && retained) {
        // The seat change failed but the charts on screen still work: keep them
        // and put the load back to the state it had before this attempt.
        loaded.release?.();
        const restored: SongLoad = { ...previous, status: "ready" };
        shown.current = restored;
        setLoad(restored);
        return;
      }
      // The new load is adopted now, so the one it replaces can let its object URLs
      // go. A cleanup on a seat change only aborts; it never releases what is still
      // being shown.
      release.current?.();
      release.current = loaded.release ?? null;
      loadedId.current = song.id;
      shown.current = loaded;
      setLoad(loaded);
    })();
    return () => {
      alive = false;
      abort.abort();
    };
    // `seats` is read, never listed: `seatKey` is the same list said as a value, and
    // an array would be a different one every render. `revision` is listed because a
    // playlist entry can change in place, and the documents follow it.
  }, [song?.id, song?.doc, song?.revision, seatKey, enabled]);

  // Leaving the hook — the island going, not a seat changing — is what lets go of
  // the load on screen. The effect above is one request, and its cleanup runs on
  // every dep change, so it cannot own this.
  useEffect(
    () => () => {
      release.current?.();
      release.current = null;
      loadedId.current = null;
      shown.current = IDLE;
    },
    [],
  );

  return load;
}

/** Fetch a song and the charts its band needs, and make a track of them. */
async function loadSong(
  song: Song,
  seats: readonly Seat[],
  signal?: AbortSignal,
): Promise<SongLoad> {
  try {
    return await readSongLoad(song, seats, signal);
  } catch {
    // Every reader is meant to be tolerant, but a bug or an unexpected throw must
    // not leave the loading screen waiting for ever. The run goes on without that
    // chart, and the song is named.
    return {
      ...IDLE,
      status: "ready",
      problems: [`${song.title}: could not be loaded`],
    };
  }
}

/** The body of a load: a folder, a package, or the three documents. */
async function readSongLoad(
  song: Song,
  seats: readonly Seat[],
  signal?: AbortSignal,
): Promise<SongLoad> {
  // A song read from a folder is not fetched at all: its chart is parsed once, and
  // that one parse carries every part and every difficulty — so it is the same
  // track whatever the band is.
  if (isLocalUrl(song.doc)) {
    const source = await readLocalSource(song.doc);
    if (!source) {
      // Two readings fail, and they need different answers: a folder the browser has
      // forgotten how to open needs a press, and one whose files have gone needs
      // finding again. Saying which is the difference between a fix and a puzzle.
      const locked = await isLocalFolderLocked(song.doc);
      return {
        ...IDLE,
        status: "ready",
        problems: [
          locked
            ? `${song.title}: the browser needs permission to read its folder again. Open Playlists, press Reconnect, then play it again.`
            : `${song.title}: its files could not be read. If it was added from a folder, open Playlists and press Reconnect — the folder may have moved.`,
        ],
      };
    }
    const built = trackFromSource(source);
    return {
      doc: sourceToSongDoc(source),
      track: built.track,
      status: "ready",
      problems: [...source.problems, ...built.problems],
    };
  }

  if (isSngUrl(song.doc)) {
    const { loadSngSong } = await import("./sngSong");
    return loadSngSong(song, signal);
  }

  const problems: string[] = [];
  const body = await cachedJson(song.doc, "song", false, song.revision, signal);
  if (body === null) {
    return { ...IDLE, status: "ready", problems: [`${song.title}: its song could not be loaded`] };
  }
  const read = readSongDoc(body, song.doc);
  problems.push(...read.problems);
  const doc = read.doc;
  if (!doc) return { ...IDLE, status: "ready", problems };

  const wanted = wantedCharts(doc, seats);

  const lanes: LaneChart[] = [];
  const melodies: MelodyChart[] = [];
  await Promise.all(
    wanted.map(async ({ kind, chart }) => {
      const notes = await cachedJson(chart.url, "chart", false, song.revision, signal);
      if (notes === null) {
        problems.push(`${chart.id}: its notes could not be loaded`);
        return;
      }
      const parsed = readChart(notes, chart, kind);
      problems.push(...parsed.problems);
      if (parsed.lane) lanes.push(parsed.lane);
      if (parsed.melody) melodies.push(parsed.melody);
    }),
  );

  const built = assembleTrack(doc, lanes, melodies[0] ?? null);
  problems.push(...built.problems);

  return {
    doc,
    track: built.track,
    status: "ready",
    problems,
  };
}
