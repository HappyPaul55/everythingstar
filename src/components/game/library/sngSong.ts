/**
 * The band's load of a `.sng` package.
 *
 * A package is not a song document and its chart, but the same thing in one file:
 * take it from the one-visit package cache (the jukebox's preview may already have
 * fetched it), read its index, and let the pure reader turn its chart and stems into
 * the source a folder would have produced. The audio and cover are object URLs, and
 * the load owns them until it is replaced.
 *
 * It lives here rather than in `useSongTrack.ts` because it is the only part of a
 * load that needs the package reader, and that reader must not be in `/play`'s first
 * download — the `.sng` branch fetches this module the first time a package is
 * played, and nothing before that does.
 */

import type { Song } from "../../../lib/game/song";
import {
  parseSngSource,
  readSngEntry,
  sngFiles,
  type SngEntry,
} from "../../../lib/game/sources/sng";
import { sourceToSongDoc, trackFromSource } from "../../../lib/game/sources/write";
import { loadSng, sngObjectUrl } from "./sng";
import type { SongLoad } from "./useSongTrack";

/** A load that named a problem, with nothing for the stage. */
function failed(problems: string[]): SongLoad {
  return { doc: null, track: null, status: "ready", problems };
}

export async function loadSngSong(song: Song, signal?: AbortSignal): Promise<SongLoad> {
  const remote = await loadSng(song.doc, signal);
  if (!remote) {
    return failed([`${song.title}: its .sng package could not be loaded`]);
  }

  const files = sngFiles(remote.header);
  if (!files.chart) {
    return failed([...remote.problems, `${song.title}: its .sng package has no notes`]);
  }
  const chartBytes = readSngEntry(remote.header, remote.bytes, files.chart);
  if (!chartBytes) {
    return failed([...remote.problems, `${song.title}: its chart could not be read`]);
  }

  const made: string[] = [];
  const release = () => {
    for (const url of made) URL.revokeObjectURL(url);
    made.length = 0;
  };
  const urlFor = (entry: SngEntry) => {
    const url = sngObjectUrl(remote.bytes, remote.header, entry);
    if (url) made.push(url);
    return url;
  };

  try {
    const source = await parseSngSource({
      header: remote.header,
      chart: files.chart,
      chartBytes,
      urlFor,
      id: song.id,
      fallbackTitle: song.title,
      baseUrl: song.doc,
      problems: remote.problems,
    });
    if (!source) {
      release();
      return failed([`${song.title}: its .sng package could not be read`]);
    }
    const built = trackFromSource(source);
    return {
      doc: sourceToSongDoc(source),
      track: built.track,
      status: "ready",
      problems: [...source.problems, ...built.problems],
      release,
    };
  } catch {
    release();
    return failed([`${song.title}: its .sng package could not be read`]);
  }
}
