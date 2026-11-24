import { describe, expect, test } from "bun:test";
import {
  isMode,
  isRoomCode,
  parseClientMessage,
  parseRoomState,
  parseRunEntry,
  roomCodeFromBytes,
  sanitizeName,
  sanitizeSlot,
  sanitizeToken,
} from "./protocol";

describe("room protocol", () => {
  test("a room code is six characters with no lookalikes", () => {
    expect(roomCodeFromBytes(new Uint8Array([0, 1, 2, 3, 4, 5]))).toHaveLength(6);
    expect(isRoomCode(roomCodeFromBytes(new Uint8Array([1, 2, 3, 4, 5, 6])))).toBe(true);
    expect(isRoomCode("ABC")).toBe(false);
    expect(isRoomCode("O0I1L8")).toBe(false);
  });

  test("names lose control characters and stop at 24", () => {
    expect(sanitizeName("  Ada\u0000 Lovelace  ")).toBe("Ada Lovelace");
    expect(sanitizeName("x".repeat(40))).toHaveLength(24);
  });

  test("tokens are opaque but bounded", () => {
    expect(sanitizeToken("abc_DEF-123")).toBe("abc_DEF-123");
    expect(sanitizeToken("not a token")).toBe("");
    expect(sanitizeToken("short")).toBe("");
  });

  test("a slot is a kind and a level; a stranger is nobody", () => {
    expect(sanitizeSlot({ kind: "guitar", difficulty: "hard", role: "lead" })).toEqual({
      kind: "guitar",
      difficulty: "hard",
      role: "lead",
    });
    expect(sanitizeSlot({ kind: "vocals", difficulty: "hard" })).toBeNull();
    expect(sanitizeSlot({ kind: "words", difficulty: "normal", wordsMode: "type" })).toEqual({
      kind: "words",
      difficulty: "normal",
      wordsMode: "type",
    });
  });

  test("a hello carries the protocol and refuses a different one", () => {
    const hello = parseClientMessage(
      JSON.stringify({ type: "hello", protocol: 1, name: "Ada" }),
    );
    expect(hello?.type).toBe("hello");
    expect(
      parseClientMessage(JSON.stringify({ type: "hello", protocol: 2, name: "Ada" })),
    ).toBeNull();
  });

  test("a run entry is bounded and numeric", () => {
    const entry = parseRunEntry({
      key: "lane-host",
      label: "Ada",
      kind: "guitar",
      seat: 1,
      difficulty: "normal",
      score: 1234,
      baseScore: 1000,
      total: 100,
      combo: 12,
      bestCombo: 20,
      hits: 90,
      misses: 10,
      judged: 100,
      typing: { wpm: 40, accuracy: 99, keys: 100, wrong: 2, spanMs: 1000 },
    });
    expect(entry?.score).toBe(1234);
    expect(entry?.typing?.wpm).toBe(40);
    expect(parseRunEntry({ ...entry, seat: 99 })).toBeNull();
    expect(parseRunEntry({ ...entry, score: -1 })).toBeNull();
  });

  test("a room state names its mode and phase", () => {
    expect(isMode("play")).toBe(true);
    expect(isMode("party")).toBe(false);
    expect(
      parseRoomState({
        mode: "listen",
        phase: "lobby",
        song: null,
        results: null,
        notice: null,
      })?.mode,
    ).toBe("listen");
    expect(
      parseRoomState({ mode: "listen", phase: "dancing", song: null, results: null }),
    ).toBeNull();
  });
});
