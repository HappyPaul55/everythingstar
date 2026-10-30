import { useEffect, useState } from "react";
import type { Song } from "../../lib/game/song";
import {
  readChart,
  readSongDoc,
  type SourceSongDoc,
} from "../../lib/game/source";
import { sourceToSongDoc } from "../../lib/game/sources/write";
import type { LaneChart } from "../../lib/game/track";
import { roleKind } from "../../lib/game/song";
import { cachedJson } from "../game/library/store";
import { isLocalUrl, readLocalSource } from "../game/library/folder";
import { isSngUrl } from "../game/library/sngUrl";
import { DEFAULT_GRID, clampGrid, type CharterGrid } from "../../lib/game/charter/grid";
import { chartKey, type CharterChart } from "../../lib/game/charter/edit";

export interface CharterLoad {
  song: Song | null;
  doc: SourceSongDoc | null;
  charts: CharterChart[];
  grid: CharterGrid;
  status: "idle" | "loading" | "ready";
  problems: string[];
}

const IDLE: CharterLoad = {
  song: null,
  doc: null,
  charts: [],
  grid: DEFAULT_GRID,
  status: "idle",
  problems: [],
};

/**
 * A song and **every chart** it carries, for the charter.
 *
 * This is deliberately not `useSongTrack`: a run fetches only the charts its band
 * needs, while a charter needs all of them so the panel list can show the guitar's
 * four levels beside the bass and drums. The documents come through the library's
 * one fetch/cache path, and every chart is held to `readChart` exactly as it is on
 * the stage.
 */
export function useCharterSong(song: Song | null): CharterLoad {
  const [load, setLoad] = useState<CharterLoad>(IDLE);

  useEffect(() => {
    if (!song) {
      setLoad(IDLE);
      return;
    }
    let alive = true;
    const abort = new AbortController();
    setLoad({ ...IDLE, song, status: "loading" });
    void (async () => {
      const next = await loadCharterSong(song, abort.signal);
      if (alive) setLoad(next);
    })();
    return () => {
      alive = false;
      abort.abort();
    };
  }, [song, song?.id, song?.doc, song?.revision]);

  return load;
}

async function loadCharterSong(song: Song, signal: AbortSignal): Promise<CharterLoad> {
  if (isSngUrl(song.doc)) {
    return {
      ...IDLE,
      song,
      status: "ready",
      problems: ["A .sng package is not editable in the charter yet. Export it as a folder first."],
    };
  }

  if (isLocalUrl(song.doc)) {
    const source = await readLocalSource(song.doc);
    if (!source) {
      return {
        ...IDLE,
        song,
        status: "ready",
        problems: [
          `${song.title}: its folder could not be read. Open Playlists, press Reconnect, then try again.`,
        ],
      };
    }
    return {
      song,
      doc: sourceToSongDoc(source),
      charts: uniqueCharts(source.lanes.map((lane) => withKey(lane))),
      grid: gridFrom(source.lanes),
      status: "ready",
      problems: [...source.problems],
    };
  }

  const problems: string[] = [];
  const body = await cachedJson(song.doc, "song", false, song.revision, signal);
  if (body === null) {
    return {
      ...IDLE,
      song,
      status: "ready",
      problems: [`${song.title}: its song document could not be loaded`],
    };
  }
  const read = readSongDoc(body, song.doc);
  problems.push(...read.problems);
  if (!read.doc) return { ...IDLE, song, status: "ready", problems };
  const doc = read.doc;

  const wanted: { url: string; chart: (typeof doc.parts)[number]["charts"][number]; kind: ReturnType<typeof roleKind> }[] = [];
  for (const part of doc.parts) {
    const kind = roleKind(part.role);
    if (kind === "words") continue;
    for (const chart of part.charts) {
      if (chart.chartType === "vocals" || chart.chartType === "lyrics") continue;
      wanted.push({ url: chart.url, chart, kind });
    }
  }

  const lanes = await Promise.all(
    wanted.map(async (entry) => {
      const notes = await cachedJson(entry.url, "chart", false, song.revision, signal);
      if (notes === null) {
        problems.push(`${entry.chart.id}: its notes could not be loaded`);
        return null;
      }
      const chart = readChart(notes, entry.chart, entry.kind);
      problems.push(...chart.problems);
      return chart.lane ? withKey(chart.lane, entry.chart.id) : null;
    }),
  );

  const charts = uniqueCharts(lanes.filter((lane): lane is CharterChart => lane !== null));
  return {
    song,
    doc,
    charts,
    grid: gridFrom(charts),
    status: "ready",
    problems,
  };
}

function withKey(chart: LaneChart, id?: string): CharterChart {
  return {
    ...chart,
    key: id ?? chartKey(chart),
  };
}

/** Two parts can name one instrument/level; the chart id keeps their keys apart. */
function uniqueCharts(charts: readonly CharterChart[]): CharterChart[] {
  const seen = new Map<string, number>();
  return charts.map((chart) => {
    const count = seen.get(chart.key) ?? 0;
    seen.set(chart.key, count + 1);
    return count === 0 ? chart : { ...chart, key: `${chart.key}#${count + 1}` };
  });
}

function gridFrom(charts: readonly LaneChart[]): CharterGrid {
  const bpm = charts.find((chart) => typeof chart.bpm === "number" && chart.bpm > 0)?.bpm;
  return clampGrid({ ...DEFAULT_GRID, ...(bpm ? { bpm } : {}) });
}
