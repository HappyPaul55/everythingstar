/**
 * Which files make a named mix — one rule, shared by the importer and the stage.
 *
 * A song document lists its **stems** (a file per part, plus a whole mix when a folder
 * shipped one) and the **mix presets** those stems make: `full` is the whole song and
 * `stems` is every part on its own. The importer writes those presets
 * (`mixPresetsFor` in `sources/files.ts`) and a run reads them (`fullMixStems` and
 * `partStems` in `source.ts`), so the two halves have to agree on what a preset
 * *means*: a list of **stem ids**, never file names, resolved against the document's
 * own stems.
 *
 * This module is that agreement and nothing else. It is pure — it reads the arrays it
 * is handed and builds new ones — so a drift between what the importer writes and what
 * the stage plays is a unit test rather than a silent song.
 */

/** The preset that is the whole song: a master, or every part at once. */
export const FULL_PRESET = "full";

/** The preset that is the parts alone, without a whole mix. */
export const PARTS_PRESET = "stems";

/** The part of a stem a plan needs: its id, and the file it names. */
export interface StemRef {
  id: string;
  url: string;
}

/** A named mix: an id, and the stem ids it plays together. */
export interface MixPreset {
  id: string;
  /** The stems this mix plays. A preset may name one the song does not carry. */
  stemIds: readonly string[];
}

/**
 * What a preset resolved to, and what it could not find.
 *
 * `preset` is the id that answered and `missingPreset` the id that was asked for and
 * not there; the two are `null` in the other case, so a caller can tell **a document
 * with no such preset** from **a preset that names files the document does not have**
 * without re-reading either list. `missingIds` is the second kind of gap, reported
 * even when the rest of the preset played.
 */
export interface StemPlan {
  /** The files to play, in the chosen preset's order, each exactly once. */
  urls: string[];
  /** The preset that answered, or null when the fallback did. */
  preset: string | null;
  /** The preset that was asked for and the song does not carry, if that is why. */
  missingPreset: string | null;
  /** Stem ids the preset named that the song does not carry, in preset order. */
  missingIds: string[];
}

/**
 * Resolve one named mix into the files a run plays.
 *
 * The rules, in the order they apply:
 *
 * - a preset is looked up by **exact id**, and its `stemIds` are resolved through the
 *   song's own stems, first match winning, in the order the preset names them;
 * - a listed file is played **once** however many ids point at it (a folder may list the
 *   same `bass.ogg` under two names);
 * - an id the song does not carry is **ignored and named** in `missingIds` — a
 *   document is somebody else's file, and one stale id must not cost the whole mix;
 * - a preset that is **absent**, or resolves to **no files at all**, is not an answer:
 *   the caller's `fallback` is played instead, deduplicated the same way. The fallback
 *   is the caller's policy (`fullMixStems` plays everything, `partStems` only the
 *   parts), which is why it is passed in rather than guessed here.
 *
 * Nothing in `stems`, `presets` or `fallback` is written to: every returned array is
 * new, and the document stays exactly as it was read.
 */
export function resolveStemPlan(
  stems: readonly StemRef[],
  presets: readonly MixPreset[],
  presetId: string | null,
  fallback: readonly string[],
): StemPlan {
  const byId = new Map(stems.map((stem) => [stem.id, stem.url]));
  const preset =
    presetId === null ? undefined : presets.find((entry) => entry.id === presetId);

  if (!preset) {
    return {
      urls: uniqueUrls(fallback),
      preset: null,
      missingPreset: presetId,
      missingIds: [],
    };
  }

  const urls: string[] = [];
  const missingIds: string[] = [];
  const missing = new Set<string>();
  for (const id of preset.stemIds) {
    const url = byId.get(id);
    if (url === undefined) {
      if (!missing.has(id)) {
        missing.add(id);
        missingIds.push(id);
      }
      continue;
    }
    urls.push(url);
  }

  const unique = uniqueUrls(urls);
  // A preset with nothing to play is a preset this song cannot honour. It is still
  // *found*, so `missingPreset` stays null — its `missingIds` say what was wrong.
  if (unique.length === 0) {
    return {
      urls: uniqueUrls(fallback),
      preset: null,
      missingPreset: null,
      missingIds,
    };
  }

  return { urls: unique, preset: preset.id, missingPreset: null, missingIds };
}

/** The same files in the same order, with each repeated file kept once. */
function uniqueUrls(urls: readonly string[]): string[] {
  return [...new Set(urls)];
}
