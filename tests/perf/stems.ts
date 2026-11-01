/**
 * A real multitrack song for the frame harness.
 *
 * The docs library has no stems, so the guitar benchmark measures the frame clock.
 * A real run is clocked by the song's media elements, and `SongAudio` reads and
 * corrects them every frame. This fixture serves three WAV stems from a local HTTP
 * server with range support — the same shape the stem-sync test uses — while the
 * playlist, song document and chart stay on the route layer.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export const PLAYLIST_URL =
  "https://raw.githubusercontent.com/HappyPaul55/everythingstar-foss/main/songs/playlist.json";
export const ROOT = PLAYLIST_URL.slice(0, PLAYLIST_URL.lastIndexOf("/") + 1);
export const SONG_ID = "stem-perf-song";
export const SONG_TITLE = "Stem Bench Song";
export const SONG_URL = `${ROOT}songs/${SONG_ID}.json`;
export const CHART_URL = `${ROOT}charts/${SONG_ID}/guitar-easy.json`;
const DURATION_MS = 30_000;

/** A 16-bit PCM mono WAV of a steady tone — a stem with a real clock of its own. */
function wav(freq: number, seconds: number): Buffer {
  const rate = 22_050;
  const frames = Math.round(rate * seconds);
  const dataBytes = frames * 2;
  const out = Buffer.alloc(44 + dataBytes);
  out.write("RIFF", 0);
  out.writeUInt32LE(36 + dataBytes, 4);
  out.write("WAVE", 8);
  out.write("fmt ", 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(rate, 24);
  out.writeUInt32LE(rate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36);
  out.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < frames; i += 1) {
    const value = Math.sin((2 * Math.PI * freq * i) / rate) * 0.2 * 32767;
    out.writeInt16LE(Math.round(value), 44 + i * 2);
  }
  return out;
}

function parseRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | null {
  if (!header) return null;
  const match = /bytes=(\d*)-(\d*)/.exec(header);
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return null;
  if (rawStart === "") {
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(rawStart);
  if (!Number.isFinite(start) || start >= size) return null;
  const end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  if (end < start) return null;
  return { start, end };
}

const STEMS: Record<string, Buffer> = {
  "/audio/guitar.wav": wav(220, 30),
  "/audio/bass.wav": wav(110, 30),
  "/audio/drums.wav": wav(440, 30),
  // A Rock Band-shaped folder falls back to per-part stems: seven elements, not
  // three. The chart only seats a guitar; the other stems are the mix.
  "/audio/keys.wav": wav(330, 30),
  "/audio/vocals.wav": wav(165, 30),
  "/audio/rhythm.wav": wav(247, 30),
  "/audio/lead.wav": wav(294, 30),
};

export interface StemServer {
  /** The origin the song document's stems point at. */
  base: string;
  close: () => Promise<void>;
}

/** Start the stems on an ephemeral port, range-capable like a real host. */
export async function startStems(): Promise<StemServer> {
  const server: Server = createServer((request, response) => {
    const path = (request.url ?? "/").split("?")[0] ?? "";
    const bytes = STEMS[path];
    if (!bytes) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader("content-type", "audio/wav");
    response.setHeader("access-control-allow-origin", "*");
    response.setHeader("accept-ranges", "bytes");
    const span = parseRange(request.headers.range, bytes.length);
    if (span) {
      response.writeHead(206, {
        "content-range": `bytes ${span.start}-${span.end}/${bytes.length}`,
      });
      response.end(bytes.subarray(span.start, span.end + 1));
      return;
    }
    response.writeHead(200, { "content-length": String(bytes.length) });
    response.end(bytes);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as AddressInfo | null;
  const base = `http://127.0.0.1:${address?.port ?? 0}`;
  return {
    base,
    close: async () => {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/** The playlist entry the game seeds. */
export const playlist = {
  schemaVersion: 1,
  name: "Stem bench",
  songs: [
    {
      id: SONG_ID,
      song: `songs/${SONG_ID}.json`,
      title: SONG_TITLE,
      artist: { id: "the-fixtures", name: "The Fixtures" },
      durationMs: DURATION_MS,
      previewStartMs: 0,
      offer: {
        instruments: [{ role: "guitar", difficulties: ["easy"] }],
        voice: null,
      },
    },
  ],
};

/** Notes every half second, so the lane has something to judge. */
export const chart = {
  schemaVersion: 1,
  chartType: "lanes",
  columns: 3,
  notes: Array.from({ length: 56 }, (_, i) => ({
    timeMs: 500 + i * 500,
    lengthMs: 0,
    kind: "strum",
    column: i % 3,
  })),
};

/** The song document, with its stems pointing at the running server. */
export function songDoc(base: string, withStems = true): unknown {
  return {
    schemaVersion: 1,
    id: SONG_ID,
    title: SONG_TITLE,
    artist: { id: "the-fixtures", name: "The Fixtures" },
    durationMs: DURATION_MS,
    previewStartMs: 0,
    audio: {
      source: "stems",
      stems: withStems ? ["guitar", "bass", "drums", "keys", "vocals", "rhythm", "lead"].map((name) => ({
        id: `stem_${name}`,
        name: name[0]!.toUpperCase() + name.slice(1),
        url: `${base}/audio/${name}.wav`,
        instrument:
          name === "rhythm" ? "rhythm_guitar" : name === "lead" ? "lead_guitar" : name,
        defaultGainDb: 0,
        offsetMs: 0,
      })) : [],
      mixPresets: {},
      preview: null,
    },
    parts: [
      {
        id: "part_guitar",
        role: "guitar",
        label: "Guitar",
        controllerTypes: ["guitar_controller"],
        charts: [
          {
            id: `${SONG_ID}-guitar-easy`,
            difficulty: "easy",
            chartType: "lanes",
            laneCount: 3,
            bpm: 120,
            url: CHART_URL,
          },
        ],
      },
    ],
  };
}
