import { describe, expect, test } from "bun:test";
import {
  advanceLanes,
  applyTrigger,
  emptyLaneRun,
  FILL_HIT_MS,
  hopoTappable,
  inFill,
  TAP_CHORD_MS,
  type LaneRun,
  type LaneTrigger,
} from "./lanes";
import {
  FILL_POINTS,
  HIT_WINDOW_MS,
  HOLD_POINTS_PER_MEASURE,
  HERO_MULTIPLE,
  NOTE_POINTS,
  STAR_MULTIPLE,
} from "./scoring";
import { METER_FULL_AT, STAR_POWER_MS } from "./meter";
import type { LaneChart, LaneNote } from "./track";

const note = (over: Partial<LaneNote> = {}): LaneNote => ({
  id: `n${Math.random()}`,
  timeMs: 1000,
  lengthMs: 0,
  kind: "strum",
  column: 1,
  hero: false,
  ...over,
});

const chart = (notes: LaneNote[], columns = 5, bpm?: number): LaneChart => ({
  instrument: "guitar",
  difficulty: "normal",
  columns,
  bpm,
  notes,
});

const frets = (...down: number[]): boolean[] => {
  const held = Array.from({ length: 5 }, () => false);
  for (const column of down) held[column] = true;
  return held;
};

const strum = (timeMs: number, held: boolean[]): LaneTrigger => ({
  timeMs,
  signal: "strum",
  frets: held,
  column: null,
});

const fret = (timeMs: number, column: number, held: boolean[]): LaneTrigger => ({
  timeMs,
  signal: "fret",
  frets: held,
  column,
});

const whammy = (timeMs: number): LaneTrigger => ({
  timeMs,
  signal: "whammy",
  frets: [],
  column: null,
});

/** A tap on a pad: a fret and a strum in one gesture. */
const touch = (timeMs: number, column: number, held: boolean[] = frets()): LaneTrigger => ({
  timeMs,
  signal: "touch",
  frets: held,
  column,
});

/** A run for a chart, with a helper that plays one trigger. */
function play(chart_: LaneChart, ...triggers: LaneTrigger[]): LaneRun {
  return triggers.reduce(
    (run, trigger) => applyTrigger(run, chart_, trigger),
    emptyLaneRun(chart_),
  );
}

/** A drum chart with a fill, and one note inside it to keep judging honest. */
function filledChart(fills = [{ startMs: 0, endMs: 2000 }]): LaneChart {
  return {
    instrument: "drums",
    difficulty: "expert",
    columns: 6,
    fills,
    notes: [
      { id: "d-0", timeMs: 1000, lengthMs: 0, kind: "strum", column: 1, hero: false },
    ],
  };
}

describe("drum fills", () => {
  test("a strike inside a fill with nothing to judge is a fill hit, not an error", () => {
    const run = play(filledChart(), strum(1500, frets()));
    expect(run.errors).toBe(0);
    expect(run.fillHits).toBe(1);
    expect(run.score).toBe(FILL_POINTS);
    expect(run.meter).toBeGreaterThan(0);
    // It is not a note: accuracy, the combo and the judged count are untouched.
    expect(run.judged).toBe(0);
    expect(run.hits).toBe(0);
    expect(run.combo).toBe(0);
    expect(run.bestCombo).toBe(0);
  });

  test("a fret or a tap at nothing is a fill hit too", () => {
    const fretted = play(filledChart(), fret(1500, 2, frets()));
    expect(fretted.errors).toBe(0);
    expect(fretted.fillHits).toBe(1);
    const tapped = play(filledChart(), touch(1500, 2));
    expect(tapped.fillHits).toBe(1);
  });

  test("one fill hit every FILL_HIT_MS, and no more", () => {
    const run = play(
      filledChart(),
      strum(1500, frets()),
      strum(1500 + FILL_HIT_MS - 10, frets()), // too soon: ignored rather than paid again
      strum(1500 + FILL_HIT_MS, frets()),
    );
    expect(run.fillHits).toBe(2);
    expect(run.score).toBe(FILL_POINTS * 2);
    expect(run.errors).toBe(0);
  });

  test("inFill is the window's rule, edges included", () => {
    const fills = [{ startMs: 1000, endMs: 2000 }];
    expect(inFill(fills, 999)).toBe(false);
    expect(inFill(fills, 1000)).toBe(true);
    expect(inFill(fills, 2000)).toBe(true);
    expect(inFill(fills, 2001)).toBe(false);
    expect(inFill(undefined, 1500)).toBe(false);
  });

  test("drumming a whole fill cannot farm the score", () => {
    // A trigger every 10 ms for a second inside a longer fill: only the rate
    // limit's worth pays.
    const chart = filledChart([{ startMs: 0, endMs: 3000 }]);
    let run = emptyLaneRun(chart);
    for (let at = 1500; at < 2500; at += 10) run = applyTrigger(run, chart, strum(at, frets()));
    expect(run.fillHits).toBe(9);
    expect(run.score).toBe(FILL_POINTS * 9);
    expect(run.combo).toBe(0);
    expect(run.errors).toBe(0);
  });

  test("a note inside a fill is judged as a note, and pays no fill hit", () => {
    const run = play(filledChart(), strum(1000, frets(1)));
    expect(run.hits).toBe(1);
    expect(run.fillHits).toBe(0);
    expect(run.score).toBe(NOTE_POINTS);
    expect(run.combo).toBe(1);
  });

  test("outside a fill a strum at nothing is still an error", () => {
    const run = play(filledChart([{ startMs: 0, endMs: 1000 }]), strum(1500, frets()));
    expect(run.errors).toBe(1);
    expect(run.fillHits).toBe(0);
    expect(run.score).toBe(0);
  });
});

describe("note kinds", () => {
  test("a strum note needs a strum, and takes the frets held", () => {
    const target = chart([note({ column: 2 })]);
    expect(play(target, strum(1000, frets(2))).hits).toBe(1);
    expect(play(target, strum(1000, frets(0))).misses).toBe(1);
  });

  test("a fret press alone does not play a strum note", () => {
    const target = chart([note({ column: 2 })]);
    expect(play(target, fret(1000, 2, frets(2))).judged).toBe(0);
  });

  test("a tapped instrument plays a strum note with its fret, or with a strum", () => {
    const target: LaneChart = { ...chart([note({ column: 2 })], 5), instrument: "keys" };
    expect(play(target, fret(1000, 2, frets(2))).hits).toBe(1);
    expect(play(target, strum(1000, frets(2))).hits).toBe(1);
  });
});

describe("chords", () => {
  const chord = chart([
    note({ id: "a", timeMs: 1000, column: 0 }),
    note({ id: "b", timeMs: 1000, column: 2 }),
  ]);

  test("a strum takes the whole chord, each note on its own fret", () => {
    const both = play(chord, strum(1000, frets(0, 2)));
    expect(both.hits).toBe(2);
  });

  test("a chord short of a fret is the whole chord missed", () => {
    // A chord is not partly played: one hand short drops every note of it, so
    // the note that was held is not a hit on its own.
    const one = play(chord, strum(1000, frets(0)));
    expect(one.hits).toBe(0);
    expect(one.misses).toBe(2);
    expect(one.errors).toBe(1);
    expect(one.outcomes).toEqual(["miss", "miss"]);
  });
});

describe("hit times", () => {
  test("a note that lands records the moment its gesture was played", () => {
    const target = chart([
      note({ id: "a", timeMs: 1000, column: 0 }),
      note({ id: "b", timeMs: 2000, column: 2 }),
    ]);
    const run = play(target, strum(1030, frets(0)));
    expect(run.hitTimes).toEqual([1030, null]);
  });

  test("a chord's notes share the one moment it was played at", () => {
    const chord_ = chart([
      note({ id: "a", timeMs: 1000, column: 0 }),
      note({ id: "b", timeMs: 1000, column: 2 }),
    ]);
    expect(play(chord_, strum(980, frets(0, 2))).hitTimes).toEqual([980, 980]);
  });

  test("a miss and a note that has not been played have no time", () => {
    const target = chart([note({ timeMs: 1000, column: 1 })]);
    expect(play(target, strum(1000, frets(0))).hitTimes).toEqual([null]);
    expect(emptyLaneRun(target).hitTimes).toEqual([null]);
  });

  test("a fresh run starts with every time cleared", () => {
    const target = chart([note({ id: "a", column: 0 })]);
    const played = play(target, strum(1000, frets(0)));
    expect(played.hitTimes).toEqual([1000]);
    expect(emptyLaneRun(target).hitTimes).toEqual([null]);
  });
});

describe("the hopo gate", () => {
  const chart_ = chart([
    note({ id: "red", timeMs: 1000, column: 1 }),
    note({ id: "blue", timeMs: 1500, kind: "hopo", column: 2 }),
  ]);

  test("after a hit, the hopo can be hammered on", () => {
    const run = play(chart_, strum(1000, frets(1)), fret(1500, 2, frets(2)));
    expect(run.hits).toBe(2);
    expect(run.misses).toBe(0);
  });

  test("after a miss, it must be strummed", () => {
    // The red note is missed, so the hopo refuses a hammer.
    const missedRed = advanceLanes(emptyLaneRun(chart_), chart_, 1000 + HIT_WINDOW_MS + 1, frets());
    expect(hopoTappable(chart_, missedRed, 1)).toBe(false);
    const hammered = applyTrigger(missedRed, chart_, fret(1500, 2, frets(2)));
    expect(hammered.hits).toBe(0);
    // ...and a strum lands it.
    const strummed = applyTrigger(missedRed, chart_, strum(1500, frets(2)));
    expect(strummed.hits).toBe(1);
  });

  test("strumming a hopo is always allowed", () => {
    const run = play(chart_, strum(1000, frets(1)), strum(1500, frets(2)));
    expect(run.hits).toBe(2);
  });

  test("while the chain is undecided the hopo still reads as hammerable", () => {
    // Nothing has happened yet: an upcoming hopo keeps its ring.
    expect(hopoTappable(chart_, emptyLaneRun(chart_), 1)).toBe(true);
  });

  test("a predecessor whose window has closed is broken, even before the frame says so", () => {
    // A trigger is judged before `advanceLanes`, so red still reads pending at
    // 1300 — but its window closed at 1150. The trigger's own moment is what says
    // the chain is gone; only while the window is still open does the ring hold.
    const fresh = emptyLaneRun(chart_);
    expect(hopoTappable(chart_, fresh, 1, 1300)).toBe(false);
    expect(hopoTappable(chart_, fresh, 1, 1050)).toBe(true);
  });

  test("a predecessor that was hit keeps the hopo hammerable however late", () => {
    const run = play(chart_, strum(1000, frets(1)));
    expect(hopoTappable(chart_, run, 1, 1500)).toBe(true);
  });

  test("a fret cannot hammer a hopo off a predecessor the run is about to drop", () => {
    const target = chart([
      note({ id: "red", timeMs: 1000, column: 1 }),
      note({ id: "blue", timeMs: 1300, kind: "hopo", column: 2 }),
    ]);
    // Nothing has advanced the run: only the trigger's own time knows red is gone.
    expect(applyTrigger(emptyLaneRun(target), target, fret(1300, 2, frets(2))).hits).toBe(0);
    // A strum always lands a hopo, whatever its chain says.
    expect(applyTrigger(emptyLaneRun(target), target, strum(1300, frets(2))).hits).toBe(1);
  });
});

describe("open notes", () => {
  const open = chart([note({ column: null })]);

  test("are strummed with no frets held", () => {
    expect(play(open, strum(1000, frets())).hits).toBe(1);
    expect(play(open, strum(1000, frets(1))).misses).toBe(1);
  });
});

describe("sustains and the whammy", () => {
  const held = chart([note({ column: 1, lengthMs: 1000 })]);

  test("a held note scores while it is held, and stops when let go", () => {
    const started = play(held, strum(1000, frets(1)));
    expect(started.holding).toEqual([0]);
    const kept = advanceLanes(started, held, 1600, frets(1));
    expect(kept.score).toBeGreaterThan(started.score);
    expect(kept.holding).toEqual([0]);
    const released = advanceLanes(kept, held, 1700, frets());
    const later = advanceLanes(released, held, 2000, frets());
    expect(later.score).toBe(released.score);
    expect(later.holding).toEqual([]);
  });

  test("a sustain's head keeps the same early and late grace as any note", () => {
    const target = chart([note({ column: 1, lengthMs: 1000 })]);
    const early = 1000 - HIT_WINDOW_MS;
    const late = 1000 + HIT_WINDOW_MS;
    // Both edges of the window are a hit, not a miss.
    expect(play(target, strum(early, frets(1))).hits).toBe(1);
    expect(play(target, strum(late, frets(1))).hits).toBe(1);
    // The note is still pending on the late edge: the miss rule closes it strictly
    // after the window, so it cannot shut a note the trigger could still hit.
    const atEdge = advanceLanes(emptyLaneRun(target), target, late, frets());
    expect(atEdge.outcomes).toEqual(["pending"]);
    expect(applyTrigger(atEdge, target, strum(late, frets(1))).hits).toBe(1);
    // A millisecond outside the window is not a hit on either side.
    expect(play(target, strum(early - 1, frets(1))).hits).toBe(0);
    expect(play(target, strum(late + 1, frets(1))).hits).toBe(0);
  });

  test("a hold can be played from its first grace to its last, and paid for all of it", () => {
    // 2s at 120 bpm is one measure, so the whole hold is 25 points at ×1.
    const target = chart([note({ column: 1, lengthMs: 2000 })], 5, 120);
    const early = 1000 - HIT_WINDOW_MS;
    let run = advanceLanes(emptyLaneRun(target), target, early, frets());
    run = applyTrigger(run, target, strum(early, frets(1)));
    expect(run.hits).toBe(1);
    expect(run.holding).toEqual([0]);
    // The early head does not pay the 150ms before the note: the hold starts on
    // the note's own start, not on the press.
    run = advanceLanes(run, target, 2000, frets(1));
    expect(run.holding).toEqual([0]);
    run = advanceLanes(run, target, 3000, frets(1));
    expect(run.holding).toEqual([]);
    expect(run.score).toBeCloseTo(NOTE_POINTS + HOLD_POINTS_PER_MEASURE);
  });

  test("a late head starts the hold where it was hit, with nothing retroactive", () => {
    const target = chart([note({ column: 1, lengthMs: 2000 })], 5, 120);
    const late = 1000 + HIT_WINDOW_MS;
    let run = advanceLanes(emptyLaneRun(target), target, late, frets());
    run = applyTrigger(run, target, strum(late, frets(1)));
    expect(run.holding).toEqual([0]);
    run = advanceLanes(run, target, 3000, frets(1));
    // 1850 of the 2000ms measure — the time before the press is not paid.
    expect(run.score).toBeCloseTo(
      NOTE_POINTS + ((3000 - late) / 2000) * HOLD_POINTS_PER_MEASURE,
    );
  });

  test("a hold pays to its end and not a point further", () => {
    const target = chart([note({ column: 1, lengthMs: 2000 })], 5, 120);
    const started = play(target, strum(1000, frets(1)));
    const ended = advanceLanes(started, target, 3000, frets(1));
    expect(ended.holding).toEqual([]);
    expect(ended.score).toBeCloseTo(NOTE_POINTS + HOLD_POINTS_PER_MEASURE);
    // Still holding the fret after the tail is not a second hold.
    expect(advanceLanes(ended, target, 5000, frets(1)).score).toBe(ended.score);
  });

  test("every sustain of a chord is held, and each is let go on its own fret", () => {
    const chord = chart([
      note({ id: "blue", column: 2, lengthMs: 1000 }),
      note({ id: "yellow", column: 3, lengthMs: 1000 }),
    ]);
    const started = play(chord, strum(1000, frets(2, 3)));
    expect(started.hits).toBe(2);
    expect(started.holding).toEqual([0, 1]);

    // Both frets stay down: both keeps scoring, and both stay on.
    const both = advanceLanes(started, chord, 1200, frets(2, 3));
    expect(both.holding).toEqual([0, 1]);
    expect(both.score).toBeGreaterThan(started.score);

    // The blue fret comes up: blue stops, yellow carries on.
    const blueUp = advanceLanes(both, chord, 1400, frets(3));
    expect(blueUp.holding).toEqual([1]);
    const later = advanceLanes(blueUp, chord, 1600, frets(3));
    expect(later.holding).toEqual([1]);
    expect(later.score).toBeGreaterThan(blueUp.score);

    // Letting the last one go ends the hold.
    expect(advanceLanes(later, chord, 1700, frets()).holding).toEqual([]);
  });

  test("a chord's holds end on their own lengths, not on the longest one", () => {
    const chord = chart([
      note({ id: "long", column: 2, lengthMs: 1000 }),
      note({ id: "short", column: 3, lengthMs: 400 }),
    ]);
    const started = play(chord, strum(1000, frets(2, 3)));
    expect(started.holding).toEqual([0, 1]);
    // Both frets are still down, but the short note's tail is over.
    const later = advanceLanes(started, chord, 1500, frets(2, 3));
    expect(later.holding).toEqual([0]);
  });

  test("a plain note beside a sustain does not cancel the hold", () => {
    // The mock's chords put a plain note after the held one, which used to
    // replace the single `holding` index with a note that had no tail at all.
    const chord = chart([
      note({ id: "held", column: 2, lengthMs: 1000 }),
      note({ id: "plain", column: 3, lengthMs: 0 }),
    ]);
    const started = play(chord, strum(1000, frets(2, 3)));
    expect(started.hits).toBe(2);
    expect(started.holding).toEqual([0]);
  });

  test("the whammy adds no score, whether a note is held or not", () => {
    const started = play(held, strum(1000, frets(1)));
    const waved = applyTrigger(started, held, whammy(1200));
    expect(waved.score).toBe(started.score);
    // A wave with nothing held does nothing at all.
    const idle = applyTrigger(emptyLaneRun(held), held, whammy(1200));
    expect(idle.score).toBe(0);
  });
});

describe("tapping the hit line", () => {
  test("a tap plays a strum note with no fret held — it is its own fret and strum", () => {
    const target = chart([note({ column: 2 })]);
    expect(play(target, touch(1000, 2, frets())).hits).toBe(1);
  });

  test("a tap plays a hopo after its chain has broken", () => {
    const chart_ = chart([
      note({ id: "red", timeMs: 1000, column: 1 }),
      note({ id: "blue", timeMs: 1500, kind: "hopo", column: 2 }),
    ]);
    // The red note passes: the chain is broken, so a hammer would refuse.
    const missedRed = advanceLanes(
      emptyLaneRun(chart_),
      chart_,
      1000 + HIT_WINDOW_MS + 1,
      frets(),
    );
    expect(applyTrigger(missedRed, chart_, fret(1500, 2, frets(2))).hits).toBe(0);
    // A tap does not care: a tap is a strum, and a strum always lands a hopo.
    expect(applyTrigger(missedRed, chart_, touch(1500, 2)).hits).toBe(1);
  });

  test("a tap plays a strum note and an open note, from any pad", () => {
    expect(play(chart([note({ column: 3 })]), touch(1000, 3)).hits).toBe(1);
    // An open note spans the highway, so any pad can take it.
    expect(play(chart([note({ column: null })]), touch(1000, 0)).hits).toBe(1);
  });

  test("a chord's taps may be a little ragged, inside the debounce", () => {
    const chord = chart([
      note({ id: "a", timeMs: 1000, column: 0 }),
      note({ id: "b", timeMs: 1000, column: 2 }),
    ]);
    const run = play(chord, touch(1000, 0), touch(1000 + TAP_CHORD_MS - 1, 2));
    expect(run.hits).toBe(2);
    expect(run.outcomes).toEqual(["hit", "hit"]);
    expect(run.errors).toBe(0);
  });

  test("a chord tapped after the debounce was not played together", () => {
    const chord = chart([
      note({ id: "a", timeMs: 1000, column: 0 }),
      note({ id: "b", timeMs: 1000, column: 2 }),
    ]);
    const run = play(chord, touch(1000, 0), touch(1000 + TAP_CHORD_MS + 1, 2));
    expect(run.hits).toBe(1);
    expect(run.outcomes).toEqual(["hit", "pending"]);
    // Nothing was judged by the late tap, and it is not the player's error either.
    expect(run.errors).toBe(0);
    // The note it meant is left to pass, exactly as a chord that was not played.
    expect(advanceLanes(run, chord, 1000 + HIT_WINDOW_MS + 1, frets()).outcomes).toEqual([
      "hit",
      "miss",
    ]);
  });

  test("a tap only takes its own column, so a chord can lose one note", () => {
    const chord = chart([
      note({ id: "a", timeMs: 1000, column: 0 }),
      note({ id: "b", timeMs: 1000, column: 2 }),
    ]);
    const run = play(chord, touch(1000, 0));
    expect(run.hits).toBe(1);
    expect(run.misses).toBe(0);
    expect(run.outcomes).toEqual(["hit", "pending"]);
  });

  test("a tap at nothing is a hand moving, not an overstrum", () => {
    const target = chart([note({ column: 2 })]);
    const run = play(target, touch(5000, 2));
    expect(run.errors).toBe(0);
    expect(run.judged).toBe(0);
  });

  test("a tap on a sustain starts the hold, so a finger on the pad keeps it", () => {
    const held = chart([note({ column: 1, lengthMs: 1000 })]);
    const started = play(held, touch(1000, 1, frets(1)));
    expect(started.hits).toBe(1);
    expect(started.holding).toEqual([0]);
    const kept = advanceLanes(started, held, 1600, frets(1));
    expect(kept.holding).toEqual([0]);
    expect(kept.score).toBeGreaterThan(started.score);
  });

  test("an open sustain is held by a finger on the line, with no frets down", () => {
    // An open note is "no frets", and a pad is the touch screen's way of saying it.
    // Without this, a tapped open sustain would drop the instant it started.
    const open = chart([note({ column: null, lengthMs: 1000 })]);
    const started = play(open, touch(1000, 0));
    expect(started.hits).toBe(1);
    expect(started.holding).toEqual([0]);
    const touching = [true, false, false, false, false];
    const kept = advanceLanes(started, open, 1600, frets(0), touching);
    expect(kept.holding).toEqual([0]);
    expect(kept.score).toBeGreaterThan(started.score);
  });
});

describe("scoring", () => {
  test("notes and chords pay their table values at ×1", () => {
    expect(play(chart([note({ column: 0 })]), strum(1000, frets(0))).score).toBe(
      NOTE_POINTS,
    );
    expect(
      play(
        chart([
          note({ id: "a", timeMs: 1000, column: 0 }),
          note({ id: "b", timeMs: 1000, column: 1 }),
        ]),
        strum(1000, frets(0, 1)),
      ).score,
    ).toBe(NOTE_POINTS * 2);
    expect(
      play(
        chart([
          note({ id: "a", timeMs: 1000, column: 0 }),
          note({ id: "b", timeMs: 1000, column: 1 }),
          note({ id: "c", timeMs: 1000, column: 2 }),
        ]),
        strum(1000, frets(0, 1, 2)),
      ).score,
    ).toBe(NOTE_POINTS * 3);
    expect(
      play(
        chart([
          note({ id: "a", timeMs: 1000, column: 0 }),
          note({ id: "b", timeMs: 1000, column: 1 }),
          note({ id: "c", timeMs: 1000, column: 2 }),
          note({ id: "d", timeMs: 1000, column: 3 }),
        ]),
        strum(1000, frets(0, 1, 2, 3)),
      ).score,
    ).toBe(NOTE_POINTS * 4);
  });

  test("timing decides a hit, not how many points it is worth", () => {
    const target = chart([note({ column: 1 })]);
    expect(play(target, strum(1000, frets(1))).score).toBe(50);
    expect(play(target, strum(1140, frets(1))).score).toBe(50);
    expect(play(target, strum(860, frets(1))).score).toBe(50);
  });

  test("a tapped chord shares the first tap's multiplier", () => {
    const chord = chart([
      note({ id: "a", timeMs: 1000, column: 0 }),
      note({ id: "b", timeMs: 1000, column: 1 }),
    ]);
    const before = { ...emptyLaneRun(chord), combo: 9, bestCombo: 9 };
    const first = applyTrigger(before, chord, touch(1000, 0));
    expect(first.score).toBe(50);
    const second = applyTrigger(first, chord, touch(1050, 1));
    // The second tap takes the combo to eleven, but the chord is one gesture at
    // ×1: 100 in total, not 50 + 100.
    expect(second.score).toBe(100);
    expect(second.combo).toBe(11);
  });

  test("a chord is one gesture at one multiplier", () => {
    const chord = chart([
      note({ id: "a", timeMs: 1000, column: 0 }),
      note({ id: "b", timeMs: 1000, column: 1 }),
    ]);
    // At combo 9 the chord is played at ×1, even though its second note takes the
    // combo to 10: the table's 100 is the whole gesture.
    const before = { ...emptyLaneRun(chord), combo: 9, bestCombo: 9 };
    const atNine = applyTrigger(before, chord, strum(1000, frets(0, 1)));
    expect(atNine.score).toBe(100);
    expect(atNine.combo).toBe(11);

    // From combo 10 the same chord is 100 × 2.
    const beforeTen = { ...emptyLaneRun(chord), combo: 10, bestCombo: 10 };
    expect(applyTrigger(beforeTen, chord, strum(1000, frets(0, 1))).score).toBe(200);
  });

  test("a sustain pays its initial note and then 25 per note per measure", () => {
    const held = chart([note({ column: 1, lengthMs: 2000 })], 5, 120);
    const started = play(held, strum(1000, frets(1)));
    expect(started.score).toBe(50);
    // 2000ms at 120 BPM is one measure; the combo is one, so ×1.
    const kept = advanceLanes(started, held, 3000, frets(1));
    expect(kept.score).toBe(75);
  });

  test("the 8x example becomes 800 at the table's x4 cap", () => {
    // Two-note chord, two measures, at ×4: 400 initial + 400 hold = 800.
    const held = chart(
      [
        note({ id: "a", timeMs: 1000, column: 0, lengthMs: 4000 }),
        note({ id: "b", timeMs: 1000, column: 1, lengthMs: 4000 }),
      ],
      5,
      120,
    );
    const before = { ...emptyLaneRun(held), combo: 30, bestCombo: 30 };
    const started = applyTrigger(before, held, strum(1000, frets(0, 1)));
    expect(started.score).toBe(400);
    const kept = advanceLanes(started, held, 5000, frets(0, 1));
    expect(kept.score).toBe(800);
  });

  test("a chart without a tempo still pays a 2 second measure", () => {
    const held = chart([note({ column: 1, lengthMs: 2000 })]);
    const started = play(held, strum(1000, frets(1)));
    expect(advanceLanes(started, held, 3000, frets(1)).score).toBe(75);
  });

  test("half a measure of hold pays half", () => {
    const held = chart([note({ column: 1, lengthMs: 2000 })], 5, 120);
    const started = play(held, strum(1000, frets(1)));
    // Held from the note's own start at 1000 to 2000: half the 2000ms measure.
    const halfway = advanceLanes(started, held, 2000, frets(1));
    expect(halfway.score).toBeCloseTo(NOTE_POINTS + HOLD_POINTS_PER_MEASURE / 2);
  });

  test("a chord's two holds pay twice", () => {
    const chord = chart(
      [
        note({ id: "a", column: 0, lengthMs: 2000 }),
        note({ id: "b", column: 1, lengthMs: 2000 }),
      ],
      5,
      120,
    );
    const started = play(chord, strum(1000, frets(0, 1)));
    const halfway = advanceLanes(started, chord, 2000, frets(0, 1));
    // Two note values plus half a measure each, at ×1.
    expect(halfway.score).toBeCloseTo(
      NOTE_POINTS * 2 + HOLD_POINTS_PER_MEASURE,
    );
  });

  test("a miss resets the multiplier ladder", () => {
    const target = chart([note({ column: 1 })]);
    const run = play(target, strum(5000, frets(1)));
    expect(run.combo).toBe(0);
    expect(run.errors).toBe(1);
  });

  test("a miss never takes points away or moves the run's clock forward", () => {
    const chord = chart([
      note({ id: "a", timeMs: 1000, column: 0 }),
      note({ id: "b", timeMs: 1000, column: 1 }),
    ]);
    // An early strum can judge a note that is still ahead of the clock. A missed
    // chord must not leave `atMs` in the future: the next frame would read that as
    // a rewind and reset the score to nothing.
    const before = {
      ...emptyLaneRun(chord),
      score: 500,
      combo: 10,
      bestCombo: 10,
      atMs: 900,
    };
    const missed = applyTrigger(before, chord, strum(900, frets(0)));
    expect(missed.score).toBe(500);
    expect(missed.combo).toBe(0);
    expect(missed.atMs).toBe(900);

    const advanced = advanceLanes(missed, chord, 900, frets());
    expect(advanced.score).toBe(500);
    expect(advanced.atMs).toBe(900);

    // The next frame is still ahead of the clock, so it is not a rewind.
    const nextFrame = advanceLanes(advanced, chord, 916, frets());
    expect(nextFrame.score).toBe(500);
    expect(nextFrame.atMs).toBe(916);
  });

  test("a window closing on a chain of notes never takes points away", () => {
    const target = chart([
      note({ id: "a", timeMs: 1000, column: 0 }),
      note({ id: "b", timeMs: 1100, column: 1 }),
      note({ id: "c", timeMs: 1200, column: 2 }),
    ]);
    const before = { ...emptyLaneRun(target), score: 500, combo: 20, atMs: 1000 };
    const missed = advanceLanes(before, target, 1400, frets());
    expect(missed.hits).toBe(0);
    expect(missed.misses).toBe(3);
    expect(missed.combo).toBe(0);
    expect(missed.score).toBe(500);
    // And the next frame still moves forward.
    expect(missed.atMs).toBe(1400);
  });
});

describe("star power", () => {
  const target = chart([note({ column: 1 })]);

  test("a whammy spends a full meter and buys the window", () => {
    const full = { ...emptyLaneRun(target), meter: 100 };
    const spent = applyTrigger(full, target, whammy(1000));
    expect(spent.meter).toBe(0);
    expect(spent.starUntilMs).toBe(1000 + STAR_POWER_MS);
    expect(spent.starActive).toBe(true);
  });

  test("a whammy below the top of the gauge does nothing", () => {
    const below = { ...emptyLaneRun(target), meter: METER_FULL_AT - 1 };
    expect(applyTrigger(below, target, whammy(1000))).toEqual(below);
  });

  test("a whammy while a window is live does not spend the meter again", () => {
    const full = { ...emptyLaneRun(target), meter: 100 };
    const spent = applyTrigger(full, target, whammy(1000));
    const again = applyTrigger({ ...spent, meter: 100 }, target, whammy(2000));
    expect(again.meter).toBe(100);
    expect(again.starUntilMs).toBe(spent.starUntilMs);
  });

  test("points are doubled while the window is live, and normal when it is not", () => {
    const live = { ...emptyLaneRun(target), starUntilMs: 2000, starActive: true };
    expect(applyTrigger(live, target, strum(1000, frets(1))).score).toBe(
      NOTE_POINTS * STAR_MULTIPLE,
    );
    // The window's edge is the end of the doubling, not the frame that notices it.
    const ending = { ...emptyLaneRun(target), starUntilMs: 1000 };
    expect(applyTrigger(ending, target, strum(1000, frets(1))).score).toBe(NOTE_POINTS);
    const after = { ...emptyLaneRun(target), starUntilMs: 1000 };
    expect(applyTrigger(after, target, strum(1100, frets(1))).score).toBe(NOTE_POINTS);
  });

  test("a chord is one gesture doubled once", () => {
    const chord = chart([
      note({ id: "a", timeMs: 1000, column: 0 }),
      note({ id: "b", timeMs: 1000, column: 1 }),
    ]);
    const before = { ...emptyLaneRun(chord), starUntilMs: 2000, starActive: true };
    const hit = applyTrigger(before, chord, strum(1000, frets(0, 1)));
    expect(hit.score).toBe(NOTE_POINTS * 2 * STAR_MULTIPLE);
  });

  test("a hold is doubled for the time the window covers", () => {
    const held = chart([note({ column: 1, lengthMs: 2000 })], 5, 120);
    const spent = applyTrigger(
      { ...emptyLaneRun(held), meter: 100 },
      held,
      whammy(900),
    );
    const hit = applyTrigger(spent, held, strum(1000, frets(1)));
    expect(hit.score).toBe(NOTE_POINTS * STAR_MULTIPLE);
    // The whole 2000ms hold runs inside the window: one measure, doubled.
    expect(advanceLanes(hit, held, 3000, frets(1)).score).toBe(
      NOTE_POINTS * STAR_MULTIPLE + HOLD_POINTS_PER_MEASURE * STAR_MULTIPLE,
    );
  });

  test("a hold crossing the end of the window is doubled only where it was live", () => {
    const held = chart([note({ column: 1, lengthMs: 3000 })], 5, 120);
    const before = { ...emptyLaneRun(held), starUntilMs: 2000, starActive: true };
    const hit = applyTrigger(before, held, strum(1000, frets(1)));
    expect(hit.score).toBe(NOTE_POINTS * STAR_MULTIPLE);
    const kept = advanceLanes(hit, held, 3000, frets(1));
    // 2000ms paid, 1000 of them inside the window: half again the 25 at ×1.
    expect(kept.score).toBe(
      NOTE_POINTS * STAR_MULTIPLE + HOLD_POINTS_PER_MEASURE * 1.5,
    );
  });

  test("the window retires on its own edge, and a new run starts clean", () => {
    const full = { ...emptyLaneRun(target), meter: 100 };
    const spent = applyTrigger(full, target, whammy(1000));
    const ending = advanceLanes(spent, target, 1000 + STAR_POWER_MS, frets());
    expect(ending.starActive).toBe(false);
    expect(emptyLaneRun(target).starUntilMs).toBe(0);
    expect(emptyLaneRun(target).starActive).toBe(false);
  });

  test("a run seeded at a seek has no window and no meter to spend", () => {
    const seeded = emptyLaneRun(target, 5000);
    expect(seeded.starUntilMs).toBe(0);
    expect(seeded.starActive).toBe(false);
    expect(seeded.meter).toBe(0);
    expect(applyTrigger(seeded, target, whammy(5000)).starUntilMs).toBe(0);
  });
});

describe("hero notes", () => {
  test("are worth five times a plain note, on the note's own value", () => {
    const plain = play(chart([note({ column: 1 })]), strum(1000, frets(1)));
    const hero = play(chart([note({ column: 1, hero: true })]), strum(1000, frets(1)));
    expect(hero.score).toBe(plain.score * HERO_MULTIPLE);
  });

  test("a hero note is counted when it lands, and a plain one is not", () => {
    const target = chart([note({ column: 1, hero: true })]);
    expect(play(target, strum(1000, frets(1))).heroHits).toBe(1);
    expect(play(chart([note({ column: 1 })]), strum(1000, frets(1))).heroHits).toBe(0);
    // A note that passes is not a hero hit, however much it was worth.
    const missed = advanceLanes(
      emptyLaneRun(target),
      target,
      1000 + HIT_WINDOW_MS + 1,
      frets(),
    );
    expect(missed.heroHits).toBe(0);
  });

  test("a chord counts every hero note it landed", () => {
    const chord = chart([
      note({ id: "a", timeMs: 1000, column: 0, hero: true }),
      note({ id: "b", timeMs: 1000, column: 2, hero: true }),
      note({ id: "c", timeMs: 1000, column: 3 }),
    ]);
    expect(play(chord, strum(1000, frets(0, 2, 3))).heroHits).toBe(2);
  });

  test("a tapped hero note counts the same as a strummed one", () => {
    const target = chart([note({ column: 2, hero: true })]);
    expect(play(target, touch(1000, 2, frets())).heroHits).toBe(1);
  });
});

describe("active errors", () => {
  test("a strum with the wrong fret is an error, and still a miss", () => {
    const target = chart([note({ column: 2 })]);
    const run = play(target, strum(1000, frets(0)));
    expect(run.misses).toBe(1);
    expect(run.errors).toBe(1);
  });

  test("a note that passes without a strum is a miss, not an error", () => {
    const target = chart([note({ timeMs: 1000 })]);
    const run = advanceLanes(emptyLaneRun(target), target, 1000 + HIT_WINDOW_MS + 1, frets());
    expect(run.misses).toBe(1);
    expect(run.errors).toBe(0);
  });

  test("a strum at nothing is an error with nothing judged", () => {
    const target = chart([note({ timeMs: 1000 })]);
    const run = play(target, strum(5000, frets(2)));
    expect(run.errors).toBe(1);
    expect(run.judged).toBe(0);
    expect(run.misses).toBe(0);
  });

  test("a hit is nobody's error, and a fret at nothing is not one either", () => {
    const target = chart([note({ column: 2 })]);
    expect(play(target, strum(1000, frets(2))).errors).toBe(0);
    expect(play(target, fret(5000, 2, frets(2))).errors).toBe(0);
  });

  test("a chord short of a fret is one error, however many notes it drops", () => {
    const target = chart([
      note({ id: "a", timeMs: 1000, column: 0 }),
      note({ id: "b", timeMs: 1000, column: 2 }),
      note({ id: "c", timeMs: 1000, column: 3 }),
    ]);
    const run = play(target, strum(1000, frets(0)));
    expect(run.misses).toBe(3);
    expect(run.errors).toBe(1);
  });
});

describe("a run seeded at a seek point", () => {
  const chart_ = chart([
    note({ id: "a", timeMs: 1000, column: 0 }),
    note({ id: "b", timeMs: 2000, column: 1 }),
    note({ id: "c", timeMs: 3000, column: 2 }),
  ]);

  test("starts at the first note at or after the seek, judging none before it", () => {
    const seeded = emptyLaneRun(chart_, 2500);
    expect(seeded.atMs).toBe(2500);
    expect(seeded.cursor).toBe(2);
    expect(seeded.judged).toBe(0);
    expect(seeded.outcomes).toEqual(["pending", "pending", "pending"]);

    // Advanced to 3000, the notes at 1000 and 2000 are simply not this run's.
    const advanced = advanceLanes(seeded, chart_, 3000, frets());
    expect(advanced.judged).toBe(0);
    expect(advanced.misses).toBe(0);
    expect(advanced.outcomes).toEqual(["pending", "pending", "pending"]);
  });

  test("only the notes after the seek can be missed", () => {
    const seeded = emptyLaneRun(chart_, 2500);
    const advanced = advanceLanes(seeded, chart_, 4000, frets());
    expect(advanced.misses).toBe(1);
    expect(advanced.outcomes).toEqual(["pending", "pending", "miss"]);
  });

  test("a note exactly at the seek point is still playable", () => {
    const seeded = emptyLaneRun(chart_, 2000);
    expect(seeded.cursor).toBe(1);
    expect(applyTrigger(seeded, chart_, strum(2000, frets(1))).hits).toBe(1);
  });

  test("a trigger after the seek cannot reach a note before it", () => {
    // 2500 sits between the two notes: the run starts at 3000, and the note at
    // 2400 is still inside a 150ms window of a trigger at 2540. It belongs to the
    // stretch before the section, so it is not this run's to judge.
    const close = chart([
      note({ id: "before", timeMs: 2400, column: 0 }),
      note({ id: "after", timeMs: 3000, column: 1 }),
    ]);
    const seeded = emptyLaneRun(close, 2500);
    expect(seeded.cursor).toBe(1);

    const tapped = applyTrigger(seeded, close, touch(2540, 0));
    expect(tapped.hits).toBe(0);
    expect(tapped.outcomes).toEqual(["pending", "pending"]);

    // A strum aimed at the same stretch leaves the old note alone too. It lands on
    // nothing, so it is the ordinary overstrum — but it is not the 2400 note, and
    // it does not miss it.
    const strummed = applyTrigger(seeded, close, strum(2540, frets(0)));
    expect(strummed.outcomes).toEqual(["pending", "pending"]);
    expect(strummed.judged).toBe(0);
    expect(strummed.misses).toBe(0);
    expect(strummed.hits).toBe(0);
    expect(strummed.errors).toBe(1);
  });

  test("seeding at zero is the ordinary empty run", () => {
    expect(emptyLaneRun(chart_)).toEqual(emptyLaneRun(chart_, 0));
    expect(emptyLaneRun(chart_).cursor).toBe(0);
    expect(emptyLaneRun(chart_).atMs).toBe(0);
  });
});

describe("advanceLanes", () => {
  test("drops anything whose window has closed", () => {
    const chart_ = chart([note({ timeMs: 1000 })]);
    // The late edge is still legal, so the window closes **after** it: a note at
    // exactly `time + HIT_WINDOW_MS` can still be hit, which is the same edge the
    // trigger reads.
    const atEdge = advanceLanes(emptyLaneRun(chart_), chart_, 1000 + HIT_WINDOW_MS, frets());
    expect(atEdge.misses).toBe(0);
    expect(atEdge.outcomes[0]).toBe("pending");
    const run = advanceLanes(
      emptyLaneRun(chart_),
      chart_,
      1000 + HIT_WINDOW_MS + 1,
      frets(),
    );
    expect(run.misses).toBe(1);
    expect(run.outcomes[0]).toBe("miss");
    // ...once. Asking again changes nothing.
    expect(advanceLanes(run, chart_, 5000, frets()).misses).toBe(1);
  });

  test("the meter drains away over silence", () => {
    const chart_ = chart([note({ timeMs: 1000 })]);
    const played = play(chart_, strum(1000, frets(1)));
    expect(played.meter).toBeGreaterThan(0);
    expect(advanceLanes(played, chart_, 40_000, frets()).meter).toBe(0);
  });
});
