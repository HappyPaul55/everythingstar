import { describe, expect, test } from "bun:test";
import { advanceLanes, applyTrigger, emptyLaneRun } from "./lanes";
import {
  METER_DRAIN_PER_MS,
  METER_FILL,
  METER_FULL_AT,
  METER_MISS_DRAIN,
  STAR_POWER_MS,
  canActivateStar,
  drainMeter,
  fillMeter,
  missMeter,
  starPowerActive,
} from "./meter";
import { advanceRun, emptyRun } from "./run";
import { HIT_WINDOW_MS } from "./scoring";
import { SING_GRACE_MS } from "./singing";
import type { LaneChart, MelodyNote } from "./track";

const note: MelodyNote = {
  id: "word",
  timeMs: 0,
  lengthMs: 0,
  part: 0,
  row: 0,
  text: "nine",
  hero: false,
};

const hit = () => ({ hit: true, offsetMs: 0 });
const missed = () => ({ hit: false, offsetMs: 0 });

const chart: LaneChart = {
  instrument: "guitar",
  difficulty: "normal",
  columns: 5,
  notes: [
    {
      id: "note",
      timeMs: 0,
      lengthMs: 0,
      kind: "strum",
      column: 1,
      hero: false,
    },
  ],
};

const strum = (frets: boolean[]) => ({
  timeMs: 0,
  signal: "strum" as const,
  frets,
  column: null,
});

const watched = (): LaneChart => ({
  ...chart,
  notes: [],
});

describe("the meter's own numbers", () => {
  test("a hit fills it and a miss drains it, within the gauge", () => {
    expect(fillMeter(0)).toBe(METER_FILL);
    expect(missMeter(50)).toBe(50 - METER_MISS_DRAIN);
    expect(fillMeter(99)).toBe(100);
    expect(missMeter(5)).toBe(0);
  });

  test("a chord fills, and a dropped chord drains, once per note", () => {
    expect(fillMeter(0, 3)).toBe(METER_FILL * 3);
    expect(missMeter(50, 2)).toBe(50 - METER_MISS_DRAIN * 2);
  });

  test("silence drains it at the shared rate", () => {
    expect(drainMeter(100, 9000)).toBe(100 - 9000 * METER_DRAIN_PER_MS);
    expect(drainMeter(100, 0)).toBe(100);
    expect(drainMeter(10, 30_000)).toBe(0);
  });
});

describe("star power", () => {
  test("only the top of the gauge can be spent", () => {
    expect(canActivateStar(0)).toBe(false);
    expect(canActivateStar(METER_FULL_AT - 1)).toBe(false);
    // The top of the gauge is full: a frame drains after it fills, so an exact 100
    // is a meter nobody could spend.
    expect(canActivateStar(METER_FULL_AT)).toBe(true);
    expect(canActivateStar(100)).toBe(true);
  });

  test("a window is live up to its own edge, and never before one is bought", () => {
    const until = 5000 + STAR_POWER_MS;
    expect(starPowerActive(0, 0)).toBe(false);
    expect(starPowerActive(0, 1000)).toBe(false);
    expect(starPowerActive(until, 5000)).toBe(true);
    expect(starPowerActive(until, until - 1)).toBe(true);
    expect(starPowerActive(until, until)).toBe(false);
    expect(starPowerActive(until, until + 1)).toBe(false);
  });
});

describe("both judging engines use the same meter", () => {
  test("a note later in the song fills and drains over its own gap, once", () => {
    const due = Math.max(SING_GRACE_MS, HIT_WINDOW_MS);
    const at = 4000;
    const late: MelodyNote = { ...note, timeMs: at };
    // Judging a note after its own end must not rewind the run's clock: the fill
    // lands at the onset and the frame drains to `due` once, not twice.
    const melody = advanceRun(emptyRun(), [late], at + due, hit);
    expect(melody.hits).toBe(1);
    expect(melody.atMs).toBe(at + due);
    expect(melody.meter).toBe(drainMeter(fillMeter(0), due));
  });

  test("two frames over one long note drain only the time after it", () => {
    const due = Math.max(SING_GRACE_MS, HIT_WINDOW_MS);
    const at = 4000;
    const long: MelodyNote = { ...note, timeMs: at, lengthMs: 1000 };
    const end = at + 1000 + SING_GRACE_MS;
    const first = advanceRun(emptyRun(), [long], end, hit);
    const second = advanceRun(first, [long], end + 500, hit);
    expect(first.hits).toBe(1);
    expect(second.hits).toBe(1);
    expect(second.meter).toBe(drainMeter(drainMeter(fillMeter(0), end - at), 500));
  });

  test("one note hit fills it to the same value on the melody and a highway", () => {
    const due = Math.max(SING_GRACE_MS, HIT_WINDOW_MS);
    const melody = advanceRun(emptyRun(), [note], due, hit);
    const lane = advanceLanes(
      applyTrigger(emptyLaneRun(chart), chart, strum([false, true, false, false, false])),
      chart,
      due,
      [],
    );
    expect(melody.hits).toBe(1);
    expect(lane.hits).toBe(1);
    expect(melody.meter).toBe(drainMeter(fillMeter(0), due));
    expect(lane.meter).toBe(melody.meter);
  });

  test("one note missed drains it to the same value", () => {
    const due = Math.max(SING_GRACE_MS, HIT_WINDOW_MS);
    const melody = advanceRun({ ...emptyRun(), meter: 50 }, [note], due, missed);
    const lane = advanceLanes(
      applyTrigger(
        { ...emptyLaneRun(chart), meter: 50 },
        chart,
        strum([false, false, false, false, false]),
      ),
      chart,
      due,
      [],
    );
    expect(melody.meter).toBe(drainMeter(missMeter(50), due));
    expect(lane.meter).toBe(melody.meter);
  });

  test("silence drains it to the same value over the same gap", () => {
    const empty = watched();
    const melody = advanceRun({ ...emptyRun(), atMs: 1000, meter: 100 }, [], 10_000, hit);
    const lane = { ...emptyLaneRun(empty), atMs: 1000, meter: 100 };
    // `advanceLanes` is the highway's own drain path; the chart has no notes, so
    // there is nothing to miss and only the gap moves the meter.
    const result = advanceLanes(lane, empty, 10_000, []);
    expect(melody.meter).toBe(drainMeter(100, 9000));
    expect(result.meter).toBe(melody.meter);
  });
});
