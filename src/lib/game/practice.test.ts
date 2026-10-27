import { describe, expect, test } from "bun:test";
import {
  PRACTICE_MAX_SPEED,
  PRACTICE_MIN_SPEED,
  PRACTICE_SPEEDS,
  clampPractice,
  clampPracticeSpeed,
  parsePractice,
  practiceEnded,
  practiceSections,
  sectionAt,
  type PracticePlan,
} from "./practice";
import type { LaneChart, Track } from "./track";

const DURATION = 60_000;

function chart(phrases: LaneChart["phrases"] = []): LaneChart {
  return {
    instrument: "guitar",
    difficulty: "normal",
    columns: 5,
    phrases,
    notes: [],
  };
}

function track(overrides: Partial<Track> = {}): Track {
  return {
    id: "song",
    title: "Song",
    durationMs: DURATION,
    melody: { parts: 1, hasPitch: false, rows: 0, rootMidi: 60, lines: [], notes: [] },
    charts: [chart()],
    ...overrides,
  };
}

const plan = (overrides: Partial<PracticePlan> = {}): PracticePlan => ({
  startMs: 10_000,
  endMs: 20_000,
  speed: 0.8,
  loop: false,
  ...overrides,
});

describe("practiceSections", () => {
  test("the song's own sections win, and each ends where the next begins", () => {
    const sections = practiceSections(
      track({
        sections: [
          { timeMs: 12_000, name: "Chorus" },
          { timeMs: 0, name: "Verse 1" },
          { timeMs: 30_000, name: "Bridge" },
        ],
        charts: [chart([{ startMs: 0, endMs: 1_000 }])],
      }),
    );
    expect(sections).toEqual([
      { label: "Verse 1", startMs: 0, endMs: 12_000 },
      { label: "Chorus", startMs: 12_000, endMs: 30_000 },
      { label: "Bridge", startMs: 30_000, endMs: DURATION },
    ]);
  });

  test("a first marker after the top leaves the intro reachable", () => {
    const sections = practiceSections(
      track({
        sections: [
          { timeMs: 12_000, name: "Verse 1" },
          { timeMs: 30_000, name: "Chorus" },
        ],
      }),
    );
    expect(sections).toEqual([
      { label: "Intro", startMs: 0, endMs: 12_000 },
      { label: "Verse 1", startMs: 12_000, endMs: 30_000 },
      { label: "Chorus", startMs: 30_000, endMs: DURATION },
    ]);
  });

  test("a section that starts at the very end is dropped rather than empty", () => {
    const sections = practiceSections(
      track({
        sections: [
          { timeMs: 0, name: "All of it" },
          { timeMs: DURATION, name: "Nothing" },
        ],
      }),
    );
    expect(sections).toEqual([{ label: "All of it", startMs: 0, endMs: DURATION }]);
  });

  test("without sections the first lane chart's phrases are numbered", () => {
    const sections = practiceSections(
      track({
        charts: [
          chart([
            { startMs: 8_000, endMs: 12_000 },
            { startMs: 2_000, endMs: 5_000 },
          ]),
          chart([{ startMs: 20_000, endMs: 30_000 }]),
        ],
      }),
    );
    expect(sections).toEqual([
      { label: "Phrase 1", startMs: 2_000, endMs: 5_000 },
      { label: "Phrase 2", startMs: 8_000, endMs: 12_000 },
    ]);
  });

  test("phrases are clamped to the song and empty or reversed ones are dropped", () => {
    const sections = practiceSections(
      track({
        charts: [
          chart([
            { startMs: -5_000, endMs: 4_000 },
            { startMs: 10_000, endMs: 10_000 },
            { startMs: 20_000, endMs: 15_000 },
            { startMs: 55_000, endMs: 90_000 },
          ]),
        ],
      }),
    );
    expect(sections).toEqual([
      { label: "Phrase 1", startMs: 0, endMs: 4_000 },
      { label: "Phrase 2", startMs: 55_000, endMs: DURATION },
    ]);
  });

  test("a song with neither sections nor phrases is the whole song", () => {
    expect(practiceSections(track())).toEqual([
      { label: "Whole song", startMs: 0, endMs: DURATION },
    ]);
    // Even a one-phrase chart is still one named choice.
    expect(practiceSections(track({ charts: [chart([{ startMs: 1_000, endMs: 2_000 }])] }))).toEqual([
      { label: "Phrase 1", startMs: 1_000, endMs: 2_000 },
    ]);
  });

  test("a song with no length has nothing to practise", () => {
    expect(practiceSections(track({ durationMs: 0 }))).toEqual([]);
  });

  test("sections are sorted even when the source wrote them out of order", () => {
    const sections = practiceSections(
      track({
        sections: [
          { timeMs: 40_000, name: "Third" },
          { timeMs: 20_000, name: "Second" },
          { timeMs: 0, name: "First" },
        ],
      }),
    );
    expect(sections.map((section) => section.label)).toEqual(["First", "Second", "Third"]);
  });
});

describe("clampPractice", () => {
  test("keeps a plan inside the song", () => {
    expect(clampPractice(plan({ startMs: -5_000, endMs: 90_000 }), DURATION)).toEqual({
      startMs: 0,
      endMs: DURATION,
      speed: 0.8,
      loop: false,
    });
  });

  test("repairs a reversed or empty span by stretching it to the end", () => {
    expect(clampPractice(plan({ startMs: 20_000, endMs: 10_000 }), DURATION)).toEqual({
      startMs: 20_000,
      endMs: DURATION,
      speed: 0.8,
      loop: false,
    });
    expect(clampPractice(plan({ startMs: 20_000, endMs: 20_000 }), DURATION)).toEqual({
      startMs: 20_000,
      endMs: DURATION,
      speed: 0.8,
      loop: false,
    });
  });

  test("a start at the very end has no tail, so the whole song is the repair", () => {
    expect(clampPractice(plan({ startMs: DURATION, endMs: DURATION }), DURATION)).toEqual({
      startMs: 0,
      endMs: DURATION,
      speed: 0.8,
      loop: false,
    });
  });

  test("a song with no length gives an empty plan at zero, never a negative one", () => {
    expect(clampPractice(plan({ startMs: 5_000, endMs: 10_000 }), 0)).toEqual({
      startMs: 0,
      endMs: 0,
      speed: 0.8,
      loop: false,
    });
  });

  test("the speed snaps to the offered steps", () => {
    expect(PRACTICE_SPEEDS).toEqual([0.5, 0.6, 0.7, 0.8, 0.9, 1]);
    expect(clampPracticeSpeed(0.83)).toBe(0.8);
    expect(clampPracticeSpeed(0.86)).toBe(0.9);
    expect(clampPracticeSpeed(0)).toBe(PRACTICE_MIN_SPEED);
    expect(clampPracticeSpeed(2)).toBe(PRACTICE_MAX_SPEED);
    expect(clampPracticeSpeed(Number.NaN)).toBe(1);
  });
});

describe("parsePractice", () => {
  test("reads a plan and clamps it", () => {
    expect(parsePractice({ startMs: 1_000, endMs: 80_000, speed: 0.7, loop: true }, DURATION)).toEqual({
      startMs: 1_000,
      endMs: DURATION,
      speed: 0.7,
      loop: true,
    });
  });

  test("tolerates missing fields", () => {
    expect(parsePractice({}, DURATION)).toEqual({
      startMs: 0,
      endMs: DURATION,
      speed: 1,
      loop: false,
    });
  });

  test("reads only a real number: a string, null or boolean is the fallback", () => {
    // A stored plan writes numbers, so `"2000"` is not one. And `Number(null)` is
    // 0, which would turn a null speed into the slowest step rather than the
    // record's own.
    const whole = { startMs: 0, endMs: DURATION, speed: 1, loop: false };
    expect(parsePractice({ startMs: "2000", speed: "0.6" }, DURATION)).toEqual(whole);
    expect(parsePractice({ startMs: null, speed: null }, DURATION)).toEqual(whole);
    expect(parsePractice({ speed: true }, DURATION)).toEqual(whole);
    // A null end is the end of the song, whatever the start is.
    expect(parsePractice({ startMs: 1_000, endMs: null }, DURATION)).toEqual({
      ...whole,
      startMs: 1_000,
    });
  });

  test("anything that is not a plan is null", () => {
    expect(parsePractice(null, DURATION)).toBeNull();
    expect(parsePractice(undefined, DURATION)).toBeNull();
    expect(parsePractice("practice", DURATION)).toBeNull();
    expect(parsePractice([1, 2], DURATION)).toBeNull();
  });
});

describe("the loop boundary", () => {
  test("the pass ends exactly on endMs", () => {
    expect(practiceEnded(plan({ endMs: 20_000 }), 19_999)).toBe(false);
    expect(practiceEnded(plan({ endMs: 20_000 }), 20_000)).toBe(true);
    expect(practiceEnded(plan({ endMs: 20_000 }), 20_001)).toBe(true);
  });

  test("sectionAt finds the stretch a plan starts in, boundaries going forward", () => {
    const sections = practiceSections(
      track({
        sections: [
          { timeMs: 0, name: "One" },
          { timeMs: 10_000, name: "Two" },
          { timeMs: 30_000, name: "Three" },
        ],
      }),
    );
    expect(sectionAt(sections, 0)?.label).toBe("One");
    expect(sectionAt(sections, 9_999)?.label).toBe("One");
    expect(sectionAt(sections, 10_000)?.label).toBe("Two");
    expect(sectionAt(sections, DURATION)?.label).toBe("Three");
  });
});
