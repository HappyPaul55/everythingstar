/**
 * UltraStar `.txt`: the karaoke format.
 *
 * A list of `#KEY:value` headers and then one note a line — `: beat length pitch
 * word` — with `-` marking a phrase break and `E` the end. Times are **beats**, not
 * milliseconds: `#BPM` is implicitly quadrupled (`60 / (bpm * 4)` seconds per beat),
 * and `#GAP` is how far the audio starts before beat zero.
 *
 * The format's note types matter:
 *
 * - `:` a normal pitched syllable
 * - `*` a **golden** note: pitched, and a hero here
 * - `R` a rap syllable: no meaningful pitch, judged on presence
 * - `G` a golden rap syllable: the same, and a hero
 * - `F` a freestyle syllable: not meant to be typed or scored, so it is dropped
 *
 * Pitch is **semitones relative to C4 (MIDI 60)**, so `-4` is a real note and `0`
 * is C4 — it is not the “no pitch” marker. A leading space starts a new word and a
 * leading `~` continues the current one; the shared `groupLyrics` is told which is
 * which rather than guessing from a hyphen, which is the Guitar Hero convention.
 *
 * ```text
 * #TITLE:Nine Lives
 * #BPM:300.5
 * #GAP:1000
 * : 0 4 0 Hello
 * : 16 4 62 world
 * - 40
 * ```
 */

import { groupLyrics, type Syllable } from "./lyricLines";
import { melodyOfParts } from "./melody";
import { audioFromFiles } from "./files";
import { emptySource, type ParsedSource, type StemRole } from "./types";
import { SONG_TAIL_MS } from "./duration";
import { slug } from "../text";
import { resolveFileRef, yearOf } from "./common";
import type { SongVideo } from "../song";

export interface UltraStarInput {
  text: string;
  id?: string;
  fallbackTitle?: string;
  /** Art the caller found (from the headers, or a file beside it). */
  art?: string | null;
  /** Audio the caller found beside the text, by role. */
  stems?: Partial<Record<StemRole, string>>;
  video?: SongVideo | null;
  /**
   * The chart's own absolute URL. `#MP3` and `#COVER` are resolved against it when
   * the caller did not already find the files beside the chart (a local folder
   * supplies real stems, but a nonstandard file name still comes from the header).
   */
  baseUrl?: string | null;
}

type UltraNoteKind = "normal" | "golden" | "rap" | "goldenRap" | "freestyle";

interface ParsedNote {
  voice: number;
  timeMs: number;
  lengthMs: number;
  midi: number | null;
  text: string;
  lineStart: boolean;
  wordStart: boolean;
  hero: boolean;
  kind: UltraNoteKind;
}

export function readUltraStar(input: UltraStarInput): ParsedSource {
  const headers = new Map<string, string>();
  const bpmValues: number[] = [];
  const bodyLines: string[] = [];
  const problems: string[] = [];
  let inBody = false;

  for (const rawLine of input.text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (!inBody && line.startsWith("#")) {
      const colon = line.indexOf(":");
      if (colon <= 1) continue;
      const key = line.slice(1, colon).trim().toUpperCase();
      const value = line.slice(colon + 1).trim();
      if (key === "BPM") {
        const bpm = number(value);
        if (bpm !== null && bpm > 0) bpmValues.push(bpm);
      } else if (!headers.has(key)) {
        headers.set(key, value);
      }
      continue;
    }
    inBody = true;
    bodyLines.push(line);
  }

  if (bpmValues.length === 0) problems.push("no #BPM; assuming 120");
  const bpm = bpmValues[0] ?? 120;
  if (bpmValues.some((value) => Math.abs(value - bpm) > 0.01)) {
    problems.push("the song changes tempo; only its opening tempo is used");
  }
  // UltraStar's beat is a quarter of its stated BPM: 120 is 0.125s per beat.
  const beatMs = bpm > 0 ? 60_000 / (bpm * 4) : 0;
  if (beatMs <= 0) problems.push("no usable #BPM; note times cannot be placed");

  const gapMs = number(headers.get("GAP") ?? "") ?? 0;
  const relative = (headers.get("RELATIVE") ?? "").trim().toLowerCase() === "yes";
  const beat = beatMs / 1000;
  // In relative mode the GAP is expressed in beats too, and phrase markers carry the
  // length of the gap that follows them.
  let relBeats = relative && beat > 0 ? gapMs / beatMs : 0;

  const parsed: ParsedNote[] = [];
  let currentVoice = 1;
  let lineStart = true;

  for (const line of bodyLines) {
    if (line === "E" || line.startsWith("E ")) break;

    // A duet switches voice on a line of its own (`P1`/`P2`); some tools put the
    // switch on the note line instead, so accept both.
    let rest = line;
    const voice = /^P([12])\b/i.exec(line);
    if (voice) {
      currentVoice = Number(voice[1]);
      rest = line.slice(voice[0].length).trimStart();
      // A voice switch opens that voice's line, whether the switch is on a line
      // of its own or prefixed to the first note.
      lineStart = true;
      if (!rest) continue;
    }

    if (rest.startsWith("-")) {
      if (relative) {
        const fields = rest.slice(1).trim().split(/\s+/);
        const length = number(fields[1] ?? "");
        if (length !== null) relBeats += length;
      }
      lineStart = true;
      continue;
    }

    const type = rest[0];
    if (!type || !":*RGF".includes(type)) continue;
    // Strip exactly one separator after the note type, then parse the pitch and the
    // lyric. A second space before the lyric is the word-start marker, so it must
    // survive this step.
    const body = rest.slice(1).replace(/^[ \t]/, "");
    const match = /^(\d+)[ \t]+(\d+)[ \t]+(-?\d+)(?:[ \t](.*))?$/.exec(body);
    if (!match) continue;
    const beatAt = Number(match[1]);
    const lengthBeats = Number(match[2]);
    const pitch = Number(match[3]);
    const rawText = match[4] ?? "";
    if (!Number.isFinite(beatAt) || !Number.isFinite(lengthBeats)) continue;

    const originLine = lineStart;
    lineStart = false;

    const leadingSpace = /^[ \t]/.test(rawText);
    let text = rawText.replace(/^[ \t]+/, "");
    const continuation = text.startsWith("~");
    if (continuation) text = text.slice(1).replace(/^[ \t]+/, "");
    text = text.trimEnd();

    const kind: UltraNoteKind =
      type === "*" ? "golden" : type === "R" ? "rap" : type === "G" ? "goldenRap" : type === "F" ? "freestyle" : "normal";

    // Freestyle notes are not lyrics the player is asked to perform.
    if (kind === "freestyle") continue;

    const at = relative ? (relBeats + beatAt) * beatMs : gapMs + beatAt * beatMs;
    if (!Number.isFinite(at)) continue;

    parsed.push({
      voice: currentVoice,
      timeMs: Math.round(at),
      lengthMs: Math.max(0, Math.round(lengthBeats * beatMs)),
      midi: kind === "normal" || kind === "golden" ? 60 + Math.round(pitch) : null,
      text,
      lineStart: originLine,
      wordStart: continuation ? false : originLine ? true : leadingSpace,
      hero: kind === "golden" || kind === "goldenRap",
      kind,
    });
  }

  const title = headers.get("TITLE") ?? input.fallbackTitle ?? "Untitled";
  const source = emptySource(input.id ?? (slug(title) || "song"), title);
  source.problems.push(...problems);
  source.meta = {
    ...source.meta,
    artist: headers.get("ARTIST") ?? "",
    album: headers.get("ALBUM") ?? null,
    year: yearOf(number(headers.get("YEAR") ?? "") ?? 0),
    previewStartMs: Math.max(
      0,
      number(headers.get("PREVIEWSTART") ?? headers.get("PREVIEW") ?? "") ?? 0,
    ),
    art:
      input.art ??
      resolveFileRef(headers.get("COVER") ?? null, input.baseUrl ?? null),
    video: input.video ?? videoOf(headers.get("VIDEO") ?? null, input.baseUrl ?? null),
  };
  source.audio = readAudio(
    input.stems ?? {},
    headers.get("AUDIO") ?? headers.get("MP3") ?? null,
    input.baseUrl ?? null,
  );

  const byVoice = new Map<number, Syllable[]>();
  for (const note of parsed) {
    const list = byVoice.get(note.voice);
    const syllable: Syllable = {
      timeMs: note.timeMs,
      lengthMs: note.lengthMs,
      midi: note.midi,
      text: note.text,
      lineStart: note.lineStart,
      wordStart: note.wordStart,
      hero: note.hero,
    };
    if (list) list.push(syllable);
    else byVoice.set(note.voice, [syllable]);
  }

  const voices = [...byVoice.keys()].sort((a, b) => a - b);
  if (voices.length > 2) {
    problems.push("more than two voices; the first two are used");
    voices.length = 2;
  }
  if (voices.length > 0) {
    const grouped = voices.map((voice, part) =>
      groupLyrics(byVoice.get(voice) ?? [], part),
    );
    source.problems.push(...grouped.flatMap((group) => group.problems));
    source.melody = melodyOfParts(grouped, source.meta.id);
    const lastMs = source.melody.lines.reduce(
      (max, line) => Math.max(max, line.endMs),
      0,
    );
    source.meta.durationMs = lastMs + SONG_TAIL_MS;
  } else {
    source.meta.durationMs = 0;
  }

  return source;
}

/** A karaoke file names its own mix in `#AUDIO`/`#MP3`; a folder may have found it. */
function readAudio(
  stems: Partial<Record<StemRole, string>>,
  header: string | null,
  base: string | null,
): ParsedSource["audio"] {
  const named = resolveFileRef(header, base);
  return audioFromFiles({
    ...stems,
    ...(stems.master || !named ? {} : { master: named }),
  });
}

/** A header path is resolved against the chart's own URL, like every source's. */
function videoOf(ref: string | null, base: string | null): SongVideo | null {
  const url = resolveFileRef(ref, base);
  return url ? { kind: "video", url } : null;
}

/** A number as the format writes it: a comma may be the decimal separator. */
function number(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value.replace(",", ".").split(/\s+/)[0]);
  return Number.isFinite(parsed) ? parsed : null;
}
