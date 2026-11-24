/**
 * The room wire contract.
 *
 * A room is a short-lived, host-led session. The **relay** owns membership,
 * seats and delivery; the **host browser** owns the song, the charts, the clock
 * and the scores. Nothing here carries audio: a guest receives the chart for its
 * own seat and the host's playhead, and judges itself against its own controller
 * and the host's speakers.
 *
 * The module is deliberately pure and shared by the browser, the Bun server and
 * the Cloudflare Durable Object. It parses untrusted frames, caps every string
 * and is the one place a field is named.
 */

import type { Difficulty, LaneChart, LaneRole, MelodyChart } from "../game/track";
import type { PlayerKind, WordsMode } from "../game/band/types";
import type { SongOffer } from "../game/song";
import type { TypingReport } from "../game/typing";

export const PROTOCOL_VERSION = 1;
const ROOM_CODE_LENGTH = 6;
export const MAX_MEMBERS = 12;
export const MAX_SEATS = 8;
export const MAX_NAME_CHARS = 24;
const MAX_PITCH_SAMPLES = 80;

export type RoomMode = "play" | "listen";
export type RoomPhase = "lobby" | "countdown" | "playing" | "paused" | "results";

export type RoomSlot = {
  kind: PlayerKind;
  difficulty: Difficulty;
  role?: LaneRole;
  wordsMode?: WordsMode;
};

export interface RoomMember {
  id: string;
  name: string;
  isHost: boolean;
  seat: number | null;
  slot: RoomSlot | null;
  ready: boolean;
  connected: boolean;
}

export interface RoomSong {
  id: string;
  title: string;
  artist: string;
  durationMs: number;
  seed: number;
  accent: string | null;
  /** Only an `http(s)` cover: a local `folder://` art is not a URL a guest can read. */
  art: string | null;
  offer: SongOffer;
}

/** A run as it crosses the wire. The host fills the label from its own band. */
export interface RoomRunEntry {
  key: string;
  label: string;
  kind: PlayerKind;
  wordsMode?: WordsMode;
  seat: number;
  difficulty: Difficulty | null;
  score: number;
  baseScore: number;
  total: number;
  combo: number;
  bestCombo: number;
  hits: number;
  misses: number;
  judged: number;
  heroHits?: number;
  fillHits?: number;
  slidePoints?: number;
  unit?: "notes" | "words";
  typing?: TypingReport;
}

export interface RoomResults {
  score: number;
  stars: number;
  gold: boolean;
  accuracy: number;
  bestCombo: number;
  failed: boolean;
  entries: RoomRunEntry[];
}

export interface RoomState {
  mode: RoomMode;
  phase: RoomPhase;
  song: RoomSong | null;
  results: RoomResults | null;
  /** Why the room cannot start, when it cannot. */
  notice: string | null;
}

export interface RoomLibrarySong {
  id: string;
  title: string;
  artist: string;
  durationMs: number;
  art: string | null;
  accent: string | null;
}

export interface RoomQueueState {
  current: RoomLibrarySong | null;
  queue: RoomLibrarySong[];
}

/** One guest's seat, as the host sends it. */
export interface RoomChart {
  seat: number;
  song: {
    id: string;
    title: string;
    durationMs: number;
    seed: number;
  };
  slot: RoomSlot;
  /** Exactly one of these is present: a lane chart, or the melody for a words seat. */
  lane: LaneChart | null;
  melody: MelodyChart | null;
  hash: string;
}

export interface PitchSample {
  atMs: number;
  midi: number;
}

export type RoomClientMessage =
  | {
      type: "hello";
      protocol: number;
      name: string;
      mode?: RoomMode;
      hostToken?: string;
      guestToken?: string;
    }
  | { type: "slot"; slot: RoomSlot | null }
  | { type: "claim"; seat: number | null }
  | { type: "ready"; ready: boolean }
  | { type: "state"; state: RoomState }
  | { type: "chart"; to: string; chart: RoomChart }
  | { type: "playhead"; songMs: number; playing: boolean }
  | { type: "needsChart" }
  | { type: "report"; entry: RoomRunEntry }
  | { type: "pitch"; samples: PitchSample[] }
  | { type: "library"; songs: RoomLibrarySong[] }
  | { type: "queueState"; queue: RoomQueueState }
  | {
      type: "queue";
      op: "add" | "next" | "playNow" | "remove" | "clear";
      songId?: string;
      entryId?: string;
    }
  | { type: "libraryAdd"; kind: "playlist" | "song"; url: string }
  | { type: "kick"; memberId: string }
  | { type: "ping"; id: number; t0: number }
  | { type: "close" };

export type RoomServerMessage =
  | {
      type: "welcome";
      protocol: number;
      you: RoomMember;
      code: string;
      members: RoomMember[];
      state: RoomState | null;
      library: RoomLibrarySong[];
      queue: RoomQueueState;
      serverMs: number;
    }
  | { type: "members"; members: RoomMember[]; serverMs: number }
  | { type: "state"; state: RoomState; serverMs: number }
  | { type: "chartRequest"; from: string; serverMs: number }
  | { type: "chart"; from: string; chart: RoomChart; serverMs: number }
  | { type: "playhead"; songMs: number; playing: boolean; serverMs: number }
  | { type: "report"; from: string; entry: RoomRunEntry; serverMs: number }
  | { type: "pitch"; from: string; samples: PitchSample[]; serverMs: number }
  | { type: "library"; songs: RoomLibrarySong[]; serverMs: number }
  | { type: "queueState"; queue: RoomQueueState; serverMs: number }
  | {
      type: "queue";
      from: string;
      op: "add" | "next" | "playNow" | "remove" | "clear";
      songId?: string;
      entryId?: string;
      serverMs: number;
    }
  | {
      type: "libraryAdd";
      from: string;
      kind: "playlist" | "song";
      url: string;
      serverMs: number;
    }
  | { type: "pong"; id: number; t0: number; t1: number; t2: number }
  | { type: "error"; message: string; fatal?: boolean; serverMs: number }
  | { type: "closed"; reason: string };

export const EMPTY_ROOM_STATE: RoomState = {
  mode: "play",
  phase: "lobby",
  song: null,
  results: null,
  notice: null,
};

/** The letters a room code uses: no I/L/O/0/1, so a code read aloud is one code. */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function roomCodeFromBytes(bytes: Uint8Array): string {
  let code = "";
  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    code += CODE_ALPHABET[(bytes[index] ?? 0) % CODE_ALPHABET.length];
  }
  return code;
}

export function newRoomCode(): string {
  const bytes = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return roomCodeFromBytes(bytes);
}

export function isRoomCode(value: string): boolean {
  if (!new RegExp(`^[${CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`).test(value)) {
    return false;
  }
  return true;
}

export function sanitizeName(value: unknown): string {
  if (typeof value !== "string") return "";
  return [...value]
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code >= 32 && code !== 127;
    })
    .join("")
    .trim()
    .slice(0, MAX_NAME_CHARS);
}

export function sanitizeToken(value: unknown): string {
  if (typeof value !== "string") return "";
  return /^[A-Za-z0-9_-]{8,80}$/.test(value) ? value : "";
}

const KINDS = new Set<PlayerKind>(["guitar", "bass", "drums", "keys", "dance", "words"]);
const LEVELS = new Set<Difficulty>(["easy", "normal", "hard", "expert"]);

export function sanitizeSlot(value: unknown): RoomSlot | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.kind !== "string" || !KINDS.has(raw.kind as PlayerKind)) return null;
  if (typeof raw.difficulty !== "string" || !LEVELS.has(raw.difficulty as Difficulty)) {
    return null;
  }
  const slot: RoomSlot = {
    kind: raw.kind as PlayerKind,
    difficulty: raw.difficulty as Difficulty,
  };
  if (raw.role === "lead" || raw.role === "rhythm") slot.role = raw.role;
  if (raw.wordsMode === "sing" || raw.wordsMode === "type") slot.wordsMode = raw.wordsMode;
  return slot;
}

export function isMode(value: unknown): value is RoomMode {
  return value === "play" || value === "listen";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function boundedString(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

/** A run is small and numeric; a bad one must not reach the host's board. */
export function parseRunEntry(value: unknown): RoomRunEntry | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.key !== "string" || typeof raw.label !== "string") return null;
  if (typeof raw.kind !== "string" || !KINDS.has(raw.kind as PlayerKind)) return null;
  if (!Number.isInteger(raw.seat) || (raw.seat as number) < 0 || (raw.seat as number) >= MAX_SEATS) {
    return null;
  }
  const numbers = [
    "score",
    "baseScore",
    "total",
    "combo",
    "bestCombo",
    "hits",
    "misses",
    "judged",
  ] as const;
  for (const key of numbers) {
    if (!isFiniteNumber(raw[key]) || (raw[key] as number) < 0) return null;
  }
  const entry: RoomRunEntry = {
    key: boundedString(raw.key, 80),
    label: boundedString(raw.label, 80),
    kind: raw.kind as PlayerKind,
    seat: Math.trunc(raw.seat as number),
    difficulty:
      typeof raw.difficulty === "string" && LEVELS.has(raw.difficulty as Difficulty)
        ? (raw.difficulty as Difficulty)
        : null,
    score: Math.trunc(raw.score as number),
    baseScore: Math.trunc(raw.baseScore as number),
    total: Math.trunc(raw.total as number),
    combo: Math.trunc(raw.combo as number),
    bestCombo: Math.trunc(raw.bestCombo as number),
    hits: Math.trunc(raw.hits as number),
    misses: Math.trunc(raw.misses as number),
    judged: Math.trunc(raw.judged as number),
  };
  if (raw.wordsMode === "sing" || raw.wordsMode === "type") entry.wordsMode = raw.wordsMode;
  for (const key of ["heroHits", "fillHits", "slidePoints"] as const) {
    if (isFiniteNumber(raw[key])) entry[key] = Math.max(0, Math.trunc(raw[key] as number));
  }
  if (raw.unit === "notes" || raw.unit === "words") entry.unit = raw.unit;
  if (raw.typing && typeof raw.typing === "object") {
    const typing = raw.typing as Record<string, unknown>;
    if (
      isFiniteNumber(typing.wpm) &&
      isFiniteNumber(typing.accuracy) &&
      isFiniteNumber(typing.keys) &&
      isFiniteNumber(typing.wrong) &&
      isFiniteNumber(typing.spanMs)
    ) {
      entry.typing = {
        wpm: Math.max(0, Math.trunc(typing.wpm)),
        accuracy: Math.max(0, Math.min(100, Math.trunc(typing.accuracy))),
        keys: Math.max(0, Math.trunc(typing.keys)),
        wrong: Math.max(0, Math.trunc(typing.wrong)),
        spanMs: Math.max(0, Math.trunc(typing.spanMs)),
      };
    }
  }
  return entry;
}

/** A host's snapshot. It is trusted more than a guest, but still bounded. */
export function parseRoomState(value: unknown): RoomState | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!isMode(raw.mode)) return null;
  if (
    raw.phase !== "lobby" &&
    raw.phase !== "countdown" &&
    raw.phase !== "playing" &&
    raw.phase !== "paused" &&
    raw.phase !== "results"
  ) {
    return null;
  }
  return {
    mode: raw.mode,
    phase: raw.phase,
    song: (raw.song as RoomSong | null | undefined) ?? null,
    results: (raw.results as RoomResults | null | undefined) ?? null,
    notice: typeof raw.notice === "string" ? raw.notice.slice(0, 240) : null,
  };
}

export function parseClientMessage(raw: string): RoomClientMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const message = value as Record<string, unknown>;
  if (typeof message.type !== "string") return null;
  switch (message.type) {
    case "hello": {
      if (!Number.isInteger(message.protocol) || message.protocol !== PROTOCOL_VERSION) {
        return null;
      }
      return {
        type: "hello",
        protocol: PROTOCOL_VERSION,
        name: sanitizeName(message.name),
        mode: isMode(message.mode) ? message.mode : undefined,
        hostToken: sanitizeToken(message.hostToken) || undefined,
        guestToken: sanitizeToken(message.guestToken) || undefined,
      };
    }
    case "slot": {
      const slot = message.slot === null ? null : sanitizeSlot(message.slot);
      if (message.slot !== null && slot === null) return null;
      return { type: "slot", slot };
    }
    case "claim": {
      if (message.seat === null) return { type: "claim", seat: null };
      if (
        !Number.isInteger(message.seat) ||
        (message.seat as number) < 0 ||
        (message.seat as number) >= MAX_SEATS
      ) {
        return null;
      }
      return { type: "claim", seat: message.seat as number };
    }
    case "ready":
      return typeof message.ready === "boolean"
        ? { type: "ready", ready: message.ready }
        : null;
    case "state": {
      const state = parseRoomState(message.state);
      return state ? { type: "state", state } : null;
    }
    case "chart": {
      if (typeof message.to !== "string" || !message.to) return null;
      if (!message.chart || typeof message.chart !== "object") return null;
      return {
        type: "chart",
        to: message.to.slice(0, 80),
        chart: message.chart as RoomChart,
      };
    }
    case "playhead":
      return isFiniteNumber(message.songMs) && typeof message.playing === "boolean"
        ? {
            type: "playhead",
            songMs: Math.max(0, message.songMs),
            playing: message.playing,
          }
        : null;
    case "needsChart":
      return { type: "needsChart" };
    case "report": {
      const entry = parseRunEntry(message.entry);
      return entry ? { type: "report", entry } : null;
    }
    case "pitch": {
      if (!Array.isArray(message.samples)) return null;
      const samples = message.samples
        .slice(0, MAX_PITCH_SAMPLES)
        .flatMap((sample) => {
          if (!sample || typeof sample !== "object") return [];
          const atMs = (sample as Record<string, unknown>).atMs;
          const midi = (sample as Record<string, unknown>).midi;
          if (!isFiniteNumber(atMs) || !isFiniteNumber(midi)) return [];
          return [{ atMs: Math.max(0, atMs), midi: Math.max(0, Math.min(127, midi)) }];
        });
      return { type: "pitch", samples };
    }
    case "library": {
      if (!Array.isArray(message.songs)) return null;
      return { type: "library", songs: message.songs as RoomLibrarySong[] };
    }
    case "queueState": {
      if (!message.queue || typeof message.queue !== "object") return null;
      return { type: "queueState", queue: message.queue as RoomQueueState };
    }
    case "queue": {
      if (
        message.op !== "add" &&
        message.op !== "next" &&
        message.op !== "playNow" &&
        message.op !== "remove" &&
        message.op !== "clear"
      ) {
        return null;
      }
      return {
        type: "queue",
        op: message.op,
        songId: typeof message.songId === "string" ? message.songId.slice(0, 120) : undefined,
        entryId: typeof message.entryId === "string" ? message.entryId.slice(0, 80) : undefined,
      };
    }
    case "libraryAdd":
      if (message.kind !== "playlist" && message.kind !== "song") return null;
      if (typeof message.url !== "string") return null;
      return { type: "libraryAdd", kind: message.kind, url: message.url.slice(0, 8192) };
    case "kick":
      return typeof message.memberId === "string"
        ? { type: "kick", memberId: message.memberId.slice(0, 80) }
        : null;
    case "ping":
      return isFiniteNumber(message.id) && isFiniteNumber(message.t0)
        ? { type: "ping", id: message.id, t0: message.t0 }
        : null;
    case "close":
      return { type: "close" };
    default:
      return null;
  }
}

export function parseServerMessage(raw: string): RoomServerMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const message = value as Record<string, unknown>;
  return typeof message.type === "string" ? (message as unknown as RoomServerMessage) : null;
}

