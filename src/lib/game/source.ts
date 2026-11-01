/**
 * The **song document** and the **chart documents**: the files a playlist points
 * into. A playlist says what exists; these say what it is.
 *
 * ```
 * playlist.json  →  songs/<id>.json  →  charts/<part>/<level>.json
 *    the index          the song             the notes
 * ```
 *
 * A song document owns what a song *is* — its audio, its parts, and where each
 * part's charts live. A chart document is the notes themselves, in our own format
 * (`track.ts`): a highway's notes for one instrument at one difficulty, or the
 * melody's words and pitch. Nothing here fetches anything; the readers are pure, and
 * the loading that feeds them lives in the hook that uses them.
 */

import {
  chartProblems,
  cleanSlides,
  DIFFICULTIES,
  fitMelodyTurns,
  INSTRUMENT_KINDS,
  LANE_ROLES,
  MAX_NOTE_LENGTH_MS,
  MAX_NOTE_TIME_MS,
  MAX_PARTS,
  MAX_SONG_MS,
  nearestDifficulty,
  slideProblems,
  strums,
  type ChartPhrase,
  type Difficulty,
  type InstrumentKind,
  type LaneChart,
  type LaneNote,
  type LaneNoteKind,
  type LaneRole,
  type MelodyChart,
  type MelodyLine,
  type MelodyNote,
  type Track,
  type TrackSection,
} from "./track";
import {
  isSongRole,
  laneRoleOf,
  roleKind,
  SONG_INSTRUMENT_ROLES,
  type SongAlbum,
  type SongArtist,
  type SongOffer,
  type SongRole,
  type SongVideo,
  type SongVoice,
} from "./song";
import {
  flag,
  isObject,
  list,
  num,
  oneOf,
  resolveDocumentRef,
  schemaVersion,
  SCHEMA_VERSION,
  text,
} from "./read";
import { boundNotes } from "./sources/common";
import { contentDuration, SONG_TAIL_MS } from "./sources/duration";
import {
  FULL_PRESET,
  PARTS_PRESET,
  resolveStemPlan,
  type MixPreset,
} from "./audio/stemPlan";

/** What kind of chart a document holds. */
export type ChartType = "lanes" | "drums" | "vocals" | "lyrics";

const CHART_TYPES: ChartType[] = ["lanes", "drums", "vocals", "lyrics"];

/** Whether a chart type is a highway's or the voice's. */
function isVoiceChart(chartType: ChartType): boolean {
  return chartType === "vocals" || chartType === "lyrics";
}

/** One chart as the song document lists it: what it is, and where its notes are. */
export interface SourceChart {
  id: string;
  chartType: ChartType;
  /** Which guitar part it is, taken from the part that names it. */
  role?: LaneRole;
  /** Null for the voice: a singer's level is the microphone's, not a chart's. */
  difficulty: Difficulty | null;
  /** Its own document, absolute. */
  url: string;
  /** How many columns its highway has, when it is one. */
  columns: number | null;
  bpm: number | null;
  /** How far its notes sit from the audio. Applied when the notes are read. */
  offsetMs: number;
}

/** What a part does to the mix: the part rule — miss, and your stem ducks. */
export interface AudioControl {
  /** The stems this part plays. */
  stems: string[];
  onHit: AudioAction | null;
  onMiss: AudioAction | null;
  onSustainBreak: AudioAction | null;
}

export interface AudioAction {
  /** `unmute`, `mute` — what happens to the stems. */
  action: string;
  fadeMs: number;
  /** `next_hit`, `phrase_end` — when it is put back, if it is. */
  restore: string | null;
}

/** One stem of a song's audio. */
export interface SourceStem {
  id: string;
  name: string;
  url: string;
  /** What instrument it is, when it is one. */
  instrument: SongRole | null;
  defaultGainDb: number;
  offsetMs: number;
}

/** Where a song's sound comes from. */
export type AudioSource = "stems" | "youtube";

export interface SourceAudio {
  /**
   * `stems` is the ordinary case: the song's own files. `youtube` means the
   * **video is the music** — there are no stems to play, and the song document's
   * `video` must name a YouTube video. The game drives the official IFrame
   * Player API and follows its playhead; it never extracts the stream.
   */
  source: AudioSource;
  stems: SourceStem[];
  /** A named mix: the stem ids to play together. `full` is the whole song. */
  mixPresets: MixPreset[];
  /**
   * A clip a folder made for a jukebox, when it has one. **Not a stem**: nothing mixes
   * it into the song and a miss never mutes it. It is played from its own start; a
   * song without one previews its master instead (`previewFor`).
   */
  preview: string | null;
}

/** One of a song's parts: a thing somebody can play. */
export interface SourcePart {
  id: string;
  role: SongRole;
  label: string | null;
  controllerTypes: string[];
  audioControl: AudioControl | null;
  charts: SourceChart[];
}

/** A song document: everything about a song except its notes. */
export interface SourceSongDoc {
  id: string;
  title: string;
  artist: SongArtist;
  album: SongAlbum | null;
  art: string | null;
  durationMs: number;
  previewStartMs: number;
  video: SongVideo | null;
  audio: SourceAudio;
  parts: SourcePart[];
  /** The song's own structure, when it marks one: sections, in time order. */
  sections: TrackSection[];
}

/**
 * What a song document says a band can play.
 *
 * The playlist entry carries a summary, but the document is the truth: a local
 * folder remembered before a reader fix can still have an old summary saying
 * "no voice" while the document's parts plainly contain vocals. The band screen
 * asks this, so a stale entry cannot hide a game mode that is there.
 */
export function offerFromDoc(
  doc: SourceSongDoc,
  fallback: SongOffer = { instruments: [], voice: null },
): SongOffer {
  const instruments = new Map<SongRole, Set<Difficulty>>();
  let voice: SongVoice | null = null;

  for (const part of doc.parts) {
    if (part.role === "vocals") {
      const chart = part.charts.find(
        (entry) => entry.chartType === "vocals" || entry.chartType === "lyrics",
      );
      if (chart) {
        voice = {
          chartType: chart.chartType as SongVoice["chartType"],
          parts: Math.max(1, Math.min(MAX_PARTS, fallback.voice?.parts ?? 1)),
        };
      }
      continue;
    }
    const kind = roleKind(part.role);
    // Only the voice is the words, and that branch was taken above: this is the
    // type's narrowing rather than a case a document can reach.
    if (kind === "words") continue;
    const levels = instruments.get(part.role) ?? new Set<Difficulty>();
    for (const chart of part.charts) {
      if (chart.difficulty) levels.add(chart.difficulty);
    }
    if (levels.size > 0) instruments.set(part.role, levels);
  }

  return {
    instruments: SONG_INSTRUMENT_ROLES.flatMap((role) => {
      const levels = instruments.get(role);
      if (!levels || levels.size === 0) return [];
      const kind = roleKind(role);
      if (kind === "words") return [];
      const lane = laneRoleOf(role);
      return [{
        kind,
        ...(lane ? { role: lane } : {}),
        difficulties: DIFFICULTIES.filter((difficulty) => levels.has(difficulty)),
      }];
    }),
    voice,
  };
}

/**
 * Read a song document.
 *
 * `url` is its own absolute URL: its charts and its audio are resolved against that,
 * so a song carries its files with it wherever it is hosted.
 */
export function readSongDoc(
  body: unknown,
  url: string,
): { doc: SourceSongDoc | null; problems: string[] } {
  if (!isObject(body) || schemaVersion(body) !== SCHEMA_VERSION) {
    return { doc: null, problems: ["not a song document we can read"] };
  }
  const problems: string[] = [];
  const id = text(body.id);
  const title = text(body.title);
  if (!id || !title) return { doc: null, problems: ["a song needs an id and a title"] };

  const parts: SourcePart[] = [];
  for (const entry of list(body.parts)) {
    if (!isObject(entry)) continue;
    const role = entry.role;
    if (!isSongRole(role)) {
      problems.push(`${id}: ${String(role)} is not a part`);
      continue;
    }
    const charts: SourceChart[] = [];
    for (const chartEntry of list(entry.charts)) {
      const chart = readChartEntry(chartEntry, role, url);
      if (typeof chart === "string") problems.push(`${id}: ${chart}`);
      else charts.push(chart);
    }
    if (charts.length === 0) {
      problems.push(`${id}: ${role} has no charts`);
      continue;
    }
    parts.push({
      id: text(entry.id) ?? `${id}-${role}`,
      role,
      label: text(entry.label),
      controllerTypes: list(entry.controllerTypes).filter(
        (value): value is string => text(value) !== null,
      ),
      audioControl: readAudioControl(entry.audioControl),
      charts,
    });
  }

  const video = readVideo(body.video, url, id, problems);
  const audio = readAudio(body.audio, url, id, problems);
  // A YouTube-backed song has no file to fall back on: without the video it is
  // silent, and the two fields disagreeing is worth saying rather than discovering
  // on the stage.
  if (audio.source === "youtube" && video?.kind !== "youtube") {
    problems.push(`${id}: a YouTube audio source needs a YouTube video`);
  }

  return {
    doc: {
      id,
      title,
      artist: readArtist(body.artist, url, id, problems) ?? { id: "", name: "", art: null },
      album: readAlbum(body.album, url, id, problems),
      art: readArt(body.art, url, id, problems),
      durationMs: Math.max(0, num(body.durationMs) ?? 0),
      previewStartMs: Math.max(0, num(body.previewStartMs) ?? 0),
      video,
      audio,
      parts,
      sections: readSections(body.sections),
    },
    problems,
  };
}

/** The song's structure, when the document marks any. Untimed or unnamed ones drop. */
function readSections(value: unknown): TrackSection[] {
  return list(value)
    .flatMap((entry) => {
      if (!isObject(entry)) return [];
      const name = text(entry.name);
      const timeMs = num(entry.timeMs);
      if (!name || timeMs === null) return [];
      return [{ timeMs: Math.max(0, timeMs), name }];
    })
    .sort((a, b) => a.timeMs - b.timeMs);
}

/** One chart listing: `id`, a type, a level for a highway, and where its notes are. */
function readChartEntry(
  entry: unknown,
  role: SongRole,
  base: string,
): SourceChart | string {
  if (!isObject(entry)) return "a chart that is not an object";
  const chartType = oneOf(entry.chartType, CHART_TYPES);
  if (!chartType) return `“${String(entry.chartType)}” is not a kind of chart`;
  const ref = text(entry.url);
  if (!ref) return `a ${chartType} chart with no file`;
  const url = resolveDocumentRef(ref, base);
  if (!url) return `“${ref}” is not a URL this game will fetch`;

  const voice = isVoiceChart(chartType);
  // A voice chart is *the* melody: one of it, and no level — a singer's level is
  // the microphone's tolerance (`VOCAL_TOLERANCE`), the same on every song.
  if (voice && roleKind(role) !== "words") {
    return `a ${chartType} chart on ${role}, which is not the voice`;
  }
  if (!voice && roleKind(role) === "words") {
    return `a ${chartType} chart on the voice`;
  }
  const difficulty = voice ? null : oneOf(entry.difficulty, DIFFICULTIES);
  if (!voice && !difficulty) return `a ${chartType} chart with no difficulty`;

  const columns = voice ? null : Math.trunc(num(entry.laneCount) ?? 0);
  if (columns !== null && columns < 1) {
    return `a ${chartType} chart with no lane count`;
  }

  const laneRole = laneRoleOf(role);
  return {
    id: text(entry.id) ?? `${role}-${difficulty ?? chartType}`,
    chartType,
    ...(laneRole ? { role: laneRole } : {}),
    difficulty,
    url,
    columns,
    bpm: num(entry.bpm),
    offsetMs: num(entry.offsetMs) ?? 0,
  };
}

function readArtist(
  value: unknown,
  base: string,
  id: string,
  problems: string[],
): SongArtist | null {
  if (!isObject(value)) return null;
  const name = text(value.name);
  if (!name) return null;
  return { id: text(value.id) ?? "", name, art: readArt(value.art, base, id, problems) };
}

function readAlbum(
  value: unknown,
  base: string,
  id: string,
  problems: string[],
): SongAlbum | null {
  if (!isObject(value)) return null;
  const name = text(value.name);
  if (!name) return null;
  return {
    id: text(value.id) ?? "",
    name,
    year: num(value.year),
    art: readArt(value.art, base, id, problems),
  };
}

/** An art reference: resolved against the document that wrote it. */
function readArt(
  value: unknown,
  base: string,
  id: string,
  problems: string[],
): string | null {
  const ref = text(value);
  if (!ref) return null;
  const resolved = resolveDocumentRef(ref, base);
  if (!resolved) {
    problems.push(`${id}: “${ref}” is not an image this game will fetch`);
  }
  return resolved;
}

function readAudio(
  value: unknown,
  base: string,
  songId: string,
  problems: string[],
): SourceAudio {
  if (!isObject(value)) {
    return { source: "stems", stems: [], mixPresets: [], preview: null };
  }
  const stems: SourceStem[] = [];
  for (const entry of list(value.stems)) {
    if (!isObject(entry)) continue;
    const id = text(entry.id);
    const ref = text(entry.url);
    if (!id || !ref) continue;
    const url = resolveDocumentRef(ref, base);
    if (!url) {
      problems.push(`${songId}: stem “${ref}” is not a URL this game will fetch`);
      continue;
    }
    const instrument = oneOf(entry.instrument, [
      ...INSTRUMENT_KINDS,
      "lead_guitar",
      "rhythm_guitar",
      "vocals",
    ]);
    stems.push({
      id,
      name: text(entry.name) ?? id,
      url,
      instrument,
      defaultGainDb: num(entry.defaultGainDb) ?? 0,
      offsetMs: num(entry.offsetMs) ?? 0,
    });
  }

  const mixPresets = isObject(value.mixPresets)
    ? Object.entries(value.mixPresets).flatMap(([id, preset]) => {
        if (!isObject(preset)) return [];
        const stemIds = list(preset.stemIds).filter(
          (stem): stem is string => text(stem) !== null,
        );
        return [{ id, stemIds }];
      })
    : [];

  return {
    source: value.source === "youtube" ? "youtube" : "stems",
    stems,
    mixPresets,
    preview: readPreview(value.preview, base, songId, problems),
  };
}

/** A jukebox clip, resolved against the document that named it. */
function readPreview(
  value: unknown,
  base: string,
  id: string,
  problems: string[],
): string | null {
  const ref = text(value);
  if (!ref) return null;
  const resolved = resolveDocumentRef(ref, base);
  if (!resolved) {
    problems.push(`${id}: preview “${ref}” is not a URL this game will fetch`);
  }
  return resolved;
}

function readAudioControl(value: unknown): AudioControl | null {
  if (!isObject(value)) return null;
  return {
    stems: list(value.controlledStemIds).filter(
      (stem): stem is string => text(stem) !== null,
    ),
    onHit: readAction(value.onHit),
    onMiss: readAction(value.onMiss),
    onSustainBreak: readAction(value.onSustainBreak),
  };
}

function readAction(value: unknown): AudioAction | null {
  if (!isObject(value)) return null;
  const action = text(value.action);
  if (!action) return null;
  return {
    action,
    fadeMs: num(value.fadeMs) ?? 0,
    restore: text(value.restore),
  };
}

function readVideo(
  value: unknown,
  base: string,
  id: string,
  problems: string[],
): SongVideo | null {
  if (!isObject(value)) return null;
  if (value.kind === "youtube") {
    const videoId = text(value.id);
    return videoId ? { kind: "youtube", id: videoId } : null;
  }
  if (value.kind === "video") {
    const ref = text(value.url);
    if (!ref) return null;
    const url = resolveDocumentRef(ref, base);
    if (!url) {
      problems.push(`${id}: video “${ref}” is not a URL this game will fetch`);
      return null;
    }
    return { kind: "video", url };
  }
  return null;
}

/* ----------------------------------------------------------------- charts */

/**
 * Which chart one seat plays: their kind and guitar role at their difficulty — or,
 * when the song does not carry that one, the nearest it has, ties going to the
 * easier, exactly as `chartFor` settles a loaded track. A role the song does not
 * carry falls back the same way, so a remembered seat is never left chartless. The
 * voice has one chart and no level.
 */
export function sourceChartFor(
  doc: SourceSongDoc,
  kind: InstrumentKind | "words",
  difficulty: Difficulty,
  role?: LaneRole,
): SourceChart | null {
  const charts = sourceCharts(doc).filter((entry) => entry.of === kind);
  if (charts.length === 0) return null;
  if (kind === "words") return charts[0].chart;
  const roles = LANE_ROLES.filter((lane) =>
    charts.some((entry) => entry.chart.role === lane),
  );
  const plain = charts.filter((entry) => entry.chart.role === undefined);
  // A plain guitar chart is the lead a roleless seat means; prefer it over a role
  // the document happens to list first.
  const wanted =
    role !== undefined && roles.includes(role)
      ? role
      : plain.length > 0
        ? undefined
        : roles[0];
  const carrying = wanted ? charts.filter((entry) => entry.chart.role === wanted) : plain.length > 0 ? plain : charts;
  const levels = carrying.map((entry) => entry.chart.difficulty as Difficulty);
  const settled = nearestDifficulty(levels, difficulty);
  return carrying.find((entry) => entry.chart.difficulty === settled)?.chart ?? null;
}

/** One chart a band's seats need, and the kind (and role) that will play it. */
export interface WantedChart {
  kind: InstrumentKind | "words";
  role?: LaneRole;
  chart: SourceChart;
}

/**
 * Which charts a band needs from a song document.
 *
 * One per seat, deduplicated by URL — so two guitar seats bound to the lead and the
 * rhythm ask for two charts, while two seats on one role share it. With **no
 * seats** — Listen — the song's own voice chart is wanted as well: a read-along is a
 * property of the song, not of the playlist summary that happened to offer it. A
 * non-empty band is unchanged: it asks for its own seats and nothing else.
 */
export function wantedCharts(
  doc: SourceSongDoc,
  seats: readonly { kind: InstrumentKind | "words"; difficulty: Difficulty; role?: LaneRole }[],
): WantedChart[] {
  const wanted = new Map<string, WantedChart>();
  for (const seat of seats) {
    const chart = sourceChartFor(doc, seat.kind, seat.difficulty, seat.role);
    if (chart && !wanted.has(chart.url)) {
      wanted.set(chart.url, {
        kind: seat.kind,
        ...(chart.role ? { role: chart.role } : {}),
        chart,
      });
    }
  }
  if (seats.length === 0) {
    const voice = sourceChartFor(doc, "words", "normal");
    if (voice && !wanted.has(voice.url)) wanted.set(voice.url, { kind: "words", chart: voice });
  }
  return [...wanted.values()];
}

/** Every chart a song carries, with the kind it belongs to. */
function sourceCharts(
  doc: SourceSongDoc,
): { chart: SourceChart; of: InstrumentKind | "words"; role: SongRole }[] {
  return doc.parts.flatMap((part) =>
    part.charts.map((chart) => ({
      chart,
      of: roleKind(part.role),
      role: part.role,
    })),
  );
}

/**
 * Read a chart document into what the stage judges.
 *
 * A highway comes back as a `LaneChart` and the voice as a `MelodyChart` — our own
 * format, so nothing downstream knows a file was involved. Notes carry no ids in the
 * file: they are numbered here, which is one less thing for a converter to get right.
 */
export function readChart(
  body: unknown,
  chart: SourceChart,
  kind: InstrumentKind | "words",
): { lane: LaneChart | null; melody: MelodyChart | null; problems: string[] } {
  const none = { lane: null, melody: null };
  if (!isObject(body) || schemaVersion(body) !== SCHEMA_VERSION) {
    return { ...none, problems: [`${chart.id}: not a chart document we can read`] };
  }
  const told = oneOf(body.chartType, CHART_TYPES);
  if (told !== null && told !== chart.chartType) {
    return { ...none, problems: [`${chart.id}: says it is ${told}, listed as ${chart.chartType}`] };
  }
  if (isVoiceChart(chart.chartType)) {
    if (kind !== "words") {
      return { ...none, problems: [`${chart.id}: a voice chart on ${kind}`] };
    }
    const melody = readMelody(body, chart);
    return { lane: null, melody: melody.chart, problems: melody.problems };
  }
  if (kind === "words") {
    return { ...none, problems: [`${chart.id}: a lane chart on the voice`] };
  }
  const lane = readLanes(body, chart, kind);
  return { lane: lane.chart, melody: null, problems: lane.problems };
}

const LANE_KINDS: LaneNoteKind[] = ["strum", "hopo"];

/**
 * The kind a note can actually be on this instrument.
 *
 * Every note is a strum or a hopo. A tapped instrument has no hammer-on, so a
 * document that called one of its notes `hopo` is brought back to `strum`; an older
 * document's `tap` is read as `strum` before this is asked. The controller decides
 * whether the note is performed with a strum bar or a key press.
 */
function playableKind(
  kind: LaneNoteKind,
  strummed: boolean,
  plain: LaneNoteKind,
): LaneNoteKind {
  // A tapped instrument has no hammer-on: its notes are ordinary strums, and the
  // controller plays them by tapping. `plain` is always `strum` now; keeping it a
  // parameter makes the two callers read the same.
  if (!strummed) return plain;
  return kind === "hopo" ? "hopo" : plain;
}

function readLanes(
  body: Record<string, unknown>,
  chart: SourceChart,
  instrument: InstrumentKind,
): { chart: LaneChart | null; problems: string[] } {
  const problems: string[] = [];
  const columns = chart.columns ?? 0;
  const offset = chart.offsetMs;
  const strummed = strums(instrument);
  const plain: LaneNoteKind = "strum";
  const notes: Omit<LaneNote, "id">[] = [];
  for (const entry of list(body.notes)) {
    if (!isObject(entry)) continue;
    const at = num(entry.timeMs);
    if (at === null || at < 0) {
      problems.push(`${chart.id}: a note with no time`);
      continue;
    }
    const lengthMs = Math.min(
      MAX_NOTE_LENGTH_MS,
      Math.max(0, num(entry.lengthMs) ?? 0),
    );
    const raw = num(entry.column);
    // A null column is the **open** note, which every highway can play. A number
    // outside the chart's own columns is a note that could never be drawn or hit,
    // so it is dropped and named rather than loaded as an unplayable blur. An
    // unknown column count (`0`) bounds nothing: leave the note alone.
    const column = raw === null ? null : Math.trunc(raw);
    if (column !== null && columns > 0 && (column < 0 || column >= columns)) {
      problems.push(`${chart.id}: a note outside the ${columns} columns`);
      continue;
    }
    // `tap` was an older document's name for an ordinary note on a tapped
    // instrument. It is read as a strum now, which is the same note.
    const toldKind = entry.kind === "tap" ? "strum" : entry.kind;
    const timeMs = at + offset;
    if (!Number.isFinite(timeMs) || timeMs > MAX_NOTE_TIME_MS) {
      // A note hours into a song nobody wrote is a chart that never ends: the
      // progress bar, the last-note gate and the run's own end all read this time.
      problems.push(`${chart.id}: a note past the end of any song`);
      continue;
    }
    notes.push({
      timeMs: Math.max(0, timeMs),
      lengthMs,
      kind: playableKind(oneOf(toldKind, LANE_KINDS) ?? plain, strummed, plain),
      column,
      hero: flag(entry.hero),
    });
  }
  notes.sort((a, b) => a.timeMs - b.timeMs);
  // The first note has nothing before it to hammer on from, so a hopo there is the
  // instrument's own kind — the same correction the MIDI and `.chart` readers make
  // before `chartProblems` ever sees the chart.
  if (notes[0]?.kind === "hopo") notes[0] = { ...notes[0], kind: "strum" };
  const phrases = readSpans(body.phrases, offset).filter((span) => span.endMs >= span.startMs);
  // A **fill** is a drum chart's freestyle window, and only a drum chart has one.
  // A fill with no time in it is nothing at all, so it is dropped rather than
  // loaded as a window that would never open.
  const fills =
    instrument === "drums"
      ? readSpans(body.fills, offset).filter((span) => span.endMs > span.startMs)
      : [];
  // Numbered after the sort, so a chart's ids run in its own order whatever order
  // the file happened to write its notes in. The **slides** are coordinates until
  // here, because the file has no ids: they are resolved against this list.
  const numbered = notes.map((note, index) => ({ ...note, id: `${chart.id}:${index}` }));
  return {
    chart: {
      instrument,
      ...(chart.role ? { role: chart.role } : {}),
      difficulty: chart.difficulty ?? "normal",
      columns,
      // The chart's tempo, when it declared one: what the highway's beat grid is
      // drawn from. Absent means no grid, never a guessed one.
      ...(typeof chart.bpm === "number" && chart.bpm > 0 ? { bpm: chart.bpm } : {}),
      // The energy phrases, when it marks any: the meter's own spans.
      ...(phrases.length > 0 ? { phrases } : {}),
      // The drum fills, when it marks any: freestyle windows, not notes.
      ...(fills.length > 0 ? { fills } : {}),
      notes: readSlides(body.slides, numbered, offset, chart.id, problems),
    },
    problems,
  };
}

/**
 * The chart's **slides**, as links between the notes they name.
 *
 * A slide is two coordinates in the file — where it leaves and where it arrives —
 * because a document has no note ids. One note per time and column is what a cell
 * means; a cell two notes call their own is ambiguous and named rather than
 * guessed. Coordinates share the notes' clock, so the chart's own `offsetMs` moves
 * both and they keep meeting.
 *
 * Every link is then held to `slideProblems`, the same rule the stage applies, and
 * `cleanSlides` drops what it refuses: a source may be half a chart's problem, but
 * a chart with one bad link is still a chart. Only the link list is at stake here —
 * `chartProblems` is the caller's gate.
 */
function readSlides(
  value: unknown,
  notes: readonly LaneNote[],
  offset: number,
  chartId: string,
  problems: string[],
): LaneNote[] {
  const entries = list(value);
  if (entries.length === 0) return notes.slice();

  // A cell with more than one note is nobody's target: `null` says ambiguous and
  // `undefined` says absent — the two faults a coordinate can have.
  const byCell = new Map<string, LaneNote | null>();
  for (const note of notes) {
    const key = cellKey(note.timeMs, note.column);
    byCell.set(key, byCell.has(key) ? null : note);
  }

  const links = new Map<string, string>();
  for (const entry of entries) {
    if (!isObject(entry)) {
      problems.push(`${chartId}: a slide that is not an object`);
      continue;
    }
    const fromTime = num(entry.fromTimeMs);
    const toTime = num(entry.toTimeMs);
    const fromColumn = slideColumn(entry.fromColumn);
    const toColumn = slideColumn(entry.toColumn);
    if (
      fromTime === null ||
      toTime === null ||
      fromColumn === undefined ||
      toColumn === undefined
    ) {
      problems.push(`${chartId}: a slide without both ends`);
      continue;
    }
    const fromAt = Math.max(0, fromTime + offset);
    const toAt = Math.max(0, toTime + offset);
    const from = byCell.get(cellKey(fromAt, fromColumn));
    const to = byCell.get(cellKey(toAt, toColumn));
    if (from === null || to === null) {
      const [at, column] = from === null ? [fromAt, fromColumn] : [toAt, toColumn];
      problems.push(
        `${chartId}: a slide end at ${at} ms column ${columnWord(column)} is on more than one note`,
      );
      continue;
    }
    if (!from || !to) {
      const [at, column] = from ? [toAt, toColumn] : [fromAt, fromColumn];
      problems.push(
        `${chartId}: a slide end at ${at} ms column ${columnWord(column)} is not a note`,
      );
      continue;
    }
    // One source, one glide: a second link on the same note is not a chart a
    // finger can follow. (A link to the note itself is `slideProblems`' to name.)
    if (links.has(from.id)) {
      problems.push(
        `${chartId}: the note at ${fromAt} ms column ${columnWord(fromColumn)} slides more than once`,
      );
      continue;
    }
    links.set(from.id, to.id);
  }

  const linked = notes.map((note) => {
    const target = links.get(note.id);
    return target === undefined ? note : { ...note, slideTo: target };
  });
  // The size, column and ordering rules are `track.ts`'s own, so the reader and
  // the charter explain a bad link the same way.
  problems.push(...slideProblems(linked));
  return cleanSlides(linked);
}

/** A slide coordinate's cell: the note's time and column, with an open note's `null`. */
function cellKey(timeMs: number, column: number | null): string {
  return `${timeMs}:${column === null ? "open" : column}`;
}

/**
 * A slide coordinate's column: a number, `null` for the open note at that time, or
 * `undefined` when the document's value is not a column at all.
 */
function slideColumn(value: unknown): number | null | undefined {
  if (value === null) return null;
  const column = num(value);
  return column === null ? undefined : Math.trunc(column);
}

function columnWord(column: number | null): string {
  return column === null ? "open" : String(column);
}

/**
 * The spans a chart document lists under `key` — its energy phrases, or its drum
 * fills — moved onto the chart's own clock by its declared offset and sorted into
 * time order. A malformed entry is skipped rather than standing in for one.
 */
function readSpans(value: unknown, offset: number): ChartPhrase[] {
  const spans: ChartPhrase[] = [];
  for (const entry of list(value)) {
    if (!isObject(entry)) continue;
    const startMs = num(entry.startMs);
    const endMs = num(entry.endMs);
    if (startMs === null || endMs === null) continue;
    spans.push({
      startMs: Math.max(0, startMs + offset),
      endMs: Math.max(0, endMs + offset),
    });
  }
  return spans.sort((a, b) => a.startMs - b.startMs);
}

function readMelody(
  body: Record<string, unknown>,
  chart: SourceChart,
): { chart: MelodyChart | null; problems: string[] } {
  const problems: string[] = [];
  const hasPitch = chart.chartType === "vocals";
  const rows = Math.max(1, Math.trunc(num(body.rows) ?? 6));
  const rootMidi = Math.trunc(num(body.rootMidi) ?? 57);
  const declaredParts = Math.max(1, Math.trunc(num(body.parts) ?? 1));
  const parts = Math.min(MAX_PARTS, declaredParts);
  const sharedPart = Math.max(0, parts - 1);
  const offset = chart.offsetMs;
  /** Whether a line or word actually lands beyond the parts the stage can draw. */
  let sharedVoice = false;

  const lines: MelodyLine[] = [];
  for (const entry of list(body.lines)) {
    if (!isObject(entry)) continue;
    const at = num(entry.timeMs);
    if (at === null) continue;
    const words = list(entry.words)
      .flatMap((word) => {
        if (!isObject(word)) return [];
        const text_ = text(word.text);
        const wordAt = num(word.timeMs);
        if (text_ === null || wordAt === null) return [];
        return [{ text: text_, timeMs: at + wordAt, hero: flag(word.hero) }];
      })
      // The order of the array is how every engine reads a word's end (the next
      // word's start), so a source that wrote them out of order would make each
      // deadline land before its own word. Sorting fixes the reader rather than
      // every consumer.
      .sort((a, b) => a.timeMs - b.timeMs);
    if (words.length === 0) continue;
    // A shared fourth voice must appear once on a line, not twice: the two source
    // parts collapse onto the last colour, and a duplicated entry would draw the
    // same block twice.
    const lineParts = new Map<number, number>();
    for (const part of list(entry.parts)) {
      if (!isObject(part)) continue;
      const index = Math.trunc(num(part.part) ?? 0);
      if (index < 0 || index >= declaredParts) continue;
      const placed = Math.min(index, sharedPart);
      if (index > sharedPart) sharedVoice = true;
      if (!lineParts.has(placed)) {
        lineParts.set(placed, Math.trunc(num(part.offset) ?? 0));
      }
    }
    const lineStart = Math.max(0, at + offset);
    if (!Number.isFinite(lineStart) || lineStart > MAX_NOTE_TIME_MS) {
      problems.push(`${chart.id}: a line past the end of any song`);
      continue;
    }
    const statedEnd = (num(entry.endMs) ?? at) + offset;
    lines.push({
      timeMs: lineStart,
      // A line may not end before it starts, or hours after any song: the views
      // and the typist's deadline both read `endMs` as a moment. The order matters:
      // clamping to the ceiling first and *then* to the start is what keeps a line
      // at the ceiling from ending before it begins.
      endMs: Math.max(
        lineStart,
        Math.min(
          MAX_NOTE_TIME_MS,
          Number.isFinite(statedEnd) ? statedEnd : lineStart,
        ),
      ),
      freeform: flag(entry.freeform),
      parts: [...lineParts].map(([part, partOffset]) => ({ part, offset: partOffset })),
      words: words.map((word) => ({
        ...word,
        timeMs: Math.max(0, word.timeMs + offset),
      })),
    });
  }
  lines.sort((a, b) => a.timeMs - b.timeMs);

  const notes: Omit<MelodyNote, "id">[] = [];
  for (const entry of list(body.notes)) {
    if (!isObject(entry)) continue;
    const at = num(entry.timeMs);
    const part = Math.trunc(num(entry.part) ?? 0);
    const text_ = text(entry.text);
    if (at === null || text_ === null) continue;
    if (part < 0 || part >= declaredParts) {
      problems.push(`${chart.id}: a word on part ${part}`);
      continue;
    }
    const placed = Math.min(part, sharedPart);
    if (part > sharedPart) sharedVoice = true;
    const row = num(entry.row);
    const clamped = row === null ? null : Math.trunc(row);
    if (clamped !== null && (clamped < 0 || clamped >= rows)) {
      problems.push(`${chart.id}: a word above the roll`);
      continue;
    }
    const timeMs = at + offset;
    if (!Number.isFinite(timeMs) || timeMs > MAX_NOTE_TIME_MS) {
      problems.push(`${chart.id}: a word past the end of any song`);
      continue;
    }
    notes.push({
      timeMs: Math.max(0, timeMs),
      lengthMs: Math.min(
        MAX_NOTE_LENGTH_MS,
        Math.max(0, num(entry.lengthMs) ?? 0),
      ),
      part: placed,
      // A `vocals` chart can still contain a freeform word: its row is null, not
      // row 0. Forcing it to the bottom of the roll would turn a spoken word into a
      // pitch nobody can sing.
      row: clamped,
      text: text_,
      hero: flag(entry.hero),
    });
  }
  notes.sort((a, b) => a.timeMs - b.timeMs || a.part - b.part);

  if (sharedVoice) {
    // Only a voice that actually has words beyond the ceiling is worth saying:
    // a provider that always declares four parts but sings on three needs no
    // warning, and a fourth harmony is shared rather than dropped.
    problems.push(`${chart.id}: voices beyond ${parts} share the last part`);
  }

  return {
    chart: {
      parts,
      hasPitch,
      rows,
      rootMidi,
      lines,
      notes: notes.map((note, index) => ({ ...note, id: `${chart.id}:${index}` })),
    },
    problems,
  };
}

/** A melody of nothing, for a song that has no words at all. */
export const EMPTY_MELODY: MelodyChart = {
  parts: 1,
  hasPitch: false,
  rows: 6,
  rootMidi: 57,
  lines: [],
  notes: [],
};

/**
 * The files a run plays: the `full` mix a song document names, or everything it has
 * when it names none.
 *
 * `full` is the whole song — one file, or every stem at once for a folder that ships no
 * whole mix. Choosing a **part's** preset by mistake would play a single instrument
 * and call it the music, which is why the choice lives here rather than wherever the
 * audio happens to be played. A preset naming nothing the song has falls back to all
 * of them: a drift between the two must still be a song rather than silence.
 */
export function fullMixStems(doc: Pick<SourceSongDoc, "audio">): string[] {
  const { stems, mixPresets } = doc.audio;
  if (stems.length === 0) return [];
  // `full` is the named whole-song mix; a document that names no `full` at all is
  // answered by the first preset it does name. The fallback is every stem, because
  // the songs that reach this branch are the ones whose whole-song preset is missing
  // or stale, and every file at once is still the song.
  const presetId = mixPresets.some((entry) => entry.id === FULL_PRESET)
    ? FULL_PRESET
    : (mixPresets[0]?.id ?? null);
  return resolveStemPlan(
    stems,
    mixPresets,
    presetId,
    stems.map((stem) => stem.url),
  ).urls;
}

/**
 * The song's parts, each on its own — what a run falls back to when the mix will not
 * play at all.
 *
 * Chart folders ship files that are wrong in ways a name cannot show: a **0-byte**
 * `song.ogg` is not uncommon, and a truncated one is nobody's idea until it has been
 * played. So
 * the whole mix is tried first and the parts are the answer if it does not arrive,
 * which is the same "a song with a part missing is still a band" the stage already
 * says about a chart.
 */
export function partStems(doc: Pick<SourceSongDoc, "audio">): string[] {
  return resolveStemPlan(
    doc.audio.stems,
    doc.audio.mixPresets,
    PARTS_PRESET,
    doc.audio.stems
      .filter((stem) => stem.instrument !== null)
      .map((stem) => stem.url),
  ).urls;
}

/** What a jukebox can play to remind somebody what a song is. */
export interface SongPreview {
  url: string;
  /** Where the clip starts in its file: 0 for a clip, the song's cue otherwise. */
  startMs: number;
}

/**
 * The sound a jukebox plays for a song it is only **offering**.
 *
 * A folder's **preview clip** is already the right thing — a short reminder — so it is
 * played from its own start. Without one, the song's **master** is played from its
 * `previewStartMs`, which is the cue the song itself names (or the beginning when it
 * names none). A song with neither — parts and no whole mix — has nothing to preview:
 * one instrument alone is a preview of the wrong thing.
 */
export function previewFor(
  doc: Pick<SourceSongDoc, "previewStartMs" | "audio">,
): SongPreview | null {
  if (doc.audio.preview) return { url: doc.audio.preview, startMs: 0 };
  // The master is the whole song. `stem_master` is the name every chart folder uses, but a
  // document is somebody else's file: an unnamed master is a stem with no
  // instrument, and any other instrument is a part rather than a preview of the
  // song.
  const master =
    doc.audio.stems.find((stem) => stem.id === "stem_master") ??
    doc.audio.stems.find((stem) => stem.instrument === null);
  if (!master) return null;
  return { url: master.url, startMs: Math.max(0, doc.previewStartMs) };
}

/**
 * How long a track is played at.
 *
 * A song document may state no length: a YouTube-backed song can only learn it
 * when the video ends, and a document read from a source that never wrote one has
 * nothing to say. Zero is therefore **unknown**, and a run on it would end on its
 * first frame — so the notes give it one, exactly as the source readers do for a
 * chart that never states a length: the last thing that sounds, plus a tail for
 * the noise after it. A stated length always wins.
 *
 * A song with no notes at all stays unknown (zero) rather than inventing a
 * three-second song: its sound is what ends it, through the clock's `finish()`.
 */
export function trackDuration(
  doc: Pick<SourceSongDoc, "durationMs">,
  lanes: readonly LaneChart[],
  melody: MelodyChart | null,
): number {
  // The backstop behind every reader: a length is never allowed past what a track
  // can be, whether it came from a stated duration or from notes. A translucent
  // tempo map used to produce a "208-day song" whose playhead and last-note gate
  // could never arrive.
  if (Number.isFinite(doc.durationMs) && doc.durationMs > 0) {
    return Math.min(doc.durationMs, MAX_SONG_MS);
  }
  const content = Math.min(contentDuration(lanes, melody), MAX_SONG_MS);
  return content > 0 ? content + SONG_TAIL_MS : 0;
}

/**
 * A track, and what had to be left out of it.
 *
 * A fetched chart is somebody else's file. The readers already drop what they cannot
 * place, and this is the last gate before the stage: `chartProblems` is the same rule
 * the importer holds every chart it writes to, so a chart that would be unplayable is
 * **dropped** here rather than drawn half a chart and judged on it. Each problem is
 * prefixed with the seat it belonged to, so the band screen can say *which* part is
 * missing. Nothing in here throws: a chart too broken to inspect is a named problem
 * and a run that goes on without it.
 */
export interface TrackBuild {
  track: Track;
  problems: string[];
}

/** What one chart would do to the stage, prefixed with the instrument it belonged to. */
function laneProblems(chart: LaneChart): string[] {
  try {
    return chartProblems(chart).map(
      (problem) => `${chart.instrument}/${chart.difficulty}: ${problem}`,
    );
  } catch {
    // `chartProblems` reads the chart as data. A shape a reader could not have made —
    // a hand-edited document, a parser bug — is still a named problem rather than a
    // broken screen.
    return ["unknown/unknown: this chart could not be read"];
  }
}

/**
 * A melody whose notes and lines the stage can actually draw.
 *
 * The JSON reader bounds its own; this is the seam every source passes through, so
 * a MIDI voice or a lyric sheet with a bad tempo cannot stretch the roll (or the
 * track's length) to the ceiling. A line starts where it says, ends where it says but
 * never before it starts and never past the ceiling, and a word past the ceiling is
 * dropped with its line.
 */
function boundedMelody(melody: MelodyChart): MelodyChart {
  const notes = fitMelodyTurns(boundNotes(melody.notes));
  const lines = melody.lines
    .filter((line) => line.timeMs >= 0 && line.timeMs <= MAX_NOTE_TIME_MS)
    .map((line) => ({
      ...line,
      endMs: Math.max(line.timeMs, Math.min(MAX_NOTE_TIME_MS, line.endMs)),
      words: line.words.filter(
        (word) => word.timeMs >= 0 && word.timeMs <= MAX_NOTE_TIME_MS,
      ),
    }))
    .filter((line) => line.words.length > 0);
  return { ...melody, notes, lines };
}

/** The track a run plays: what a song document and its read charts add up to. */
export function assembleTrack(
  doc: SourceSongDoc,
  lanes: readonly LaneChart[],
  melody: MelodyChart | null,
): TrackBuild {
  const problems: string[] = [];
  const charts = lanes.filter((chart) => {
    const found = laneProblems(chart);
    if (found.length === 0) return true;
    problems.push(...found);
    return false;
  });
  // A melody is somebody else's file too: a long note can run over the short one
  // after it in its part, which would hold that part's run at the long note while
  // the short one came and went. The one seam every source passes through fits each
  // part's notes into their turns, so neither the fetch nor the folder path can
  // hand the stage overlapping notes.
  const words = melody ? boundedMelody(melody) : EMPTY_MELODY;
  return {
    track: {
      id: doc.id,
      title: doc.title,
      // The length is taken from what is left: a chart dropped above must not stretch
      // a song nobody wrote.
      durationMs: trackDuration(doc, charts, words),
      melody: words,
      charts,
      // The song's structure rides with the song, not with a chart: whatever a screen
      // wants it for, it is one list however many players are on stage.
      ...(doc.sections.length > 0 ? { sections: doc.sections } : {}),
    },
    problems,
  };
}
