import { describe, expect, test } from "bun:test";
import {
  BAR_GAP_MS,
  MIN_BAR_MS,
  MIN_DRAWN_MS,
  ROLL_ANCHOR,
  ROLL_SHARE,
  barSpanMs,
  lineSpanMs,
  linesInWindow,
  mountedLines,
  nextOnsets,
  notePlace,
  rollNotes,
  rowCentre,
  sungNotesByPlace,
} from "./melody";
import type { MelodyLine, MelodyNote } from "../track";

const note = (over: Partial<MelodyNote> = {}): MelodyNote => ({
  id: "a",
  timeMs: 1000,
  lengthMs: 400,
  part: 0,
  row: 2,
  text: "one",
  hero: false,
  ...over,
});

describe("rowCentre", () => {
  test("centres each pitch row in its band", () => {
    expect(rowCentre(0, 6)).toBeCloseTo(100 - 100 / 12, 5);
    expect(rowCentre(5, 6)).toBeCloseTo(100 - (5.5 * 100) / 6, 5);
  });

  test("row 0 is the lowest, so it sits nearest the bottom", () => {
    expect(rowCentre(0, 6)).toBeGreaterThan(rowCentre(5, 6));
  });

  test("takes the share of the box the roll occupies", () => {
    expect(rowCentre(0, 6, 0.6)).toBeCloseTo(0.6 * (100 - 100 / 12), 5);
  });

  test("accepts a fractional row, for the voice cursor between rows", () => {
    expect(rowCentre((2 + 4) / 2, 6)).toBeCloseTo(rowCentre(3, 6), 5);
  });
});

describe("barSpanMs", () => {
  test("a held note keeps its own length", () => {
    expect(barSpanMs(note({ lengthMs: 900 }), 5000)).toBe(900);
  });

  test("a quick note keeps a floor while there is room for it", () => {
    expect(barSpanMs(note({ lengthMs: 90 }), 5000)).toBe(MIN_BAR_MS);
  });

  test("a bar stops short of the next note in its part", () => {
    // Room for 300ms before the next note, less the gap between bars.
    expect(barSpanMs(note({ lengthMs: 900 }), 1300)).toBe(300 - BAR_GAP_MS);
  });

  test("the floor never makes two bars overlap", () => {
    const span = barSpanMs(note({ lengthMs: 90 }), 1150);
    expect(span).toBe(150 - BAR_GAP_MS);
    expect(span).toBeLessThan(150);
  });

  test("the last note of a chart has no next note to stop before", () => {
    expect(barSpanMs(note({ lengthMs: 400 }), null)).toBe(400);
  });

  test("two notes 30ms apart are two bars, not one dot", () => {
    // Closer than the gap, so the clamp leaves no room — a bar is still drawn,
    // and it still ends before the next note begins.
    const span = barSpanMs(note({ lengthMs: 90 }), 1030);
    expect(span).toBe(MIN_DRAWN_MS);
    expect(span).toBeGreaterThan(0);
    expect(span).toBeLessThan(30);
  });

  test("the floor never reaches past the next note's own onset", () => {
    // A gap shorter than the floor is drawn at the gap itself, not past the note.
    expect(barSpanMs(note({ lengthMs: 90 }), 1005)).toBe(5);
    // The same moment is no room at all: two bars must not share an onset.
    expect(barSpanMs(note({ lengthMs: 90 }), 1000)).toBe(0);
  });
});

describe("the roll's own geometry", () => {
  test("every row of the roll stays inside the band the words leave it", () => {
    for (let row = 0; row < 8; row += 1) {
      const centre = rowCentre(row, 8, ROLL_SHARE);
      expect(centre).toBeGreaterThan(0);
      expect(centre).toBeLessThan(ROLL_SHARE * 100);
    }
  });

  test("the playhead sits inside the roll, with song either side of it", () => {
    expect(ROLL_ANCHOR).toBeGreaterThan(0);
    expect(ROLL_ANCHOR).toBeLessThan(1);
    expect(ROLL_SHARE).toBeGreaterThan(0);
    expect(ROLL_SHARE).toBeLessThan(1);
    // The stylesheet reads these as the percentages it used to hard-code: the
    // playhead at 30% across, and the lyric line starting at what the roll leaves
    // (100% - its share).
    expect(ROLL_ANCHOR * 100).toBeCloseTo(30);
    expect((1 - ROLL_SHARE) * 100).toBeCloseTo(40);
  });
});

describe("nextOnsets", () => {
  test("names the next note in each part, keyed by part and time", () => {
    const next = nextOnsets([
      note({ id: "a0", timeMs: 1000, part: 0 }),
      note({ id: "b0", timeMs: 1100, part: 1 }),
      note({ id: "a1", timeMs: 2000, part: 0 }),
      note({ id: "b1", timeMs: 2400, part: 1 }),
    ]);
    expect(next.get("0:1000")).toBe(2000);
    expect(next.get("0:2000")).toBeUndefined();
    expect(next.get("1:1100")).toBe(2400);
    expect(next.get("1:2400")).toBeUndefined();
  });

  test("does not mind notes arriving in a part-grouped order", () => {
    const next = nextOnsets([
      note({ id: "a0", timeMs: 1000, part: 0 }),
      note({ id: "a1", timeMs: 2000, part: 0 }),
      note({ id: "b0", timeMs: 1100, part: 1 }),
    ]);
    expect(next.get("0:1000")).toBe(2000);
    expect(next.get("1:1100")).toBeUndefined();
  });
});

describe("sungNotesByPlace", () => {
  test("the first sung note at a place is the bar's verdict", () => {
    const shared = [
      note({ id: "a", timeMs: 1000, row: 2, part: 0 }),
      note({ id: "b", timeMs: 1000, row: 2, part: 1 }),
    ];
    const sung = sungNotesByPlace(shared, new Set([0, 1]));
    expect(sung.get(notePlace(shared[0]))?.id).toBe("a");
    expect(sung.size).toBe(1);
  });

  test("a part nobody sings leaves its place neutral, not missed", () => {
    const shared = [
      note({ id: "a", timeMs: 1000, row: 2, part: 0 }),
      note({ id: "b", timeMs: 1000, row: 2, part: 1 }),
    ];
    expect(sungNotesByPlace(shared, new Set([1])).get("1000:2")?.id).toBe("b");
    // With no singer at all there is no verdict anywhere.
    expect(sungNotesByPlace(shared, new Set()).size).toBe(0);
  });

  test("places are told apart by their moment and their row", () => {
    const notes = [
      note({ id: "a", timeMs: 1000, row: 2, part: 0 }),
      note({ id: "b", timeMs: 1400, row: 2, part: 0 }),
      note({ id: "c", timeMs: 1000, row: 3, part: 0 }),
    ];
    const sung = sungNotesByPlace(notes, new Set([0]));
    expect(sung.get("1000:2")?.id).toBe("a");
    expect(sung.get("1400:2")?.id).toBe("b");
    expect(sung.get("1000:3")?.id).toBe("c");
  });
});

describe("lineSpanMs", () => {
  test("a line runs to its own end", () => {
    expect(lineSpanMs(1000, 3000, null)).toBe(2000);
  });

  test("a quick line keeps the bar's floor", () => {
    expect(lineSpanMs(1000, 1050, 5000)).toBe(MIN_BAR_MS);
  });

  test("a line stops short of the next one in its part", () => {
    // 800ms of room before the next line, less the gap between lines.
    expect(lineSpanMs(1000, 3000, 1800)).toBe(800 - BAR_GAP_MS);
  });

  test("the floor never runs into the next line", () => {
    const span = lineSpanMs(1000, 1050, 1150);
    expect(span).toBe(150 - BAR_GAP_MS);
    expect(span).toBeLessThan(150);
  });
});

describe("rollNotes", () => {
  test("comes together: a shared note is drawn once, carrying both parts", () => {
    const drawn = rollNotes([
      note({ id: "a", timeMs: 1000, row: 2, part: 0 }),
      note({ id: "b", timeMs: 1000, row: 2, part: 1 }),
      // The same row at another moment is another note.
      note({ id: "c", timeMs: 1400, row: 2, part: 0 }),
      // A freeform word carries no note at all.
      note({ id: "d", timeMs: 1400, row: null, part: 0 }),
    ]);
    const shared = drawn.filter((entry) => entry.parts.length > 1);
    expect(shared).toHaveLength(1);
    expect(shared[0].parts).toEqual([0, 1]);
    expect(drawn.map((entry) => entry.note.id)).toEqual(["a", "c"]);
  });
});

const line = (over: Partial<MelodyLine> = {}): MelodyLine => ({
  timeMs: 1000,
  endMs: 3000,
  words: [],
  parts: [{ part: 0, offset: 0 }],
  freeform: false,
  ...over,
});

describe("mountedLines", () => {
  test("a solo reads every line on its one row", () => {
    const lines = [
      // A quick line that would stop short of the next one.
      line({ timeMs: 0, endMs: 2000 }),
      line({ timeMs: 3000, endMs: 5000 }),
    ];
    const mounted = mountedLines(lines, 1);
    expect(mounted.size).toBe(2);
    const first = mounted.get("0:0");
    expect(first?.line.timeMs).toBe(0);
    // 3000ms of room before the next line: the held span (2000) is drawn whole,
    // because it does not reach the next line's onset.
    expect(first?.spanMs).toBe(2000);
    // The last line runs to its own end.
    expect(mounted.get("0:3000")?.spanMs).toBe(2000);
  });

  test("a line that would run long stops short of the next one in its part", () => {
    const lines = [
      // 4000ms long, but the next line begins 3000ms after its own onset.
      line({ timeMs: 0, endMs: 4000 }),
      line({ timeMs: 3000, endMs: 5000 }),
    ];
    const mounted = mountedLines(lines, 1);
    // The room is 3000ms, less the gap between lines.
    expect(mounted.get("0:0")?.spanMs).toBe(3000 - BAR_GAP_MS);
  });

  test("a duet's two rows each read only the lines their part sings", () => {
    const lines = [
      // A line both parts sing.
      line({
        timeMs: 0,
        endMs: 2000,
        parts: [
          { part: 0, offset: 0 },
          { part: 1, offset: 0 },
        ],
      }),
      // A line only part 1 sings.
      line({
        timeMs: 3000,
        endMs: 5000,
        parts: [{ part: 1, offset: 0 }],
      }),
    ];
    const mounted = mountedLines(lines, 2);
    // Both rows have the shared line.
    expect(mounted.get("0:0")?.line.timeMs).toBe(0);
    expect(mounted.get("1:0")?.line.timeMs).toBe(0);
    // The second line is part 1's alone.
    expect(mounted.get("1:3000")).toBeDefined();
    expect(mounted.get("0:3000")).toBeUndefined();
    // Part 1's first line (held to 2000, next at 3000) runs to its own end,
    // as does part 0's — 2000 of span does not reach the next line's onset.
    expect(mounted.get("1:0")?.spanMs).toBe(2000);
    expect(mounted.get("0:0")?.spanMs).toBe(2000);
  });
});

describe("linesInWindow", () => {
  const lines = [
    line({ timeMs: 0, endMs: 2000 }),
    line({ timeMs: 3000, endMs: 5000 }),
    line({ timeMs: 8000, endMs: 10000 }),
  ];

  test("keeps a line coming and one just over", () => {
    // A window of 0..20000ms: the anchor sits at 30% of it, 6000ms. The words'
    // own margins are a little before and a little after that, so the first
    // line (0..2000) has already run out, the second (3000..5000) straddles
    // the window, and the third (8000..10000) is still to come but on screen.
    const window = linesInWindow(
      lines,
      0,
      20000,
      ROLL_ANCHOR,
      1500,
      6000,
    );
    expect(window.map((l) => l.timeMs)).toEqual([3000, 8000]);
  });

  test("a line still to start is in when it reaches the window", () => {
    // A window of 0..20000ms: the anchor sits at 6000ms, and the third line
    // (8000..10000) begins a little after it — so it is on screen, fading up,
    // even though it has not started yet. That is the point of the wider
    // after margin: a coming line is visible before its first word.
    const window = linesInWindow(
      lines,
      0,
      20000,
      ROLL_ANCHOR,
      1500,
      6000,
    );
    expect(window.map((l) => l.timeMs)).toEqual([3000, 8000]);
  });
});
