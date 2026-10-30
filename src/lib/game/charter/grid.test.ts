import { describe, expect, test } from "bun:test";
import {
  beatMs,
  barMs,
  clampGrid,
  DEFAULT_GRID,
  floorMs,
  gridLines,
  gridPosition,
  snapMs,
  ceilMs,
  stepMs,
} from "./grid";

describe("the charter grid", () => {
  test("a sixteenth at 120 BPM is 125ms", () => {
    expect(stepMs(DEFAULT_GRID)).toBe(125);
    expect(beatMs(DEFAULT_GRID)).toBe(500);
    expect(barMs(DEFAULT_GRID)).toBe(2000);
  });

  test("snapping goes to the nearest step", () => {
    expect(snapMs(0, DEFAULT_GRID)).toBe(0);
    expect(snapMs(70, DEFAULT_GRID)).toBe(125);
    expect(snapMs(63, DEFAULT_GRID)).toBe(125);
    expect(snapMs(188, DEFAULT_GRID)).toBe(250);
    expect(snapMs(189, DEFAULT_GRID)).toBe(250);
  });

  test("floor and ceil land on the steps either side", () => {
    expect(floorMs(250, DEFAULT_GRID)).toBe(250);
    expect(floorMs(260, DEFAULT_GRID)).toBe(250);
    expect(ceilMs(260, DEFAULT_GRID)).toBe(375);
  });

  test("a position is a bar, a beat and a step", () => {
    expect(gridPosition(0, DEFAULT_GRID)).toEqual({ bar: 1, beat: 1, step: 1 });
    expect(gridPosition(500, DEFAULT_GRID)).toEqual({ bar: 1, beat: 2, step: 1 });
    expect(gridPosition(2000, DEFAULT_GRID)).toEqual({ bar: 2, beat: 1, step: 1 });
    expect(gridPosition(2125, DEFAULT_GRID)).toEqual({ bar: 2, beat: 1, step: 2 });
  });

  test("a window has bar, beat and step lines", () => {
    const lines = gridLines(0, 2000, DEFAULT_GRID);
    expect(lines[0]).toEqual({ timeMs: 0, bar: true, beat: true });
    expect(lines.filter((line) => line.bar)).toHaveLength(2);
    expect(lines.filter((line) => line.beat)).toHaveLength(5);
    expect(lines).toHaveLength(17);
  });

  test("the grid is clamped into a playable range", () => {
    expect(clampGrid({ bpm: 0, beatsPerBar: 0, division: 5 })).toEqual({
      bpm: 120,
      beatsPerBar: 1,
      division: 4,
    });
    expect(clampGrid({ bpm: 900, beatsPerBar: 99, division: 7 }).bpm).toBe(400);
    expect(clampGrid({ division: 7 }).division).toBe(6);
  });
});
