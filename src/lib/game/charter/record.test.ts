import { describe, expect, test } from "bun:test";
import type { ActionEvent } from "../input";
import { DEFAULT_GRID } from "./grid";
import { mergeTake, takeNotes } from "./record";

const fret = (column: number, down: boolean, timeMs: number): ActionEvent => ({
  action: { type: "fret", column },
  down,
  repeat: false,
  timeMs,
});

const strum = (down: boolean, timeMs: number): ActionEvent => ({
  action: { type: "strum" },
  down,
  repeat: false,
  timeMs,
});

const take = (events: ActionEvent[], instrument: "guitar" | "keys" | "drums" = "guitar") =>
  takeNotes(events, { instrument, columns: instrument === "drums" ? 6 : 5 }, {
    startMs: 0,
    endMs: 5000,
    quantize: true,
    grid: DEFAULT_GRID,
  });

describe("recording a take", () => {
  test("a strum takes the frets held at that moment", () => {
    const notes = take([fret(0, true, 100), fret(2, true, 100), strum(true, 110)]);
    expect(notes.map((note) => note.column)).toEqual([0, 2]);
    expect(notes.every((note) => note.timeMs === 125)).toBe(true);
    expect(notes.every((note) => note.kind === "strum")).toBe(true);
  });

  test("a strum with no frets is an open note", () => {
    const notes = take([strum(true, 100)]);
    expect(notes).toHaveLength(1);
    expect(notes[0].column).toBeNull();
  });

  test("holding a fret makes a sustain, releasing it ends it", () => {
    const notes = take([
      fret(1, true, 100),
      strum(true, 100),
      fret(1, false, 900),
    ]);
    expect(notes[0].lengthMs).toBe(750);
  });

  test("a fret press without a strum is not a note on a strummed instrument", () => {
    expect(take([fret(1, true, 100), fret(1, false, 500)])).toHaveLength(0);
  });

  test("a tapped instrument records the press itself", () => {
    const notes = take([fret(2, true, 100), fret(2, false, 400)], "keys");
    expect(notes).toHaveLength(1);
    expect(notes[0].kind).toBe("tap");
    expect(notes[0].lengthMs).toBe(250);
  });

  test("a take replaces the span it was recorded over", () => {
    const old = [
      { id: "a", timeMs: 500, lengthMs: 0, kind: "strum" as const, column: 0, hero: false },
      { id: "b", timeMs: 3000, lengthMs: 0, kind: "strum" as const, column: 1, hero: false },
    ];
    const merged = mergeTake(old, [], { startMs: 400, endMs: 1000, mode: "replace" });
    expect(merged.map((note) => note.id)).toEqual(["b"]);
    const overdub = mergeTake(old, [], { startMs: 400, endMs: 1000, mode: "overdub" });
    expect(overdub).toHaveLength(2);
  });

  test("a take is snapped to the grid", () => {
    const notes = take([fret(0, true, 60), strum(true, 60)]);
    expect(notes[0].timeMs).toBe(0);
  });

  test("a drum strum with no frets does not become an open note", () => {
    expect(take([strum(true, 100)], "drums")).toHaveLength(0);
  });
});
