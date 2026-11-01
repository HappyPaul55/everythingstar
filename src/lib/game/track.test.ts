import { describe, expect, test } from "bun:test";
import {
  chartFor,
  chartProblems,
  cleanSlides,
  difficultiesFor,
  fitMelodyTurns,
  MAX_NOTE_LENGTH_MS,
  MAX_NOTE_TIME_MS,
  nearestDifficulty,
  slideProblems,
  type Difficulty,
  type InstrumentKind,
  type LaneChart,
  type LaneNote,
  type MelodyNote,
  type Track,
} from "./track";

/** A chart of nothing, since only its instrument and difficulty matter here. */
function chart(instrument: InstrumentKind, difficulty: Difficulty): LaneChart {
  return { instrument, difficulty, columns: 5, notes: [] };
}

function track(charts: LaneChart[], over: Partial<Track> = {}): Track {
  return {
    id: "t",
    title: "A song",
    durationMs: 1000,
    melody: { parts: 1, hasPitch: true, rows: 6, rootMidi: 57, lines: [], notes: [] },
    charts,
    ...over,
  };
}

describe("nearestDifficulty", () => {
  test("the exact one, when it is there", () => {
    expect(nearestDifficulty(["easy", "normal", "hard"], "normal")).toBe("normal");
  });

  test("otherwise the closest, and a tie goes to the easier", () => {
    expect(nearestDifficulty(["easy", "hard"], "normal")).toBe("easy");
    expect(nearestDifficulty(["normal", "expert"], "hard")).toBe("normal");
    expect(nearestDifficulty(["easy"], "expert")).toBe("easy");
  });
});

describe("difficultiesFor", () => {
  test("is what the track carries for that instrument, easiest first", () => {
    const song = track([chart("guitar", "hard"), chart("guitar", "easy"), chart("bass", "normal")]);
    expect(difficultiesFor(song, "guitar")).toEqual(["easy", "hard"]);
    expect(difficultiesFor(song, "bass")).toEqual(["normal"]);
    expect(difficultiesFor(song, "drums")).toEqual([]);
  });
});

describe("chartFor", () => {
  test("hands back the chart, resolving a difficulty the song does not carry", () => {
    const song = track([chart("guitar", "easy"), chart("guitar", "hard")]);
    expect(chartFor(song, "guitar", "easy")?.difficulty).toBe("easy");
    // Not a chart of nothing: the same instrument, at the nearest level it has.
    expect(chartFor(song, "guitar", "normal")?.difficulty).toBe("easy");
    expect(chartFor(song, "guitar", "expert")?.difficulty).toBe("hard");
  });

  test("nothing at all for an instrument the song has no part for", () => {
    expect(chartFor(track([chart("guitar", "normal")]), "drums", "normal")).toBeNull();
  });

  test("a role picks its own chart, and a roleless seat prefers the lead", () => {
    const song = track([
      { ...chart("guitar", "hard"), role: "lead" },
      { ...chart("guitar", "hard"), role: "rhythm" },
    ]);
    expect(chartFor(song, "guitar", "hard", "lead")?.role).toBe("lead");
    expect(chartFor(song, "guitar", "hard", "rhythm")?.role).toBe("rhythm");
    expect(chartFor(song, "guitar", "hard")?.role).toBe("lead");
    // Difficulties are per role too: each role's levels are its own.
    expect(difficultiesFor(song, "guitar", "lead")).toEqual(["hard"]);
    expect(difficultiesFor(song, "guitar", "rhythm")).toEqual(["hard"]);
  });

  test("a plain guitar chart wins over a role the song happens to list", () => {
    const song = track([
      chart("guitar", "easy"),
      { ...chart("guitar", "expert"), role: "rhythm" },
    ]);
    // The roleless chart is the lead, and the seat that did not ask for a role
    // takes it rather than being forced onto the rhythm.
    expect(chartFor(song, "guitar", "easy")?.role).toBeUndefined();
    expect(chartFor(song, "guitar", "easy", "rhythm")?.role).toBe("rhythm");
  });

  test("a single role is what a roleless seat takes", () => {
    const song = track([{ ...chart("guitar", "normal"), role: "rhythm" }]);
    expect(chartFor(song, "guitar", "normal")?.role).toBe("rhythm");
  });

  test("a remembered role the song does not carry falls back to what it has", () => {
    const song = track([{ ...chart("guitar", "normal"), role: "lead" }]);
    expect(chartFor(song, "guitar", "normal", "rhythm")?.role).toBe("lead");
  });
});

describe("fitMelodyTurns", () => {
  const word = (over: Partial<MelodyNote>): MelodyNote => ({
    id: "n",
    timeMs: 0,
    lengthMs: 0,
    part: 0,
    row: 3,
    text: "la",
    hero: false,
    ...over,
  });

  test("a note ends where the next note in its part begins", () => {
    const notes = [
      word({ id: "long", timeMs: 1000, lengthMs: 3000 }),
      word({ id: "short", timeMs: 2000, lengthMs: 500 }),
    ];
    const fitted = fitMelodyTurns(notes);
    expect(fitted).toHaveLength(2);
    expect(fitted[0]).toMatchObject({ id: "long", timeMs: 1000, lengthMs: 1000 });
    // The later note keeps its own length: it is the one being played.
    expect(fitted[1]).toMatchObject({ id: "short", timeMs: 2000, lengthMs: 500 });
  });

  test("a normal melody with no overlap is unchanged", () => {
    const notes = [
      word({ id: "a", timeMs: 1000, lengthMs: 400 }),
      word({ id: "b", timeMs: 1500, lengthMs: 200 }),
      word({ id: "c", timeMs: 1800, lengthMs: 0 }),
    ];
    expect(fitMelodyTurns(notes)).toEqual(notes);
  });

  test("parts are independent: a harmony may sit over a lead", () => {
    const notes = [
      word({ id: "lead", part: 0, timeMs: 1000, lengthMs: 3000 }),
      word({ id: "harmony", part: 1, timeMs: 1500, lengthMs: 800 }),
    ];
    const fitted = fitMelodyTurns(notes);
    expect(fitted[0].lengthMs).toBe(3000);
    expect(fitted[1].lengthMs).toBe(800);
  });

  test("a note sharing its moment with the next keeps no length, and none goes negative", () => {
    const fitted = fitMelodyTurns([
      word({ id: "a", timeMs: 1000, lengthMs: 500 }),
      word({ id: "b", timeMs: 1000, lengthMs: 500 }),
      word({ id: "c", timeMs: 900, lengthMs: -20 }),
    ]);
    expect(fitted.find((note) => note.id === "a")?.lengthMs).toBe(0);
    expect(fitted.find((note) => note.id === "c")?.lengthMs).toBe(0);
  });
});

describe("slides", () => {
  const note = (over: Partial<LaneNote> = {}): LaneNote => ({
    id: "n",
    timeMs: 0,
    lengthMs: 0,
    kind: "strum",
    column: 0,
    hero: false,
    ...over,
  });

  const lanes = (...notes: LaneNote[]): LaneChart => ({
    instrument: "guitar",
    difficulty: "hard",
    columns: 5,
    notes,
  });

  test("a link from one note to a later one is playable", () => {
    expect(
      chartProblems(
        lanes(
          note({ id: "a", timeMs: 1000, column: 0, slideTo: "b" }),
          note({ id: "b", timeMs: 1600, column: 2 }),
        ),
      ),
    ).toEqual([]);
  });

  test("a note hours past any song, or held for hours, is refused", () => {
    expect(
      chartProblems(lanes(note({ id: "a", timeMs: MAX_NOTE_TIME_MS + 1, column: 0 }))),
    ).toContain("note a is outside the song's time");
    expect(
      chartProblems(
        lanes(note({ id: "b", timeMs: 1000, lengthMs: MAX_NOTE_LENGTH_MS + 1, column: 0 })),
      ),
    ).toContain("note b is held for longer than the game can play");
    expect(
      chartProblems(lanes(note({ id: "c", timeMs: 1000, lengthMs: 500, column: 0 }))),
    ).toEqual([]);
  });

  test("a chord may slide all of its notes, or only some, including a cross", () => {
    const chart_ = lanes(
      note({ id: "a", timeMs: 1000, column: 0, slideTo: "c" }),
      note({ id: "b", timeMs: 1000, column: 2, slideTo: "d" }),
      note({ id: "c", timeMs: 1600, column: 3 }),
      note({ id: "d", timeMs: 1600, column: 4 }),
    );
    expect(chartProblems(chart_)).toEqual([]);
    expect(
      chartProblems(
        lanes(
          note({ id: "a", timeMs: 1000, column: 0 }),
          note({ id: "b", timeMs: 1000, column: 2, slideTo: "c" }),
          note({ id: "c", timeMs: 1600, column: 3 }),
        ),
      ),
    ).toEqual([]);
  });

  test("a chain is forward links, so it may keep gliding", () => {
    expect(
      chartProblems(
        lanes(
          note({ id: "a", timeMs: 1000, column: 0, slideTo: "b" }),
          note({ id: "b", timeMs: 1600, column: 2, slideTo: "c" }),
          note({ id: "c", timeMs: 2200, column: 4 }),
        ),
      ),
    ).toEqual([]);
  });

  test("a note exactly at either end of a glide is not in its way", () => {
    // The window is strictly between: a note sharing the source's moment is a
    // chord, and one sharing the target's arrives with the target.
    expect(
      slideProblems([
        note({ id: "a", timeMs: 1000, column: 0, slideTo: "b" }),
        note({ id: "x", timeMs: 1000, column: 1 }),
        note({ id: "b", timeMs: 1600, column: 2 }),
        note({ id: "y", timeMs: 1600, column: 2 }),
      ]),
    ).toEqual([]);
    expect(
      slideProblems([
        note({ id: "a", timeMs: 1000, column: 0, slideTo: "b" }),
        note({ id: "x", timeMs: 1300, column: 0 }),
        note({ id: "b", timeMs: 1600, column: 2 }),
      ]),
    ).toContain("note a slides past a note in its own column");
  });

  test("the source's end is where the glide begins, so a held tail counts", () => {
    // The sustain ends at 1800; the target at 1600 is inside it.
    expect(
      slideProblems([
        note({ id: "a", timeMs: 1000, lengthMs: 800, column: 0, slideTo: "b" }),
        note({ id: "b", timeMs: 1600, column: 2 }),
      ]),
    ).toContain("note a slides to a note that is not after it");
  });

  test("an open note is not a pad, at either end", () => {
    expect(
      slideProblems([
        note({ id: "a", timeMs: 1000, column: null, slideTo: "b" }),
        note({ id: "b", timeMs: 1600, column: 2 }),
      ]),
    ).toContain("note a is an open note that slides");
    expect(
      slideProblems([
        note({ id: "a", timeMs: 1000, column: 0, slideTo: "b" }),
        note({ id: "b", timeMs: 1600, column: null }),
      ]),
    ).toContain("note a slides to an open note");
  });

  test("a slide changes pads", () => {
    expect(
      slideProblems([
        note({ id: "a", timeMs: 1000, column: 2, slideTo: "b" }),
        note({ id: "b", timeMs: 1600, column: 2 }),
      ]),
    ).toContain("note a slides along its own column");
  });

  test("the glide may not pass through another note in either column", () => {
    expect(
      slideProblems([
        note({ id: "a", timeMs: 1000, column: 0, slideTo: "c" }),
        note({ id: "b", timeMs: 1300, column: 0 }),
        note({ id: "c", timeMs: 1600, column: 2 }),
      ]),
    ).toContain("note a slides past a note in its own column");
    expect(
      slideProblems([
        note({ id: "a", timeMs: 1000, column: 0, slideTo: "c" }),
        note({ id: "b", timeMs: 1300, column: 2 }),
        note({ id: "c", timeMs: 1600, column: 2 }),
      ]),
    ).toContain("note a slides past a note in the target's column");
  });

  test("one target, one finger: a second source is refused", () => {
    expect(
      slideProblems([
        note({ id: "a", timeMs: 1000, column: 0, slideTo: "c" }),
        note({ id: "b", timeMs: 1000, column: 2, slideTo: "c" }),
        note({ id: "c", timeMs: 1600, column: 3 }),
      ]),
    ).toContain("note b slides to a note another note already slides to");
  });

  test("a dangling target, a self-link and a backwards link are named", () => {
    expect(slideProblems([note({ id: "a", slideTo: "gone" })])).toContain(
      "note a slides to a note that is not in the chart",
    );
    expect(slideProblems([note({ id: "a", slideTo: "a" })])).toContain(
      "note a slides to itself",
    );
    expect(
      slideProblems([
        note({ id: "a", timeMs: 2000, column: 0, slideTo: "b" }),
        note({ id: "b", timeMs: 1000, column: 2 }),
      ]),
    ).toContain("note a slides to a note that is not after it");
  });

  test("cleanSlides drops the bad link and keeps the notes", () => {
    const cleaned = cleanSlides([
      note({ id: "a", timeMs: 1000, column: 0, slideTo: "gone" }),
      note({ id: "b", timeMs: 1600, column: 2 }),
    ]);
    expect(cleaned.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(cleaned[0].slideTo).toBeUndefined();
    expect(slideProblems(cleaned)).toEqual([]);
  });

  test("cleanSlides leaves a playable list alone", () => {
    const notes = [
      note({ id: "a", timeMs: 1000, column: 0, slideTo: "b" }),
      note({ id: "b", timeMs: 1600, column: 2 }),
    ];
    expect(cleanSlides(notes)).toEqual(notes);
  });
});

describe("chartProblems, on open notes", () => {
  const note = (over: Partial<LaneNote> = {}): LaneNote => ({
    id: "n",
    timeMs: 0,
    lengthMs: 0,
    kind: "strum",
    column: 0,
    hero: false,
    ...over,
  });

  const openAt = (id: string, timeMs: number): LaneNote =>
    note({ id, timeMs, column: null });

  test("two open notes at the same time are both a problem", () => {
    // Counted once per moment rather than by filtering the list for each open note.
    expect(
      chartProblems({
        instrument: "guitar",
        difficulty: "hard",
        columns: 5,
        notes: [openAt("a", 1000), openAt("b", 1000)],
      }),
    ).toEqual([
      "open note a shares its moment with another note",
      "open note b shares its moment with another note",
    ]);
  });

  test("a long chart of opens and ordinary notes reads as the same rules", () => {
    // The count is read per moment, so a chart of a few hundred notes is still one
    // pass and still says nothing about the notes that stand alone.
    const notes = Array.from({ length: 500 }, (_, index) => [
      openAt(`open-${index}`, index * 100),
      note({ id: `plain-${index}`, timeMs: index * 100 + 50, column: index % 5 }),
    ]).flat();
    expect(
      chartProblems({ instrument: "guitar", difficulty: "hard", columns: 5, notes }),
    ).toEqual([]);
    // …and one open pair among them is still caught.
    expect(
      chartProblems({
        instrument: "guitar",
        difficulty: "hard",
        columns: 5,
        notes: [...notes, openAt("late", 60_000), openAt("also-late", 60_000)],
      }).filter((problem) => problem.includes("shares its moment")),
    ).toHaveLength(2);
  });
});
