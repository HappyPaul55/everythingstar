/**
 * A parsed source as the three documents the game reads.
 *
 * The readers are `source.ts` (`readSongDoc`, `readChart`) and the shape they
 * expect is the one `mock/files.ts` writes; this is the same shape, built from a
 * converter's output rather than from a fixture. Two callers use it, which is why
 * it is here and not in the importer:
 *
 * - the **importer**, which writes the files to disk for a library to serve;
 * - the **runtime**, which builds the song document **in memory** so a source
 *   opened straight from a folder or a URL is a track like any other.
 */

import {
  DIFFICULTIES,
  INSTRUMENT_KINDS,
  LANE_ROLES,
  type Difficulty,
  type InstrumentKind,
  type LaneChart,
  type LaneRole,
  type MelodyChart,
} from "../track";
import {
  assembleTrack,
  type AudioAction,
  type AudioControl,
  type SourceAudio,
  type SourcePart,
  type SourceSongDoc,
  type TrackBuild,
} from "../source";
import { songRoleFor, type SongRole } from "../song";
import { slug } from "../text";
import type { ParsedSource } from "./types";

/** One file of a converted source, at the path it is served from. */
export interface SourceFile {
  path: string;
  body: string;
}

/**
 * Where a converted source's documents go.
 *
 * The default is the importer's library layout (`songs/<id>.json` beside
 * `charts/<id>/…`). A layout lets a caller write the same documents into a
 * **per-song folder** instead, which is what a folder that should also be
 * readable as a Guitar Hero / Clone Hero / YARG song needs.
 *
 * The `…Url` functions are the path **as seen from the song document**, because
 * that is the base every chart URL is resolved against.
 */
export interface WriteLayout {
  song: (id: string) => string;
  chart: (
    id: string,
    instrument: InstrumentKind,
    difficulty: Difficulty,
    role?: LaneRole,
  ) => string;
  voice: (id: string, hasPitch: boolean) => string;
  chartUrl: (
    id: string,
    instrument: InstrumentKind,
    difficulty: Difficulty,
    role?: LaneRole,
  ) => string;
  voiceUrl: (id: string, hasPitch: boolean) => string;
}

/** The importer's library layout: one `songs/` and one `charts/` tree. */
const LIBRARY_LAYOUT: WriteLayout = {
  song: songPath,
  chart: chartPath,
  voice: voicePath,
  chartUrl: (id, instrument, difficulty, role) =>
    `../${chartPath(id, instrument, difficulty, role)}`,
  voiceUrl: (id, hasPitch) => `../${voicePath(id, hasPitch)}`,
};

/** Where a source's song document goes under a library root. */
function songPath(id: string): string {
  return `songs/${id}.json`;
}

/**
 * Where one lane chart goes. A guitar role is part of the name: a lead and a
 * rhythm chart at the same difficulty are two documents, not one overwritten.
 */
function chartPath(
  id: string,
  instrument: InstrumentKind,
  difficulty: Difficulty,
  role?: LaneRole,
): string {
  return `charts/${id}/${instrument}${role ? `-${role}` : ""}-${difficulty}.json`;
}

/** Where the voice chart goes. */
function voicePath(id: string, hasPitch: boolean): string {
  return `charts/${id}/${hasPitch ? "vocals" : "lyrics"}.json`;
}

/** The instruments a source's stems are for. */
const STEM_ROLES: Record<string, SongRole[]> = {
  guitar: ["lead_guitar", "rhythm_guitar"],
  bass: ["bass"],
  drums: ["drums"],
  keys: ["keys"],
  dance: [],
};

const HIT: AudioAction = { action: "unmute", fadeMs: 20, restore: null };
const MISS: AudioAction = { action: "mute", fadeMs: 80, restore: "next_hit" };

/**
 * The stems each part drops out, for **this** source.
 *
 * A chart folder names its audio by convention, and one name lies often enough to matter: a
 * song with a **bass part but no `bass.ogg`** ships the bass as `rhythm.ogg`. Measured
 * on a bass-led test song: `rhythm.ogg` is ~22 dB louder below 160 Hz than
 * between 250 Hz and 2.5 kHz — that is the bass, whatever the file is called. So the
 * second instrument file belongs to the **bass part**; leaving it with the guitar is
 * what made a missed guitar note take the bass out too.
 *
 * With a `bass.ogg` present (even a silent one), the names mean what they say and the
 * guitar keeps its rhythm track. A song with no bass chart keeps it too: a rhythm track
 * is a guitar part there.
 */
function stemRoles(source: ParsedSource): Record<string, SongRole[]> {
  const hasBassChart = source.lanes.some((chart) => chart.instrument === "bass");
  const hasBassStem = source.audio.stems.some((stem) => stem.instrument === "bass");
  const hasRhythmStem = source.audio.stems.some(
    (stem) => stem.instrument === "rhythm_guitar",
  );
  if (hasBassChart && !hasBassStem && hasRhythmStem) {
    return {
      ...STEM_ROLES,
      guitar: ["lead_guitar"],
      bass: ["bass", "rhythm_guitar"],
    };
  }
  return STEM_ROLES;
}

/** The stems a part drops out when it is missed. */
function controlFor(audio: SourceAudio, roles: SongRole[]): AudioControl | null {
  const stems = audio.stems
    .filter((stem) => stem.instrument !== null && roles.includes(stem.instrument))
    .map((stem) => stem.id);
  if (stems.length === 0) return null;
  return { stems, onHit: HIT, onMiss: MISS, onSustainBreak: null };
}

/**
 * The song document for a source, **in memory**.
 *
 * `urlFor` says where each chart lives, because the two callers differ: a file on
 * disk has a path beside its song document, while a source read at runtime already
 * has its notes and needs no URL at all.
 */
export function sourceToSongDoc(
  source: ParsedSource,
  urlFor: (
    instrument: InstrumentKind | "words",
    difficulty: Difficulty | null,
    role?: LaneRole,
  ) => string = () => "",
): SourceSongDoc {
  const id = source.meta.id;
  const parts: SourcePart[] = [];
  const stemRolesByKind = stemRoles(source);

  for (const kind of INSTRUMENT_KINDS) {
    const charts = source.lanes.filter((chart) => chart.instrument === kind);
    if (charts.length === 0) continue;
    // **The two guitar flavours are two parts.** A part is a thing somebody can
    // play, and a lead guitarist is not playing the rhythm chart — so each role is
    // its own part, with the id a library and a band both know. An instrument with
    // no role keeps the id it has always had.
    const roles = LANE_ROLES.filter((role) => charts.some((chart) => chart.role === role));
    const groups =
      roles.length > 0
        ? [
            ...roles.map((role) => ({
              role,
              charts: charts.filter((chart) => chart.role === role),
            })),
            ...(charts.some((chart) => !chart.role)
              ? [{ role: undefined, charts: charts.filter((chart) => !chart.role) }]
              : []),
          ]
        : [{ role: undefined, charts }];
    for (const group of groups) {
      if (group.charts.length === 0) continue;
      // A role owns its own stem when the chart folder shipped one; it shares the
      // instrument's stems only when the chart folder has one guitar file for both charts.
      // Otherwise a missed lead would take the rhythm out with it.
      const own = group.role ? songRoleFor(group.role) : null;
      const all = stemRolesByKind[kind] ?? [];
      const controlled = own && all.includes(own) ? [own] : all;
      parts.push({
        id: group.role ? `part_${group.role}_${kind}` : `part_${kind}`,
        role: group.role ? songRoleFor(group.role) : kind,
        label: null,
        controllerTypes: [],
        audioControl: controlFor(source.audio, controlled),
        charts: group.charts.map((chart) => ({
          id: `${id}-${group.role ? `${group.role}-` : ""}${kind}-${chart.difficulty}`,
          chartType: kind === "drums" ? "drums" : "lanes",
          difficulty: chart.difficulty,
          url: urlFor(kind, chart.difficulty, group.role),
          columns: chart.columns,
          bpm: chart.bpm ?? null,
          offsetMs: 0,
        })),
      });
    }
  }

  if (source.melody) {
    const chartType = source.melody.hasPitch ? "vocals" : "lyrics";
    parts.push({
      id: "part_vocals",
      role: "vocals",
      label: null,
      controllerTypes: [],
      audioControl: controlFor(source.audio, ["vocals"]),
      charts: [
        {
          id: `${id}-voice`,
          chartType,
          difficulty: null,
          url: urlFor("words", null),
          columns: null,
          bpm: null,
          offsetMs: 0,
        },
      ],
    });
  }

  return {
    id,
    title: source.meta.title,
    artist: { id: slug(source.meta.artist), name: source.meta.artist, art: null },
    album: source.meta.album
      ? { id: slug(source.meta.album), name: source.meta.album, year: source.meta.year, art: null }
      : null,
    art: source.meta.art,
    durationMs: source.meta.durationMs,
    previewStartMs: source.meta.previewStartMs,
    video: source.meta.video,
    audio: source.audio,
    parts,
    sections: source.sections,
  };
}

/** The track a run plays, straight from a source, with no file in between. */
export function trackFromSource(source: ParsedSource): TrackBuild {
  return assembleTrack(sourceToSongDoc(source), source.lanes, source.melody);
}

/**
 * A lane chart as its document.
 *
 * Exported because the mock's fixtures write through this too: a fixture and an
 * imported library must produce the same document, or a test proves nothing
 * about the reader.
 */
export function chartJson(chart: LaneChart): unknown {
  // A link is a note id in memory and a pair of coordinates in the file, so the
  // writer is where the two ends are looked up. A link whose target is not in the
  // chart is not a coordinate pair at all, so there is nothing to write.
  const byId = new Map(chart.notes.map((note) => [note.id, note]));
  const slides = chart.notes.flatMap((note) => {
    const target = note.slideTo === undefined ? undefined : byId.get(note.slideTo);
    if (!target) return [];
    return [{
      fromTimeMs: note.timeMs,
      fromColumn: note.column,
      toTimeMs: target.timeMs,
      toColumn: target.column,
    }];
  });
  return {
    schemaVersion: 1,
    chartType: chart.instrument === "drums" ? "drums" : "lanes",
    ...(chart.role ? { role: chart.role } : {}),
    columns: chart.columns,
    ...(chart.bpm !== undefined ? { bpm: chart.bpm } : {}),
    ...(chart.phrases && chart.phrases.length > 0 ? { phrases: chart.phrases } : {}),
    ...(chart.fills && chart.fills.length > 0 ? { fills: chart.fills } : {}),
    ...(slides.length > 0 ? { slides } : {}),
    notes: chart.notes.map((note) => ({
      timeMs: note.timeMs,
      lengthMs: note.lengthMs,
      kind: note.kind,
      column: note.column,
      ...(note.hero ? { hero: true } : {}),
    })),
  };
}

/** The melody as its document, shared with the mock's fixtures (`chartJson`). */
export function melodyJson(melody: MelodyChart): unknown {
  return {
    schemaVersion: 1,
    chartType: melody.hasPitch ? "vocals" : "lyrics",
    parts: melody.parts,
    rows: melody.rows,
    rootMidi: melody.rootMidi,
    lines: melody.lines.map((line) => ({
      timeMs: line.timeMs,
      endMs: line.endMs,
      freeform: line.freeform,
      parts: line.parts,
      words: line.words.map((word) => ({
        text: word.text,
        timeMs: word.timeMs - line.timeMs,
        hero: word.hero,
      })),
    })),
    notes: melody.notes.map((note) => ({
      timeMs: note.timeMs,
      lengthMs: note.lengthMs,
      part: note.part,
      row: note.row,
      text: note.text,
      ...(note.hero ? { hero: true } : {}),
    })),
  };
}

/**
 * A source as a **whole mini-library**: its playlist entry, its song document and
 * its chart documents, path-relative to each other so the tree can be served from
 * anywhere.
 */
export function writeSource(
  source: ParsedSource,
  layout: WriteLayout = LIBRARY_LAYOUT,
): { entry: unknown; files: SourceFile[] } {
  const id = source.meta.id;
  const songDoc = sourceToSongDoc(source, (kind, difficulty, role) =>
    kind === "words"
      ? layout.voiceUrl(id, source.melody?.hasPitch ?? false)
      : layout.chartUrl(id, kind, difficulty ?? "normal", role),
  );

  const files: SourceFile[] = [
    { path: layout.song(id), body: pretty(songDocumentJson(songDoc)) },
  ];
  for (const chart of source.lanes) {
    files.push({
      path: layout.chart(id, chart.instrument, chart.difficulty, chart.role),
      body: pretty(chartJson(chart)),
    });
  }
  if (source.melody) {
    files.push({ path: layout.voice(id, source.melody.hasPitch), body: pretty(melodyJson(source.melody)) });
  }

  return { entry: playlistEntry(source, layout.song(id)), files };
}

/**
 * One source as a playlist entry.
 *
 * The `song` reference is passed in because the two callers say it differently: an
 * imported library has a document beside it, while a folder read at runtime points
 * at the chart itself. Everything else — the offer, the art, the length — is the
 * same list either way.
 */
export function playlistEntry(source: ParsedSource, songRef: string): unknown {
  return {
    id: source.meta.id,
    song: songRef,
    title: source.meta.title,
    artist: source.meta.artist
      ? { id: slug(source.meta.artist), name: source.meta.artist }
      : { id: "", name: "" },
    ...(source.meta.album
      ? { album: { id: slug(source.meta.album), name: source.meta.album, year: source.meta.year } }
      : {}),
    ...(source.meta.art ? { art: source.meta.art } : {}),
    durationMs: source.meta.durationMs,
    previewStartMs: source.meta.previewStartMs,
    ...(source.meta.video ? { video: source.meta.video } : {}),
    offer: offerOf(source),
  };
}

/** A song document as the file the readers expect (their own key names). */
function songDocumentJson(doc: SourceSongDoc): unknown {
  return {
    schemaVersion: 1,
    id: doc.id,
    title: doc.title,
    artist: { id: doc.artist.id, name: doc.artist.name },
    ...(doc.album
      ? { album: { id: doc.album.id, name: doc.album.name, ...(doc.album.year !== null ? { year: doc.album.year } : {}) } }
      : {}),
    ...(doc.art ? { art: doc.art } : {}),
    durationMs: doc.durationMs,
    previewStartMs: doc.previewStartMs,
    ...(doc.video ? { video: doc.video } : {}),
    audio: {
      ...(doc.audio.source === "youtube" ? { source: "youtube" } : {}),
      stems: doc.audio.stems.map((stem) => ({
        id: stem.id,
        name: stem.name,
        url: stem.url,
        ...(stem.instrument ? { instrument: stem.instrument } : {}),
        ...(stem.defaultGainDb !== 0 ? { defaultGainDb: stem.defaultGainDb } : {}),
        ...(stem.offsetMs !== 0 ? { offsetMs: stem.offsetMs } : {}),
      })),
      mixPresets: Object.fromEntries(
        doc.audio.mixPresets.map((preset) => [preset.id, { stemIds: preset.stemIds }]),
      ),
      ...(doc.audio.preview ? { preview: doc.audio.preview } : {}),
    },
    ...(doc.sections.length > 0
      ? { sections: doc.sections.map((section) => ({ timeMs: section.timeMs, name: section.name })) }
      : {}),
    parts: doc.parts.map((part) => ({
      id: part.id,
      role: part.role,
      ...(part.label ? { label: part.label } : {}),
      controllerTypes: part.controllerTypes,
      ...(part.audioControl
        ? {
            audioControl: {
              controlledStemIds: part.audioControl.stems,
              ...(part.audioControl.onHit ? { onHit: actionJson(part.audioControl.onHit) } : {}),
              ...(part.audioControl.onMiss ? { onMiss: actionJson(part.audioControl.onMiss) } : {}),
              ...(part.audioControl.onSustainBreak
                ? { onSustainBreak: actionJson(part.audioControl.onSustainBreak) }
                : {}),
            },
          }
        : {}),
      charts: part.charts.map((chart) => ({
        id: chart.id,
        chartType: chart.chartType,
        ...(chart.difficulty ? { difficulty: chart.difficulty } : {}),
        ...(chart.columns !== null ? { laneCount: chart.columns } : {}),
        ...(chart.bpm !== null ? { bpm: chart.bpm } : {}),
        ...(chart.offsetMs !== 0 ? { offsetMs: chart.offsetMs } : {}),
        url: chart.url,
      })),
    })),
  };
}

function actionJson(action: AudioAction): unknown {
  return {
    action: action.action,
    fadeMs: action.fadeMs,
    ...(action.restore ? { restore: action.restore } : {}),
  };
}

/**
 * What a source offers a band, by role, with the difficulties each carries.
 *
 * The two guitar flavours are separate entries, because the band screen binds a
 * seat to a role and each role has its own charts. An instrument the source never
 * named a role for keeps its plain kind.
 */
function offerOf(source: ParsedSource): {
  instruments: { role: SongRole; difficulties: Difficulty[] }[];
  voice: { chartType: "vocals" | "lyrics"; parts: number } | null;
} {
  const difficultiesOf = (charts: readonly LaneChart[]): Difficulty[] => {
    const carried = new Set(charts.map((chart) => chart.difficulty));
    return DIFFICULTIES.filter((level) => carried.has(level));
  };
  const instruments = INSTRUMENT_KINDS.flatMap((kind) => {
    const charts = source.lanes.filter((chart) => chart.instrument === kind);
    if (charts.length === 0) return [];
    const roles = LANE_ROLES.filter((role) => charts.some((chart) => chart.role === role));
    if (roles.length === 0) {
      return [{ role: kind as SongRole, difficulties: difficultiesOf(charts) }];
    }
    const entries: { role: SongRole; difficulties: Difficulty[] }[] = roles.map((role) => ({
      role: songRoleFor(role),
      difficulties: difficultiesOf(charts.filter((chart) => chart.role === role)),
    }));
    const roleless = charts.filter((chart) => !chart.role);
    if (roleless.length > 0) {
      entries.push({ role: kind, difficulties: difficultiesOf(roleless) });
    }
    return entries;
  });
  return {
    instruments,
    voice: source.melody
      ? { chartType: source.melody.hasPitch ? "vocals" : "lyrics", parts: source.melody.parts }
      : null,
  };
}

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}
