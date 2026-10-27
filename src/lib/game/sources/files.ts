/**
 * The file names a chart folder uses, in one place.
 *
 * A Guitar Hero or Clone Hero chart folder puts its audio and its art beside the chart
 * and names them by convention — `song.ogg` is the mix, `guitar.ogg` a stem,
 * `album.png` the cover. The names are the same whether a folder is read straight
 * off a disk (`folder.ts`) or converted by the importer, so the tables live here and
 * neither has a second copy to drift from.
 */

import type { SourceAudio, SourceStem } from "../source";
import type { SongRole } from "../song";
import { FULL_PRESET, PARTS_PRESET } from "../audio/stemPlan";
import type { StemRole } from "./types";

/**
 * The audio names a chart folder may use, by the role each file plays.
 *
 * A drum kit is often cut into pieces (`drums_1..4.ogg`) rather than shipped whole,
 * and a chart folder with a whole mix ships it as `song.ogg` — a folder with **no**
 * whole mix plays every stem at once, so a kit named in four files has to be four stems
 * or the sum is a song with one drum in it.
 *
 * **`preview.ogg` is not a stem**: it is the jukebox clip (`PREVIEW_NAMES`), a
 * short reminder of the song that nothing mixes into the track and a miss never
 * mutes. `song_original.ogg` is a second whole mix, so it is the last thing looked
 * for rather than something to add to the others.
 */
export const AUDIO_NAMES: [StemRole, string[]][] = [
  [
    "master",
    [
      "song.ogg",
      "song.opus",
      "song.mp3",
      "song.wav",
      "song_original.ogg",
      "song_original.opus",
      // The UltraStar convention: the chart names it in `#MP3`, and the file beside
      // it is simply `audio`. Without these, an UltraStar folder plays silence.
      "audio.mp3",
      "audio.ogg",
      "audio.opus",
      "audio.wav",
    ],
  ],
  [
    "lead_guitar",
    [
      "guitar.ogg",
      "guitar.opus",
      "guitar.mp3",
      "guitar.wav",
      "lead.ogg",
      "lead.opus",
      "lead.mp3",
      "lead.wav",
    ],
  ],
  ["rhythm_guitar", ["rhythm.ogg", "rhythm.opus", "rhythm.mp3", "rhythm.wav"]],
  ["bass", ["bass.ogg", "bass.opus", "bass.mp3", "bass.wav"]],
  [
    "drums",
    [
      "drums.ogg",
      "drums.opus",
      "drums.mp3",
      "drums.wav",
      "drums_1.ogg",
      "drums_1.opus",
      "drums_1.mp3",
      "drums_1.wav",
    ],
  ],
  ["drums_2", ["drums_2.ogg", "drums_2.opus", "drums_2.mp3", "drums_2.wav"]],
  ["drums_3", ["drums_3.ogg", "drums_3.opus", "drums_3.mp3", "drums_3.wav"]],
  ["drums_4", ["drums_4.ogg", "drums_4.opus", "drums_4.mp3", "drums_4.wav"]],
  ["keys", ["keys.ogg", "keys.opus", "keys.mp3", "keys.wav"]],
  [
    "vocals",
    [
      "vocals.ogg",
      "vocals.opus",
      "vocals.mp3",
      "vocals.wav",
      "vocals_1.ogg",
      "vocals_1.opus",
      "vocals_1.mp3",
      "vocals_1.wav",
    ],
  ],
  [
    "harmony",
    [
      "vocals_2.ogg",
      "vocals_2.opus",
      "vocals_2.mp3",
      "vocals_2.wav",
      "harmony.ogg",
      "harmony.opus",
      "harmony.mp3",
      "harmony.wav",
    ],
  ],
  ["crowd", ["crowd.ogg", "crowd.opus", "crowd.mp3", "crowd.wav"]],
];

/**
 * The clip a chart folder makes for a jukebox, best first.
 *
 * It is **not a stem**: it is a short reminder of the song, played from its own
 * start, and it is never part of the mix and never muted. A song without one falls
 * back to its master (see `previewFor`), which is why finding this name matters.
 */
export const PREVIEW_NAMES = ["preview.ogg", "preview.opus", "preview.mp3"];

/**
 * The art names, best first.
 *
 * `album.png` is the convention, but a chart folder that re-cut its art leaves what it
 * replaced lying beside it — `album_alt.png` (92 songs in the test library),
 * `album_alt2.png`, `old album.png`, `small album.png`. A cover that is a shade
 * different is still a cover, and a song with none at all draws its own tile.
 */
export const ART_NAMES = [
  "album.png",
  "album.jpg",
  "album.jpeg",
  "album_alt.png",
  "album_alt.jpg",
  "album_alt2.png",
  "album (1).png",
  "old album.png",
  "small album.png",
  "cover.png",
  "cover.jpg",
  "cover.jpeg",
];

/** The settings file a folder may carry. */
export const INI_NAMES = ["song.ini"];

/** The UltraStar chart's conventional name, ahead of any other sheet in the folder. */
const SONG_TEXT_NAMES = ["song.txt"];

/**
 * A `.txt` that is documentation rather than a chart.
 *
 * A collection folder has a `changelog.txt` beside its song folders, and an
 * UltraStar folder has a `license.txt` beside its `song.txt`. Neither is a song.
 * `notes.txt` is deliberately **not** here: it can be a real chart name.
 */
const IGNORED_TEXT_NAMES =
  /^(?:licen[cs]e|readme|changelog|copying|credits?)(?:[.\s_-]|$)/i;

/**
 * The chart a folder should read, in one order for every caller.
 *
 * A folder can hold more than one thing that parses: a Guitar Hero chart folder with a
 * `notes.mid` and a stray `song.txt`, a Clone Hero folder with a `.chart`, a
 * StepMania folder with a `.sm`. Choosing a different one when the folder is
 * *listed* and when it is *played* makes the stage play a different song from the
 * one the jukebox named, so the order lives here and nowhere else: `notes.mid`,
 * then any `.chart`, then any `.sm`, then the text sheet `findSheet` picks. The
 * folder reader, the local reader and the importer all ask this one question.
 */
export function findChartName(names: readonly string[]): string | null {
  const notes = findName(names, ["notes.mid"]);
  if (notes) return notes;
  const chart = names.find((name) => /\.chart$/i.test(name));
  if (chart) return chart;
  const step = names.find((name) => /\.sm$/i.test(name));
  if (step) return step;
  return findSheet(names);
}

/**
 * The text chart a folder should read: `song.txt` first, then another `.txt` that
 * is not documentation, then a timed lyric sheet. This is the UltraStar and timed
 * lyrics reader, and the last step of `findChartName`; it is not the folder-level
 * decision on its own.
 */
function findSheet(names: readonly string[]): string | null {
  const song = findName(names, SONG_TEXT_NAMES);
  if (song) return song;
  const text = names.find(
    (name) => /\.txt$/i.test(name) && !IGNORED_TEXT_NAMES.test(name),
  );
  if (text) return text;
  return names.find((name) => /\.(lrc|srt|vtt)$/i.test(name)) ?? null;
}

/** The file among `names` that matches one of `candidates`, best first. */
export function findName(
  names: readonly string[],
  candidates: readonly string[],
): string | null {
  const lowered = new Map(names.map((name) => [name.toLowerCase(), name]));
  for (const candidate of candidates) {
    const actual = lowered.get(candidate);
    if (actual) return actual;
  }
  return null;
}

/** Every stem a source can name, in the order a song document lists them. */
const SOURCE_STEMS: { role: StemRole; label: string; instrument: SongRole | null }[] = [
  { role: "master", label: "Master", instrument: null },
  { role: "lead_guitar", label: "Lead Guitar", instrument: "lead_guitar" },
  { role: "rhythm_guitar", label: "Rhythm Guitar", instrument: "rhythm_guitar" },
  { role: "bass", label: "Bass", instrument: "bass" },
  { role: "drums", label: "Drums", instrument: "drums" },
  { role: "drums_2", label: "Drums 2", instrument: "drums" },
  { role: "drums_3", label: "Drums 3", instrument: "drums" },
  { role: "drums_4", label: "Drums 4", instrument: "drums" },
  { role: "keys", label: "Keys", instrument: "keys" },
  { role: "vocals", label: "Vocals", instrument: "vocals" },
  { role: "harmony", label: "Harmony", instrument: "vocals" },
  { role: "crowd", label: "Crowd", instrument: null },
];

/**
 * The audio block a song document carries, from the files a source found.
 *
 * The only interesting decision is **which file is the song** — see `mixPresetsFor`.
 */
export function audioFromFiles(files: Partial<Record<StemRole, string>>): SourceAudio {
  const stems: SourceStem[] = [];
  for (const spec of SOURCE_STEMS) {
    const url = files[spec.role];
    if (!url) continue;
    stems.push({
      id: `stem_${spec.role}`,
      name: spec.label,
      url,
      instrument: spec.instrument,
      defaultGainDb: 0,
      offsetMs: 0,
    });
  }
  return { source: "stems", stems, mixPresets: mixPresetsFor(stems), preview: null };
}

/**
 * The named mixes a song's stems can make: the whole song, and every part at once.
 *
 * **Which files are the song is not the same question in every folder**, and getting it
 * wrong is a game that plays without its lead instrument. Measured across the
 * test library, a chart folder's `song.ogg` shares **almost nothing** with the
 * instrument files beside it — over a 15-second window the correlation is r ≈ 0.01
 * at the best lag, where a master that *contained* those parts would sit near 0.3 or
 * more. The parts are therefore the instruments, and the master is the mix with them
 * **taken out**: the backing the game needs so a miss can mute a part. So:
 *
 * - a chart folder of **one or two parts** is the master *and* its parts together — playing
 *   the master alone is the song without its guitar, which is what "vocals and drums,
 *   guitar every now and then" was;
 * - a **multitrack** of three or more parts already carries the whole song in its
 *   parts (measured at ~95% against masters that are 22–88% present, some opening
 *   with a minute of silence), so the parts are the song and the master is the bed.
 *
 * The count is of **instruments**, not files: a kit cut into `drums.ogg` +
 * `drums_1..4.ogg` is one part on the stage, and counting its files would call a
 * one-instrument chart folder a multitrack and let a missed drum note mute the whole kit.
 * Every file of those parts stays in the mix — the parts list is of stems, whichever
 * way the threshold falls.
 *
 * An empty preset is not offered, and a song with no audio has none: silence is said
 * by having nothing to play rather than by a list of nothing.
 */
export function mixPresetsFor(
  stems: readonly { id: string; instrument: SongRole | null }[],
): { id: string; stemIds: string[] }[] {
  const parts = stems.filter((stem) => stem.instrument !== null).map((stem) => stem.id);
  // Three **instruments**, however many files they were cut into: a drum kit in four
  // files is still one thing somebody plays.
  const instruments = new Set(
    stems.flatMap((stem) => (stem.instrument === null ? [] : [stem.instrument])),
  );
  const master = stems.find((stem) => stem.id === "stem_master");
  const full =
    instruments.size >= 3 ? parts : master ? [master.id, ...parts] : parts;
  const presets = [
    { id: FULL_PRESET, stemIds: full },
    { id: PARTS_PRESET, stemIds: parts },
  ];
  return presets.filter((preset) => preset.stemIds.length > 0);
}

/**
 * What a folder called `Artist - Title` says that a file did not.
 *
 * The sources are inconsistent about this: most name the song in their own metadata,
 * but some copies carry no `song.ini` at all, and then the folder name — which every
 * folder writes as `Artist - Title` — is the only thing that knows. It is a **fallback**
 * and never an override: anything the file states wins.
 */
export function folderAttribution(
  folderName: string,
): { artist: string; title: string } | null {
  const parts = folderName.split(" - ");
  if (parts.length < 2) return null;
  const artist = parts[0].trim();
  const title = parts.slice(1).join(" - ").trim();
  return artist && title ? { artist, title } : null;
}
