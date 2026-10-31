import { describe, expect, test } from "bun:test";
import { chartProblems, type LaneChart, type LaneNote } from "../track";
import {
  addNote,
  chartKey,
  copyNotes,
  emptyChart,
  moveNotes,
  normaliseChart,
  noteId,
  notesInSpan,
  pasteNotes,
  quantizeNotes,
  removeNotes,
  setNote,
} from "./edit";
import { DEFAULT_GRID } from "./grid";

const note = (over: Partial<LaneNote> = {}): LaneNote => ({
  id: noteId(),
  timeMs: 1000,
  lengthMs: 0,
  kind: "strum",
  column: 0,
  hero: false,
  ...over,
});

const chart = (notes: LaneNote[] = []): LaneChart => ({
  instrument: "guitar",
  difficulty: "expert",
  columns: 5,
  notes,
});

describe("editing a chart", () => {
  test("a key names the instrument, role and level", () => {
    expect(chartKey({ instrument: "guitar", role: "lead", difficulty: "expert" })).toBe(
      "guitar:lead:expert",
    );
    expect(chartKey({ instrument: "drums", difficulty: "hard" })).toBe("drums::hard");
  });

  test("a new chart starts at its instrument's width", () => {
    expect(emptyChart("guitar", "expert").columns).toBe(5);
    expect(emptyChart("drums", "hard").columns).toBe(6);
    expect(emptyChart("dance", "easy").columns).toBe(4);
  });

  test("adding a note keeps the list sorted and canonical", () => {
    const first = note({ timeMs: 1000, column: 2 });
    const second = note({ timeMs: 500, column: 0 });
    const notes = addNote([first], second, chart([first]));
    expect(notes.map((entry) => entry.timeMs)).toEqual([500, 1000]);
    expect(notes[0].id).toBe(second.id);
  });

  test("one note per column at one moment", () => {
    const a = note({ timeMs: 1000, column: 2 });
    const b = note({ timeMs: 1000, column: 2 });
    const notes = addNote([a], b, chart([a]));
    expect(notes).toHaveLength(1);
    expect(notes[0].id).toBe(b.id);
  });

  test("an open note cannot share its moment", () => {
    const open = note({ timeMs: 1000, column: null });
    const fret = note({ timeMs: 1000, column: 1 });
    const notes = addNote([open], fret, chart([open]));
    expect(notes).toHaveLength(1);
    expect(notes[0].column).toBe(1);
  });

  test("a sustain stops at the next note in its column", () => {
    const long = note({ timeMs: 1000, column: 1, lengthMs: 4000 });
    const next = note({ timeMs: 1800, column: 1 });
    const notes = normaliseChart({ ...chart([long, next]), key: "guitar::expert" }).notes;
    expect(notes[0].lengthMs).toBe(800);
    expect(notes[1].timeMs).toBe(1800);
  });

  test("a tapped instrument's notes are ordinary strums", () => {
    const keys: LaneChart = { ...chart(), instrument: "keys" };
    const notes = addNote([], note({ kind: "strum", column: 2 }), keys);
    expect(notes[0].kind).toBe("strum");
  });

  test("a hopo cannot be the first note", () => {
    const notes = addNote([], note({ kind: "hopo" }), chart());
    expect(notes[0].kind).toBe("strum");
  });

  test("moving clamps a note into the highway", () => {
    const a = note({ timeMs: 1000, column: 4 });
    const moved = moveNotes([a], new Set([a.id]), 250, 3, chart([a]));
    expect(moved[0].column).toBe(4);
    expect(moved[0].timeMs).toBe(1250);
    const back = moveNotes([a], new Set([a.id]), -2000, -9, chart([a]));
    expect(back[0].timeMs).toBe(0);
    expect(back[0].column).toBe(0);
  });

  test("setting a note patches only that note", () => {
    const a = note({ timeMs: 1000, column: 1 });
    const b = note({ timeMs: 2000, column: 2 });
    const notes = setNote([a, b], a.id, { lengthMs: 400, hero: true }, chart([a, b]));
    expect(notes[0].lengthMs).toBe(400);
    expect(notes[0].hero).toBe(true);
    expect(notes[1].lengthMs).toBe(0);
  });

  test("deleting a selection leaves the rest", () => {
    const a = note();
    const b = note({ column: 1 });
    expect(removeNotes([a, b], new Set([a.id]))).toEqual([b]);
  });

  test("quantizing moves starts and ends together", () => {
    const a = note({ timeMs: 1130, column: 1, lengthMs: 630 });
    const notes = quantizeNotes([a], new Set([a.id]), DEFAULT_GRID, true);
    expect(notes[0].timeMs).toBe(1125);
    expect(notes[0].lengthMs).toBe(625);
  });

  test("copy and paste keeps relative timing and converts the kind", () => {
    const a = note({ timeMs: 1000, column: 0 });
    const b = note({ timeMs: 1250, column: 2, lengthMs: 500 });
    const clip = copyNotes([a, b], new Set([a.id, b.id]), 5);
    expect(clip.notes.map((entry) => entry.offsetMs)).toEqual([0, 250]);
    const keys: LaneChart = { ...chart(), instrument: "keys" };
    const pasted = pasteNotes([], clip, 4000, keys);
    expect(pasted.map((entry) => entry.timeMs)).toEqual([4000, 4250]);
    expect(pasted.every((entry) => entry.kind === "strum")).toBe(true);
  });

  test("paste skips a column the target does not have", () => {
    const a = note({ column: 4 });
    const clip = copyNotes([a], new Set([a.id]), 5);
    const narrow: LaneChart = { ...chart(), columns: 0 as number };
    // `normaliseNotes` clamps a chart to at least one column, so column 4 is gone.
    const pasted = pasteNotes([], clip, 0, { ...narrow, columns: 1 });
    expect(pasted).toHaveLength(0);
  });

  test("a span selects the notes whose heads are in it", () => {
    const a = note({ timeMs: 1000 });
    const b = note({ timeMs: 2000, column: 1 });
    expect(notesInSpan([a, b], 900, 1500).map((entry) => entry.id)).toEqual([a.id]);
  });

  test("a normalised chart passes the game's gate", () => {
    const notes = [
      note({ timeMs: 1000, column: 0, lengthMs: 2000 }),
      note({ timeMs: 1200, column: 0 }),
      note({ timeMs: 1200, column: 1, kind: "hopo" }),
    ];
    const normal = normaliseChart({ ...chart(notes), key: "guitar::expert" });
    expect(chartProblems(normal)).toEqual([]);
  });
});

describe("slides in the charter", () => {
  test("a normalised chart keeps a playable link", () => {
    const source = note({ timeMs: 1000, column: 0, slideTo: "target" });
    const target = note({ id: "target", timeMs: 1600, column: 2 });
    const normal = normaliseChart({ ...chart([source, target]), key: "guitar::expert" });
    expect(normal.notes[0].slideTo).toBe("target");
    expect(chartProblems(normal)).toEqual([]);
  });

  test("deleting a target through the workspace repair drops the source's link", () => {
    const source = note({ timeMs: 1000, column: 0, slideTo: "target" });
    const target = note({ id: "target", timeMs: 1600, column: 2 });
    const left = removeNotes([source, target], new Set(["target"]));
    const normal = normaliseChart({ ...chart(left), key: "guitar::expert" });
    expect(normal.notes).toHaveLength(1);
    expect(normal.notes[0].slideTo).toBeUndefined();
  });

  test("moving a target onto the source's column drops the link", () => {
    const source = note({ timeMs: 1000, column: 0, slideTo: "target" });
    const target = note({ id: "target", timeMs: 1600, column: 2 });
    const moved = moveNotes([source, target], new Set(["target"]), 0, -2, chart());
    const normal = normaliseChart({ ...chart(moved), key: "guitar::expert" });
    expect(normal.notes.find((entry) => entry.id === "target")?.column).toBe(0);
    expect(normal.notes.find((entry) => entry.id === source.id)?.slideTo).toBeUndefined();
  });

  test("copy and paste carries a link when both ends are in the selection", () => {
    const source = note({ timeMs: 1000, column: 0, slideTo: "target" });
    const target = note({ id: "target", timeMs: 1600, column: 2 });
    const clip = copyNotes([source, target], new Set([source.id, "target"]), 5);
    expect(clip.notes[0].slideTo).toBe(1);
    const pasted = pasteNotes([], clip, 4000, chart());
    expect(pasted).toHaveLength(2);
    expect(pasted[0].slideTo).toBe(pasted[1].id);
    expect(chartProblems({ ...chart(pasted) })).toEqual([]);
  });

  test("a source copied without its target drops the link", () => {
    const source = note({ timeMs: 1000, column: 0, slideTo: "target" });
    const target = note({ id: "target", timeMs: 1600, column: 2 });
    const clip = copyNotes([source, target], new Set([source.id]), 5);
    expect(clip.notes[0].slideTo).toBeUndefined();
    const pasted = pasteNotes([], clip, 0, chart());
    expect(pasted[0].slideTo).toBeUndefined();
  });
});
