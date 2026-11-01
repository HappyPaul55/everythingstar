/**
 * Which folders under a collection are songs, and which file in each is the chart.
 *
 * The walk is the importer's, but the **chart** is not: `findChartName` is the one
 * order every reader uses, so a folder holding a Guitar Hero chart and a `song.txt`
 * imports from the chart the game would have listed and played. The importer adds
 * only its own gate on top — an ordinary `.txt` is not a chart — never a second
 * ordering.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { detectSource } from "../../src/lib/game/sources/detect";
import { findChartName } from "../../src/lib/game/sources/files";

export interface SongFolder {
  dir: string;
  chart: string;
}

/** Every folder under `root` that holds something playable. */
export function findSongs(root: string): SongFolder[] {
  const found: SongFolder[] = [];
  const visit = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    // The one order every reader uses (`findChartName`), then the importer's own
    // gate: a `.txt` is only a song if it opens like an UltraStar file. A folder
    // with a chart and a changelog is still a song, because the chart wins.
    const chart = findChartName(entries);
    if (chart && (!/\.txt$/i.test(chart) || looksUltraStar(join(dir, chart)))) {
      found.push({ dir, chart: join(dir, chart) });
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      try {
        if (statSync(full).isDirectory()) visit(full);
      } catch {
        // A file that vanished under us is not a reason to stop the walk.
      }
    }
  };
  visit(root);
  return found;
}

/** Does this file open the way an UltraStar file does? The detector's answer, not a second regex. */
export function looksUltraStar(path: string): boolean {
  try {
    return detectSource(new Uint8Array(readFileSync(path)), basename(path)) === "ultrastar";
  } catch {
    return false;
  }
}
