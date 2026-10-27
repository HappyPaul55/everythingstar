/**
 * One door into the translators: bytes in, a parsed source out.
 *
 * The format is decided by the bytes themselves (`detect.ts`), so neither the
 * importer nor the browser has to know what it was handed. Everything a translator
 * needs beyond the bytes — the `song.ini` beside them, the audio files found next
 * to them, the art — is passed in by the caller, because finding files is the one
 * thing a browser and a disk do differently.
 */

import { decodeText } from "./bytes";
import { detectSource, type SourceFormat } from "./detect";
import { readChartText } from "./chart";
import { audioFromFiles } from "./files";
import { readGameMidi } from "./ghmidi";
import type { IniValues } from "./ini";
import { readLyricText } from "./lyrics";
import { readStepMania } from "./stepmania";
import { readUltraStar } from "./ultrastar";
import { emptySource, type ParsedSource, type StemRole } from "./types";
import { slug } from "../text";

export interface ParseSourceInput {
  bytes: Uint8Array;
  /** What the file was called, as a hint when the bytes say nothing. */
  name?: string;
  /** Which format it is, when the caller already knows (saves a sniff). */
  format?: SourceFormat;
  /** The settings read from a `song.ini` beside it. */
  ini?: IniValues | null;
  /** The audio found beside it, by the role each file plays. */
  stems?: Partial<Record<StemRole, string>>;
  /** A jukebox clip found beside it, when there is one. Not a stem. */
  preview?: string | null;
  /** The art found beside it. */
  art?: string | null;
  /** What to call the song when the file does not name it. */
  fallbackTitle?: string;
  /** The song's own id, when the caller has one. */
  id?: string;
  /**
   * The chart's own absolute URL. A source that names sibling files (`#MP3`,
   * `#COVER`) resolves them against this; a local folder passes its `folder://` URL.
   */
  baseUrl?: string | null;
}

export function parseSource(input: ParseSourceInput): ParsedSource {
  const format = input.format ?? detectSource(input.bytes, input.name ?? "");
  const fallbackTitle = input.fallbackTitle;
  const common = {
    ini: input.ini ?? null,
    stems: input.stems ?? {},
    art: input.art ?? null,
    fallbackTitle,
    id: input.id,
  };
  const source = (() => {
    switch (format) {
      case "midi":
        return readGameMidi({ bytes: input.bytes, ...common });
      case "chart":
        return readChartText({
          text: decodeText(input.bytes),
          ...common,
          baseUrl: input.baseUrl ?? null,
        });
      case "ultrastar":
        return readUltraStar({
          text: decodeText(input.bytes),
          stems: common.stems,
          art: common.art,
          fallbackTitle,
          id: input.id,
          baseUrl: input.baseUrl ?? null,
        });
      case "stepmania":
        return readStepMania({
          text: decodeText(input.bytes),
          stems: common.stems,
          art: common.art,
          fallbackTitle,
          id: input.id,
          baseUrl: input.baseUrl ?? null,
        });
      case "lrc":
      case "srt":
      case "vtt":
        return readLyricText({
          text: decodeText(input.bytes),
          flavour: format,
          stems: common.stems,
          art: common.art,
          fallbackTitle,
          id: input.id,
        });
      default:
        // `unknown` and `document` are not lyric formats. Reading them as LRC used to
        // make a three-second song with no words; a source with nothing to play and
        // the reason named is the honest answer.
        return unreadableSource(input, format);
    }
  })();
  // The clip is not a stem, so it never reaches the translators: it is attached to
  // the audio bundle the source already carries.
  source.audio.preview = input.preview ?? null;
  return source;
}

/** A file no reader claims: no chart, no words, and the reason named. */
function unreadableSource(input: ParseSourceInput, format: SourceFormat): ParsedSource {
  const title = input.fallbackTitle ?? "Untitled";
  const source = emptySource(input.id ?? (slug(title) || "song"), title);
  source.audio = audioFromFiles(input.stems ?? {});
  source.problems.push(
    format === "document"
      ? "this file is a JSON document, not a chart this game can read"
      : "this file is not a chart or timed lyrics this game can read",
  );
  return source;
}

export type { SourceFormat };
