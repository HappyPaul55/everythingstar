/**
 * Timed lyrics: `.lrc`, `.srt` and `.vtt` — and, through them, YouTube captions.
 *
 * These carry **words and nothing else**. There is no pitch here and no instrument,
 * so the melody they make is a **lyrics** chart: one line a cue, its words spread
 * across the cue's own span, for a typist to read. That is the whole of "just
 * lyrics", and it is a first-class source rather than a degenerate one.
 *
 * ```text
 * [00:12.30]turn the volume up        ← LRC
 * 1
 * 00:00:12,300 --> 00:00:15,000       ← SRT
 * turn the volume up
 * ```
 */

import { cueLines, lyricMelody } from "./melody";
import { audioFromFiles } from "./files";
import { emptySource, type ParsedSource, type StemRole } from "./types";
import { slug } from "../text";

export type LyricFlavour = "lrc" | "srt" | "vtt";

export interface LyricTextInput {
  text: string;
  /** Which flavour it is. Guessed from the text when it is not said. */
  flavour?: LyricFlavour;
  id?: string;
  fallbackTitle?: string;
  art?: string | null;
  stems?: Partial<Record<StemRole, string>>;
}

interface Cue {
  startMs: number;
  endMs: number;
  text: string;
}

/** How long a cue with nothing after it is shown for. */
const TAIL_MS = 4000;

export function readLyricText(input: LyricTextInput): ParsedSource {
  const flavour = input.flavour ?? guessFlavour(input.text);
  const meta = { title: input.fallbackTitle ?? "Untitled", artist: "" };
  const cues = flavour === "lrc" ? readLrc(input.text, meta) : readCues(input.text);
  const title = meta.title !== "Untitled" ? meta.title : input.fallbackTitle ?? "Untitled";

  const source = emptySource(input.id ?? (slug(title) || "song"), title);
  source.meta = {
    ...source.meta,
    artist: meta.artist,
    art: input.art ?? null,
  };
  source.audio = readAudio(input.stems ?? {});
  const lines = cueLines(cues);
  source.melody = lines.length > 0 ? lyricMelody(lines) : null;
  if (lines.length > 0) {
    source.meta.durationMs = (lines[lines.length - 1]?.endMs ?? 0) + 3000;
  } else {
    // A file with no timed lines is not a three-second song with no words: it is
    // not a lyric sheet, and the caller should be able to say so.
    source.meta.durationMs = 0;
    source.problems.push("no timed lyrics found");
  }
  return source;
}

/** Which flavour some text is, from its own shape. */
function guessFlavour(text: string): LyricFlavour {
  const head = text.slice(0, 400);
  if (/^\s*WEBVTT/m.test(head)) return "vtt";
  if (/\d{1,2}:\d{2}:\d{2}[.,]\d{1,3}\s*-->/.test(head)) return "srt";
  return "lrc";
}

/** `[mm:ss.xx]text`, with `[ti:]`, `[ar:]` and `[offset:]` tags as well. */
function readLrc(text: string, meta: { title: string; artist: string }): Cue[] {
  let offsetMs = 0;
  const cues: Cue[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const tags = [...rawLine.matchAll(/\[([^\]]*)\]/g)];
    if (tags.length === 0) continue;
    let bodyStart = -1;
    const times: number[] = [];
    for (const tag of tags) {
      const value = tag[1];
      const metadata = /^([A-Za-z]+):(.*)$/.exec(value);
      if (metadata) {
        const key = metadata[1].toLowerCase();
        if (key === "ti" && metadata[2].trim()) meta.title = metadata[2].trim();
        else if (key === "ar" && metadata[2].trim()) meta.artist = metadata[2].trim();
        else if (key === "offset") offsetMs = Number(metadata[2]) || 0;
        continue;
      }
      const time = readTimestamp(value);
      if (time === null) continue;
      // The words follow the **first** timestamp, not the last bracket on the line:
      // `[00:12.30]hello [Chorus]` is a line whose words include the bracket, and
      // `[00:12.30][00:20.00]hello` is two cues for the same words.
      if (bodyStart < 0) bodyStart = tag.index + tag[0].length;
      times.push(time);
    }
    if (bodyStart < 0) continue;
    let body = rawLine.slice(bodyStart);
    // A second timestamp may sit immediately after the first; it is another cue's
    // time, not part of the words.
    let lead = /^\s*\[([^\]]*)\]/.exec(body);
    while (lead && readTimestamp(lead[1]) !== null) {
      body = body.slice(lead[0].length);
      lead = /^\s*\[([^\]]*)\]/.exec(body);
    }
    body = body.trim();
    if (!body) continue;
    for (const time of times) cues.push({ startMs: time + offsetMs, endMs: 0, text: body });
  }
  cues.sort((a, b) => a.startMs - b.startMs);
  return closeCues(cues);
}

/** `00:00:12,300 --> 00:00:15,000` blocks, which `.srt` and `.vtt` share. */
function readCues(text: string): Cue[] {
  const lines = text.split(/\r?\n/);
  const cues: Cue[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const arrow = /^\s*(\S+)\s*-->\s*(\S+)/.exec(lines[index]);
    if (!arrow) continue;
    const start = readTimestamp(arrow[1]);
    const end = readTimestamp(arrow[2]);
    if (start === null) continue;
    const body: string[] = [];
    for (let at = index + 1; at < lines.length; at += 1) {
      const line = lines[at].trim();
      if (line === "" || /-->/.test(line)) break;
      if (/^\d+$/.test(line) && body.length === 0) continue;
      body.push(line);
    }
    cues.push({ startMs: start, endMs: end ?? 0, text: body.join(" ") });
  }
  cues.sort((a, b) => a.startMs - b.startMs);
  return closeCues(cues);
}

/** A cue with no end runs until the next one opens, or a short tail. */
function closeCues(cues: Cue[]): Cue[] {
  return cues.map((cue, index) => ({
    ...cue,
    endMs: cue.endMs > cue.startMs ? cue.endMs : (cues[index + 1]?.startMs ?? cue.startMs + TAIL_MS),
  }));
}

/** A timestamp in any of the three shapes, as milliseconds. */
function readTimestamp(value: string): number | null {
  const match = /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const fraction = Number((match[4] ?? "0").padEnd(3, "0"));
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + fraction;
}

/** A lyric sheet has no audio of its own; a folder may have brought some. */
function readAudio(stems: Partial<Record<StemRole, string>>): ParsedSource["audio"] {
  return audioFromFiles(stems);
}
