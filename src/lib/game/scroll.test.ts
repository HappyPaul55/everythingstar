import { describe, expect, test } from "bun:test";
import {
  axisPercent,
  beatsInWindow,
  nextAxisOffset,
  nextWindow,
  notesInWindow,
  seatWindow,
  WINDOW_STEP_MS,
} from "./scroll";

describe("axisPercent", () => {
  test("puts the playhead on the anchor", () => {
    expect(axisPercent(5000, 5000, 0.85, 5)).toBeCloseTo(85, 5);
  });

  test("measuring up the axis shrinks the percentage, down grows it", () => {
    expect(axisPercent(6000, 5000, 0.85, 5)).toBeCloseTo(105, 5);
    expect(axisPercent(4000, 5000, 0.85, 5)).toBeCloseTo(65, 5);
  });

  test("scales with the seconds the axis holds", () => {
    // A second is a fifth of a five-second span, but a tenth of a ten-second one.
    expect(axisPercent(6000, 5000, 0, 5)).toBeCloseTo(20, 5);
    expect(axisPercent(6000, 5000, 0, 10)).toBeCloseTo(10, 5);
  });

  test("a reversed axis puts later moments higher up", () => {
    expect(axisPercent(5000, 5000, 0.85, 5, true)).toBeCloseTo(85, 5);
    expect(axisPercent(6000, 5000, 0.85, 5, true)).toBeCloseTo(65, 5);
    expect(axisPercent(4000, 5000, 0.85, 5, true)).toBeCloseTo(105, 5);
  });
});

describe("nextAxisOffset", () => {
  test("cancels the position, so a moment stays put on screen", () => {
    for (const reverse of [false, true]) {
      const from = 5000;
      const at = 6400;
      const screen =
        axisPercent(at, from, 0.85, 5, reverse) +
        nextAxisOffset(at, from, 5, reverse);
      expect(screen).toBeCloseTo(85, 5);
    }
  });

  test("travels one way or the other", () => {
    // A horizontal layer moves backwards (left); a vertical one forward (down).
    expect(nextAxisOffset(6000, 5000, 5, false)).toBeCloseTo(-20, 5);
    expect(nextAxisOffset(6000, 5000, 5, true)).toBeCloseTo(20, 5);
  });
});

describe("notesInWindow", () => {
  const notes: Array<{ id: string; timeMs: number }> = Array.from(
    { length: 10 },
    (_, index) => ({ id: `n${index}`, timeMs: index * 1000 }),
  );

  test("returns the window plus a neighbour either side", () => {
    const window = notesInWindow(notes, 3000, 6000);
    expect(window.map((note) => note.id)).toEqual(["n2", "n3", "n4", "n5", "n6", "n7"]);
  });

  test("keeps a sustain that began before the window, and not a short early note", () => {
    const spans = [
      { id: "long", timeMs: 0, lengthMs: 5000 },
      { id: "early", timeMs: 0, lengthMs: 100 },
      { id: "mid", timeMs: 3000, lengthMs: 0 },
      { id: "in", timeMs: 5000, lengthMs: 0 },
    ];
    // `mid` is the one-note neighbour the view keeps; `early` is behind it and is
    // not mounted, while the long sustain is.
    expect(notesInWindow(spans, 4000, 6000).map((note) => note.id)).toEqual([
      "long",
      "mid",
      "in",
    ]);
  });

  test("clamps at the start and the end", () => {
    expect(notesInWindow(notes, 0, 1000).map((note) => note.id)).toEqual([
      "n0",
      "n1",
      "n2",
    ]);
    expect(notesInWindow(notes, 8000, 9000).map((note) => note.id)).toEqual([
      "n7",
      "n8",
      "n9",
    ]);
  });

  test("a window past the end still hands back the last neighbour", () => {
    // n9 is the neighbour of a window that starts beyond the chart.
    expect(notesInWindow(notes, 20_000, 25_000)).toEqual([notes[9]]);
  });

  test("an empty chart is fine", () => {
    expect(notesInWindow([], 0, 1000)).toEqual([]);
  });

  test("the window slides as time passes", () => {
    const early = notesInWindow(notes, 0, 2000);
    const later = notesInWindow(notes, 5000, 7000);
    expect(early.map((note) => note.id)).not.toEqual(later.map((note) => note.id));
  });

  test("a sustain stays mounted while its tail is in the window", () => {
    // The head scrolls out below the hit line long before the tail does. The
    // notes in between prove it is not merely the window's one-note neighbour.
    const held = [
      { id: "hold", timeMs: 1000, lengthMs: 9000 },
      { id: "n1", timeMs: 2000 },
      { id: "n2", timeMs: 3000 },
      { id: "n3", timeMs: 4000 },
      { id: "n4", timeMs: 5000 },
      { id: "n5", timeMs: 6000 },
    ];
    const window = notesInWindow(held, 5000, 6000);
    expect(window.map((note) => note.id)).toContain("hold");
  });

  test("a chord just behind the window keeps every member, not only the last", () => {
    // The highway keeps one neighbour behind the window. A chord shares one
    // moment, so taking only the note the index landed on unmounts the first
    // member and leaves the last.
    const chord = [
      { id: "first", timeMs: 1000 },
      { id: "last", timeMs: 1000 },
      { id: "n1", timeMs: 5000 },
      { id: "n2", timeMs: 7000 },
    ];
    const window = notesInWindow(chord, 5000, 6000).map((note) => note.id);
    expect(window).toContain("first");
    expect(window).toContain("last");
  });

  test("a sustain that ended before the window is not kept for its tail", () => {
    const played = [
      { id: "done", timeMs: 1000, lengthMs: 500 },
      { id: "n1", timeMs: 2000 },
      { id: "n2", timeMs: 3000 },
      { id: "n3", timeMs: 4000 },
      { id: "n4", timeMs: 5000 },
    ];
    const window = notesInWindow(played, 5000, 6000);
    expect(window.map((note) => note.id)).not.toContain("done");
  });

  test("a sustain ending exactly at the window's edge is still mounted", () => {
    const held = [{ id: "hold", timeMs: 1000, lengthMs: 4000 }, { id: "n1", timeMs: 6000 }];
    expect(notesInWindow(held, 5000, 6000).map((note) => note.id)).toContain("hold");
  });
});

describe("beatsInWindow", () => {
  test("a beat is a beat apart", () => {
    // 120 bpm: half a second.
    const beats = beatsInWindow(500, 0, 2000);
    expect(beats.map((beat) => beat.timeMs)).toEqual([0, 500, 1000, 1500, 2000]);
  });

  test("the window is inclusive at both edges and no wider", () => {
    const beats = beatsInWindow(500, 1200, 2200).map((beat) => beat.timeMs);
    expect(beats).toEqual([1500, 2000]);
  });

  test("every fourth beat is a bar line", () => {
    const bars = beatsInWindow(500, 0, 2000).map((beat) => beat.bar);
    expect(bars).toEqual([true, false, false, false, true]);
  });

  test("no tempo, or a nonsense one, is no grid at all", () => {
    expect(beatsInWindow(0, 0, 1000)).toEqual([]);
    expect(beatsInWindow(-500, 0, 1000)).toEqual([]);
    expect(beatsInWindow(Number.NaN, 0, 1000)).toEqual([]);
    expect(beatsInWindow(500, 2000, 1000)).toEqual([]);
  });

  test("a window before the song starts does not run backwards", () => {
    // The first window is seated behind zero, so beats before the song are dropped.
    expect(beatsInWindow(500, -700, 500).map((beat) => beat.timeMs)).toEqual([0, 500]);
  });

  test("the grid is anchored to the song, not the window", () => {
    // A window that starts between two beats picks up the next one, not a whole one.
    const beats = beatsInWindow(500, 1300, 1600).map((beat) => beat.timeMs);
    expect(beats).toEqual([1500]);
  });
});

describe("the mounted window", () => {
  const BEFORE = 700;
  const AFTER = 4000;
  const mounted = seatWindow(0, BEFORE, AFTER);

  test("seats the run-up plus a step ahead and the past behind", () => {
    expect(mounted).toEqual({ fromMs: -BEFORE, toMs: AFTER + WINDOW_STEP_MS });
  });

  test("is kept while the run-up the view needs still lasts", () => {
    // 5000 left ahead, 4000 needed: nothing to do.
    expect(nextWindow(1000, mounted, BEFORE, AFTER)).toBeNull();
  });

  test("is refreshed the moment the run-up would run short", () => {
    // 3000 left ahead, 4000 needed.
    expect(nextWindow(7000, mounted, BEFORE, AFTER)).toEqual({
      fromMs: 7000 - BEFORE,
      toMs: 7000 + AFTER + WINDOW_STEP_MS,
    });
  });

  test("the fresh window re-seats the run-up in full, so it never falls under it", () => {
    const now = 7000;
    const fresh = nextWindow(now, mounted, BEFORE, AFTER);
    expect(fresh).not.toBeNull();
    // Everything the view can show ahead of the playhead is mounted...
    expect(fresh!.toMs - now).toBeGreaterThanOrEqual(AFTER);
    // ...and stays mounted while the window is kept, right up to the refresh.
    for (let at = now; at <= fresh!.toMs - AFTER; at += 100) {
      expect(nextWindow(at, fresh!, BEFORE, AFTER)).toBeNull();
    }
  });

  test("a seek backwards refreshes at once", () => {
    expect(nextWindow(1000, { fromMs: 5000, toMs: 9000 }, BEFORE, AFTER)).toEqual({
      fromMs: 1000 - BEFORE,
      toMs: 1000 + AFTER + WINDOW_STEP_MS,
    });
  });

  test("the step is a knob, not part of the lookahead", () => {
    const tight = seatWindow(0, BEFORE, AFTER, 500);
    // A short step makes for a short-lived window, but the lookahead is intact.
    expect(tight.toMs).toBe(AFTER + 500);
    expect(nextWindow(4000, tight, BEFORE, AFTER, 500)).toEqual(
      seatWindow(4000, BEFORE, AFTER, 500),
    );
  });
});
