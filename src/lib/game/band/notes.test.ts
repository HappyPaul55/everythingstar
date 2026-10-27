import { describe, expect, test } from "bun:test";
import {
  HIT_BURST_MS,
  NOTE_SHARE,
  SECONDS_3D,
  SECONDS_FLAT,
  arrowFor,
  arrowSet,
  columnCentre,
  heldColumns,
  hitBursts,
  noteBox,
  noteClasses,
  noteColumnBox,
  noteGlyph,
  noteWindowSeconds,
} from "./notes";
import type { LaneNote } from "../track";

const note = (over: Partial<LaneNote> = {}): LaneNote => ({
  id: "n",
  timeMs: 0,
  lengthMs: 0,
  kind: "strum",
  column: 2,
  hero: false,
  ...over,
});

describe("columnCentre", () => {
  test("spreads columns evenly", () => {
    expect(columnCentre(0, 5)).toBe(10);
    expect(columnCentre(4, 5)).toBe(90);
    expect(columnCentre(0, 4)).toBe(12.5);
  });

  test("a note takes most of its column, so the two of a chord read apart", () => {
    expect(NOTE_SHARE).toBeGreaterThan(0.5);
    expect(NOTE_SHARE).toBeLessThan(1);
  });
});

describe("noteColumnBox", () => {
  test("a note takes its share of a single column, centred on it", () => {
    const box = noteColumnBox(0, 1);
    expect(box.width).toBeCloseTo(100 * NOTE_SHARE, 5);
    expect(box.left + box.width / 2).toBeCloseTo(columnCentre(0, 1), 5);
  });

  test("five columns spread the boxes down the highway without overlap", () => {
    const boxes = [0, 1, 2, 3, 4].map((column) => noteColumnBox(column, 5));
    boxes.forEach((box, column) => {
      expect(box.width).toBeCloseTo((100 / 5) * NOTE_SHARE, 5);
      expect(box.left + box.width / 2).toBeCloseTo(columnCentre(column, 5), 5);
    });
    for (let index = 1; index < boxes.length; index += 1) {
      // A gap between neighbours: the two notes of a chord read apart.
      expect(boxes[index].left).toBeGreaterThan(
        boxes[index - 1].left + boxes[index - 1].width,
      );
    }
  });

  test("an open note has no column, so it spans the whole highway", () => {
    expect(noteColumnBox(null, 5)).toEqual({ left: 0, width: 100 });
    expect(noteColumnBox(null, 1)).toEqual({ left: 0, width: 100 });
  });
});

describe("arrow sets", () => {
  test("four columns are the dance mat's, in its column order", () => {
    expect(arrowSet(4)).toEqual(["left", "up", "down", "right"]);
  });

  test("five columns are a five-panel dance layout, so the middle keeps its own", () => {
    expect(arrowSet(5)).toEqual([
      "down-left",
      "up-left",
      "dot",
      "up-right",
      "down-right",
    ]);
  });

  test("fewer columns are symmetric, so no side is missing a direction", () => {
    expect(arrowSet(1)).toEqual(["dot"]);
    expect(arrowSet(2)).toEqual(["left", "right"]);
    expect(arrowSet(3)).toEqual(["left", "up", "right"]);
  });

  test("a column count with no set of its own falls back to the mat", () => {
    expect(arrowSet(6)).toEqual(arrowSet(4));
    expect(arrowSet(0)).toEqual(arrowSet(4));
    expect(arrowSet(Number.NaN)).toEqual(arrowSet(4));
  });

  test("a column takes the arrow of its place, and wraps rather than failing", () => {
    expect(arrowFor(0, 4)).toBe("left");
    expect(arrowFor(3, 4)).toBe("right");
    expect(arrowFor(0, 5)).toBe("down-left");
    expect(arrowFor(2, 5)).toBe("dot");
    expect(arrowFor(4, 5)).toBe("down-right");
    // A six-column chart cycles the mat; a column past the end is not an error.
    expect(arrowFor(5, 6)).toBe(arrowFor(1, 4));
    expect(arrowFor(6, 5)).toBe("up-left");
    expect(arrowFor(-1, 4)).toBe("right");
  });
});

describe("noteGlyph", () => {
  test("the arrows skin makes the glyph the note on every instrument", () => {
    expect(noteGlyph("arrows", "guitar", 0, 5)).toBe("down-left");
    expect(noteGlyph("arrows", "drums", 3, 4)).toBe("right");
    expect(noteGlyph("arrows", "keys", 2, 5)).toBe("dot");
    expect(noteGlyph("arrows", "dance", 3, 4)).toBe("right");
  });

  test("a bar or a gem keeps the instrument's own glyph", () => {
    expect(noteGlyph("bars", "dance", 1, 4)).toBe("up");
    expect(noteGlyph("gems", "dance", 2, 4)).toBe("down");
    // Every other instrument's note is plain, whichever rounded shape it is.
    expect(noteGlyph("bars", "guitar", 0, 5)).toBeNull();
    expect(noteGlyph("gems", "keys", 2, 4)).toBeNull();
  });

  test("an open note has no direction and no glyph", () => {
    expect(noteGlyph("arrows", "dance", null, 4)).toBeNull();
    expect(noteGlyph("bars", "dance", null, 4)).toBeNull();
  });
});

describe("noteClasses", () => {
  test("always carries the state", () => {
    expect(noteClasses(note(), { state: "live", hammered: false })).toContain("is-live");
    expect(noteClasses(note(), { state: "miss", hammered: false })).toContain("is-miss");
  });

  test("tells columns apart by position and colour, never by shape", () => {
    const classes = noteClasses(note({ column: 3 }), { state: "pending", hammered: false });
    expect(classes).toContain("is-column-3");
    for (const other of classes) expect(other).not.toContain("shape");
  });

  test("an open note says so, and takes no column", () => {
    const classes = noteClasses(note({ column: null }), {
      state: "pending",
      hammered: false,
    });
    expect(classes).toContain("is-open");
    expect(classes.some((name) => name.startsWith("is-column-"))).toBe(false);
  });

  test("a drum kit's kick pedal is its own mark, not a sixth fret colour", () => {
    const classes = noteClasses(note({ column: 5 }), {
      state: "pending",
      hammered: false,
      kick: true,
    });
    expect(classes).toContain("is-kick");
    // Column 5 would otherwise read as column 0's green, because colours repeat.
    expect(classes).not.toContain("is-column-0");
  });

  test("a hold and a hero note each have their own channel", () => {
    expect(
      noteClasses(note({ lengthMs: 400 }), { state: "pending", hammered: false }),
    ).toContain("is-sustain");
    expect(
      noteClasses(note({ hero: true }), { state: "pending", hammered: false }),
    ).toContain("is-hero");
  });

  test("a hopo wears its ring only while it can be tapped", () => {
    const hopo = note({ kind: "hopo" });
    expect(noteClasses(hopo, { state: "pending", hammered: true })).toContain("is-hopo");
    // The chain broke: the ring goes, so "strum this one" is visible.
    expect(noteClasses(hopo, { state: "pending", hammered: false })).not.toContain(
      "is-hopo",
    );
  });

  test("a held note says so, so the player can see they have it", () => {
    const held = noteClasses(note({ lengthMs: 400 }), {
      state: "hit",
      hammered: false,
      held: true,
    });
    expect(held).toContain("is-held");
    expect(
      noteClasses(note({ lengthMs: 400 }), { state: "hit", hammered: false }),
    ).not.toContain("is-held");
  });
});

describe("noteBox", () => {
  test("a plain note's head is its bottom, and its body stands above it", () => {
    const box = noteBox(80, 80, 4);
    expect(box).toEqual({ top: 76, height: 4 });
    expect(box.top + box.height).toBe(80);
  });

  test("a sustain spans from its tail, which is earlier in the song, down to its head", () => {
    const box = noteBox(80, 20, 4);
    expect(box).toEqual({ top: 20, height: 60 });
    expect(box.top + box.height).toBe(80);
  });

  test("a hold shorter than a note still keeps a note's height above the head", () => {
    const box = noteBox(80, 79.5, 4);
    expect(box).toEqual({ top: 76, height: 4 });
    expect(box.top + box.height).toBe(80);
  });

  test("a plain note and a sustain at the same head time start on the same line", () => {
    // The bottom is the head in both: the bug this pins is a body anchored to the
    // top, which puts a sustain a note's height away from a plain note.
    expect(noteBox(60, 60, 4).top + noteBox(60, 60, 4).height).toBe(60);
    expect(noteBox(60, 20, 4).top + noteBox(60, 20, 4).height).toBe(60);
  });

  test("a note at the top of the axis may stand above it; the highway masks it", () => {
    expect(noteBox(2, 2, 4)).toEqual({ top: -2, height: 4 });
  });
});

describe("noteWindowSeconds", () => {
  test("1× is the run-up the game has always drawn, in either view", () => {
    expect(noteWindowSeconds("flat", 1)).toBe(SECONDS_FLAT);
    expect(noteWindowSeconds("3d", 1)).toBe(SECONDS_3D);
    expect(SECONDS_FLAT).toBe(4.3);
    expect(SECONDS_3D).toBe(6.6);
  });

  test("faster shows less song, slower shows more", () => {
    expect(noteWindowSeconds("flat", 2)).toBeCloseTo(SECONDS_FLAT / 2);
    expect(noteWindowSeconds("3d", 2)).toBeCloseTo(SECONDS_3D / 2);
    expect(noteWindowSeconds("flat", 0.5)).toBeCloseTo(SECONDS_FLAT / 0.5);
    expect(noteWindowSeconds("3d", 0.5)).toBeCloseTo(SECONDS_3D / 0.5);
  });

  test("speed is applied the same way to both views", () => {
    const ratio = SECONDS_3D / SECONDS_FLAT;
    for (const speed of [0.5, 1, 1.3, 1.7, 2]) {
      expect(noteWindowSeconds("3d", speed) / noteWindowSeconds("flat", speed)).toBeCloseTo(
        ratio,
      );
    }
  });

  test("clamps a value from somewhere else rather than drawing an empty window", () => {
    // Below the floor is the slowest legal speed, not a division by nothing.
    expect(noteWindowSeconds("flat", 0)).toBe(SECONDS_FLAT / 0.5);
    expect(noteWindowSeconds("flat", -3)).toBe(SECONDS_FLAT / 0.5);
    // Above the ceiling is the fastest legal speed, not a window of no seconds.
    expect(noteWindowSeconds("3d", 99)).toBe(SECONDS_3D / 2);
    // And a number that is not a number is the usual run-up.
    expect(noteWindowSeconds("flat", Number.NaN)).toBe(SECONDS_FLAT);
    expect(noteWindowSeconds("3d", Number.POSITIVE_INFINITY)).toBe(SECONDS_3D);
  });
});

describe("hitBursts", () => {
  test("a note that just landed has a burst on the line", () => {
    expect(hitBursts([1000], 1000)).toEqual([{ index: 0, atMs: 1000 }]);
    expect(hitBursts([1000], 1000 + HIT_BURST_MS)).toEqual([
      { index: 0, atMs: 1000 },
    ]);
  });

  test("an old hit's burst has gone, and so has one that has not happened", () => {
    expect(hitBursts([1000], 1000 + HIT_BURST_MS + 1)).toEqual([]);
    // A seek back puts the playhead before a time the old run recorded: that note
    // must not light up as if it had just been played.
    expect(hitBursts([1000], 999)).toEqual([]);
  });

  test("only hits burst, and only those inside the window at once", () => {
    const now = 2000;
    // A chart's notes, and so its hit times, are in song order: the newest are last.
    expect(
      hitBursts([null, 500, now - HIT_BURST_MS, now], now).map((burst) => burst.index),
    ).toEqual([2, 3]);
  });

  test("a long history costs the same answer as a short one", () => {
    const size = 100_000;
    const times = Array.from({ length: size }, (_, index) => index * 100);
    const now = (size - 1) * 100 + 25;
    // Every read of a note's own time, so the walk's cost is visible: only the
    // handful inside the window and the one that stopped it are looked at.
    const reads: number[] = [];
    const counted = new Proxy(times, {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\d+$/.test(property)) {
          reads.push(Number(property));
        }
        return Reflect.get(target, property, receiver);
      },
    });

    expect(hitBursts(counted, now).map((burst) => burst.index)).toEqual([
      size - 3,
      size - 2,
      size - 1,
    ]);
    expect(reads.length).toBeLessThanOrEqual(4);
  });

  test("a start index does not walk the unplayed future", () => {
    const played = 20;
    const times = [
      ...Array.from({ length: played }, (_, index) => index * 100),
      // The rest of a long chart, still ahead of the run: every one is a null.
      ...Array.from({ length: 50_000 }, () => null),
    ];
    const now = (played - 1) * 100 + 25;
    const reads: number[] = [];
    const counted = new Proxy(times, {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\d+$/.test(property)) {
          reads.push(Number(property));
        }
        return Reflect.get(target, property, receiver);
      },
    });

    expect(
      hitBursts(counted, now, HIT_BURST_MS, played - 1).map((burst) => burst.index),
    ).toEqual([played - 3, played - 2, played - 1]);
    // Only the recent hits and the one that stopped the walk are looked at.
    expect(reads.length).toBeLessThanOrEqual(4);
    expect(Math.max(...reads)).toBeLessThan(played);
  });

  test("a start index is clamped to the history the array has", () => {
    // Before the first note (a run at `cursor - 1` on its first tick) is no burst,
    // and past the end is the last note, never an empty answer.
    expect(hitBursts([1000, null], 1000, HIT_BURST_MS, -1)).toEqual([]);
    expect(hitBursts([1000, null], 1000, HIT_BURST_MS, 99)).toEqual([
      { index: 0, atMs: 1000 },
    ]);
  });

  test("a window of its own is honoured, so the caller can shorten it", () => {
    expect(hitBursts([1000], 1100, 100)).toHaveLength(1);
    expect(hitBursts([1000], 1101, 100)).toHaveLength(0);
  });

  test("nothing to draw is nothing, and a hole in the times is skipped", () => {
    expect(hitBursts([], 0)).toEqual([]);
    expect(hitBursts([null, null], 5000)).toEqual([]);
    expect(hitBursts([Number.NaN], 0)).toEqual([]);
  });
});

describe("heldColumns", () => {
  test("lights every column a fret is holding down", () => {
    expect(heldColumns([false, true, false, true, false], 5)).toEqual([
      false,
      true,
      false,
      true,
      false,
    ]);
  });

  test("a hold past the chart's columns is not one, and the rest are not held", () => {
    // A layout reaches further than a three-column chart asks for.
    expect(heldColumns([true, false, false, true, true], 3)).toEqual([
      true,
      false,
      false,
    ]);
    // A chart wider than the input fills the columns the hand cannot reach.
    expect(heldColumns([true], 3)).toEqual([true, false, false]);
  });

  test("nothing is held on a line with no columns", () => {
    expect(heldColumns([true, true], 0)).toEqual([]);
    expect(heldColumns([], 3)).toEqual([false, false, false]);
  });
});
