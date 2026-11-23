import { describe, expect, test } from "bun:test";
import {
  EMPTY_JUKEBOX,
  advance,
  clearQueue,
  enqueue,
  markFailed,
  markFillerFailed,
  peekNext,
  playNext,
  playNow,
  queueCount,
  reconcile,
  removeFromQueue,
  setPosition,
  shuffleIds,
  startJukebox,
  type JukeboxState,
} from "./jukebox";

const SONGS = ["a", "b", "c", "d", "e"];

function state(patch: Partial<JukeboxState> = {}): JukeboxState {
  return { ...EMPTY_JUKEBOX, ...patch };
}

describe("shuffleIds", () => {
  test("is a shuffled copy: every song once, and the same order for the same seed", () => {
    const once = shuffleIds(SONGS, "session:1");
    const twice = shuffleIds(SONGS, "session:1");
    expect(once).toEqual(twice);
    expect([...once].sort()).toEqual([...SONGS].sort());
    // A different round is a different order, not just the same list again.
    expect(shuffleIds(SONGS, "session:2")).not.toEqual(once);
  });

  test("does not mutate what it is given", () => {
    const ids = [...SONGS];
    shuffleIds(ids, "seed");
    expect(ids).toEqual(SONGS);
  });
});

describe("startJukebox and advance", () => {
  test("starts on a filler when nothing is chosen", () => {
    const next = startJukebox(EMPTY_JUKEBOX, SONGS, "s");
    expect(next.current).not.toBeNull();
    expect(SONGS).toContain(next.current as string);
    expect(next.queue).toEqual([]);
    expect(next.bag.length).toBe(SONGS.length - 1);
  });

  test("a queued song comes before the shuffle", () => {
    const queued = enqueue(EMPTY_JUKEBOX, "c");
    const started = startJukebox(queued, SONGS, "s");
    expect(started.current).toBe("c");
    expect(started.queue).toEqual([]);
  });

  test("the player's queue is consumed in order, then the shuffle fills", () => {
    let next = enqueue(EMPTY_JUKEBOX, "d");
    next = enqueue(next, "a");
    next = playNow(next, "e");
    expect(next.queue).toEqual(["d", "a"]);

    next = advance(next, SONGS, "s");
    expect(next.current).toBe("d");
    next = advance(next, SONGS, "s");
    expect(next.current).toBe("a");
    expect(next.queue).toEqual([]);

    // The queue is empty; the next song is a filler and is not written into it.
    next = advance(next, SONGS, "s");
    expect(next.current).not.toBeNull();
    expect(next.queue).toEqual([]);
  });

  test("a full shuffle round plays every song once before a repeat", () => {
    let next = startJukebox(EMPTY_JUKEBOX, SONGS, "round");
    const played = [next.current];
    for (let index = 1; index < SONGS.length; index += 1) {
      next = advance(next, SONGS, "round");
      played.push(next.current);
    }
    expect(new Set(played).size).toBe(SONGS.length);
    // The bag is empty and the next advance begins a fresh round.
    expect(next.bag).toEqual([]);
    const after = advance(next, SONGS, "round");
    expect(after.current).not.toBeNull();
    expect(after.round).toBe(next.round + 1);
  });

  test("peekNext agrees with advance", () => {
    const current = state({ current: "a", bag: ["c", "b"], round: 1 });
    expect(peekNext(current, SONGS, "s")).toBe("c");
    expect(advance(current, SONGS, "s").current).toBe("c");
  });

  test("a queue head is the peek, before any filler", () => {
    const current = state({ current: "a", queue: ["e"], bag: ["c"] });
    expect(peekNext(current, SONGS, "s")).toBe("e");
  });
});

describe("choosing a song", () => {
  test("playNow interrupts and takes the song out of the queue and the bag", () => {
    const before = state({ current: "a", queue: ["b", "c"], bag: ["d", "e"] });
    const next = playNow(before, "c");
    expect(next.current).toBe("c");
    expect(next.queue).toEqual(["b"]);
    expect(next.bag).toEqual(["d", "e"]);
    expect(next.positionMs).toBe(0);
  });

  test("playNext moves an already queued song to the front, once", () => {
    const before = state({ current: "a", queue: ["b", "c"], bag: ["d"] });
    const next = playNext(before, "c");
    expect(next.queue).toEqual(["c", "b"]);
    expect(next.bag).toEqual(["d"]);
  });

  test("playNext with nothing playing starts that song", () => {
    const next = playNext(EMPTY_JUKEBOX, "b");
    expect(next.current).toBe("b");
    expect(next.queue).toEqual([]);
  });

  test("the playing song cannot be queued behind itself", () => {
    const before = state({ current: "a" });
    expect(playNext(before, "a")).toBe(before);
  });

  test("enqueue adds once, at the end, and never duplicates", () => {
    let next = enqueue(EMPTY_JUKEBOX, "a");
    next = enqueue(next, "b");
    next = enqueue(next, "a");
    expect(next.queue).toEqual(["a", "b"]);
    expect(queueCount(next)).toBe(2);
  });

  test("a queued song is not also a filler", () => {
    const before = state({ current: "a", bag: ["b", "c"] });
    const next = enqueue(before, "b");
    expect(next.queue).toEqual(["b"]);
    expect(next.bag).toEqual(["c"]);
  });

  test("remove and clear only touch the player's queue", () => {
    const before = state({ current: "a", queue: ["b", "c"], bag: ["d"] });
    expect(removeFromQueue(before, "b").queue).toEqual(["c"]);
    const cleared = clearQueue(before);
    expect(cleared.current).toBe("a");
    expect(cleared.queue).toEqual([]);
    expect(cleared.bag).toEqual(["d"]);
  });
});

describe("failures", () => {
  test("a failed song leaves the lists and the current moves on", () => {
    const before = state({ current: "a", queue: ["b"], bag: ["c"] });
    const next = markFailed(before, "a", SONGS, "s");
    expect(next.failed).toContain("a");
    expect(next.current).toBe("b");
    expect(next.queue).toEqual([]);
  });

  test("a failed filler is not offered again in the same round", () => {
    const before = state({ current: "a", bag: ["b", "c"] });
    const next = markFailed(before, "b", SONGS, "s");
    expect(next.bag).toEqual(["c"]);
    expect(next.failed).toContain("b");
  });

  test("a failed prefetch leaves the player's queue alone", () => {
    const before = state({ current: "a", queue: ["b"], bag: ["b", "c"] });
    const next = markFillerFailed(before, "b");
    expect(next.queue).toEqual(["b"]);
    expect(next.bag).toEqual(["c"]);
    expect(next.failed).toContain("b");
    expect(next.current).toBe("a");
  });

  test("asking for a failed song by name tries it again", () => {
    const before = state({ current: "a", failed: ["b"] });
    expect(playNow(before, "b").failed).toEqual([]);
    expect(playNext(before, "b").failed).toEqual([]);
    expect(enqueue(before, "b").failed).toEqual([]);
  });

  test("every song failed leaves nothing playing rather than looping", () => {
    let next = state({ current: "a", bag: ["b"] });
    next = markFailed(next, "a", ["a", "b"], "s");
    next = markFailed(next, "b", ["a", "b"], "s");
    expect(next.current).toBeNull();
  });
});

describe("following the library and the screen", () => {
  test("reconcile drops ids the library no longer has", () => {
    const before = state({
      current: "a",
      queue: ["b", "gone"],
      bag: ["c", "gone"],
      failed: ["gone"],
    });
    const next = reconcile(before, ["a", "b", "c"]);
    expect(next.current).toBe("a");
    expect(next.queue).toEqual(["b"]);
    expect(next.bag).toEqual(["c"]);
    expect(next.failed).toEqual([]);
  });

  test("a current song that left the library is let go", () => {
    const next = reconcile(state({ current: "gone" }), ["a"]);
    expect(next.current).toBeNull();
  });

  test("the saved position is a number, never negative", () => {
    expect(setPosition(EMPTY_JUKEBOX, 1_234).positionMs).toBe(1_234);
    expect(setPosition(EMPTY_JUKEBOX, -4).positionMs).toBe(0);
    expect(setPosition(EMPTY_JUKEBOX, Number.NaN).positionMs).toBe(0);
  });
});
