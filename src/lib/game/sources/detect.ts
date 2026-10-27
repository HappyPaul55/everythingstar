/**
 * What a file is, from the file.
 *
 * A playlist may point at anything — our own JSON, a `notes.mid`, a Clone Hero
 * `.chart`, an UltraStar `.txt`, a lyric sheet — and which reader to hand it to is
 * decided by **what it starts with**, not what somebody named it. The name is only
 * ever a tiebreaker, because a chart with the wrong extension is still a chart.
 */

import { decodeText, startsWithAscii } from "./bytes";

export type SourceFormat =
  | "document"
  | "midi"
  | "chart"
  | "ultrastar"
  | "stepmania"
  | "lrc"
  | "srt"
  | "vtt"
  | "unknown";

/** Which reader reads this file. */
export function detectSource(bytes: Uint8Array, name = ""): SourceFormat {
  if (startsWithAscii(bytes, "MThd")) return "midi";
  // A RIFF-wrapped `RMID` is a MIDI with a header around it; the reader knows.
  if (startsWithAscii(bytes, "RIFF") && startsWithAscii(bytes.subarray(8), "RMID")) {
    return "midi";
  }

  const text = decodeText(bytes.subarray(0, Math.min(bytes.length, 4096)));
  const trimmed = text.replace(/^\uFEFF/, "").trimStart();
  if (trimmed.startsWith("{")) return "document";
  if (/^\s*\[Song\]/im.test(text)) return "chart";
  // A stepfile before an UltraStar file: both open with `#TITLE:`, and only one of
  // them has a note grid.
  if (/^\s*#(NOTES|BPMS|STOPS|NOTEDATA)\s*:/im.test(text)) return "stepmania";
  if (/^\s*#(TITLE|ARTIST|BPM|MP3|GAP|OFFSET)\s*:/im.test(text)) return "ultrastar";
  if (/^\s*WEBVTT/m.test(text)) return "vtt";
  if (/\d{1,2}:\d{2}:\d{2}[.,]\d{1,3}\s*-->/.test(text)) return "srt";
  if (/\[(\d+:)?\d{1,2}:\d{2}([.,]\d{1,3})?\]/.test(text)) return "lrc";

  // The name, when the bytes said nothing.
  const lower = name.toLowerCase();
  if (lower.endsWith(".mid") || lower.endsWith(".midi")) return "midi";
  if (lower.endsWith(".chart")) return "chart";
  if (lower.endsWith(".sm") || lower.endsWith(".ssc")) return "stepmania";
  if (lower.endsWith(".lrc")) return "lrc";
  if (lower.endsWith(".srt")) return "srt";
  if (lower.endsWith(".vtt")) return "vtt";
  if (lower.endsWith(".json")) return "document";
  if (lower.endsWith(".txt")) return "ultrastar";
  return "unknown";
}
