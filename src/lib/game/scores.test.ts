import { afterEach, describe, expect, test } from "bun:test";
import {
  bestFor,
  boardWithRun,
  BOARD_LIMIT,
  lineupKey,
  loadBoard,
  parseBoard,
  recentFor,
  replaceBoard,
  shouldSaveRun,
  topFor,
  type SavedRun,
} from "./scores";

function run(over: Partial<SavedRun> = {}): SavedRun {
  return {
    song: "nine-lives",
    title: "Nine Lives",
    failed: false,
    score: 100,
    bestCombo: 12,
    hits: 40,
    misses: 2,
    players: [{ label: "Player 1 · Guitar", score: 100, difficulty: "normal" }],
    at: 1_760_000_000_000,
    ...over,
  };
}

describe("parseBoard", () => {
  test("an empty store is an empty board", () => {
    expect(parseBoard(null)).toEqual([]);
    expect(parseBoard("")).toEqual([]);
  });

  test("unreadable storage is an empty board, not a crash", () => {
    expect(parseBoard("{not json")).toEqual([]);
    expect(parseBoard("42")).toEqual([]);
    expect(parseBoard('{"a":1}')).toEqual([]);
  });

  test("reads back what was written", () => {
    const board = [run(), run({ score: 50 })];
    expect(parseBoard(JSON.stringify(board))).toEqual(board);
  });

  test("keeps a run's rating, and reads an older run without one", () => {
    const rated = run({ baseScore: 400, stars: 4, gold: false, average: 2.4 });
    expect(parseBoard(JSON.stringify([rated]))[0]).toEqual(rated);
    expect(parseBoard(JSON.stringify([run()]))[0].stars).toBeUndefined();
  });

  test("keeps the lineup a run was saved with, and reads an older run without one", () => {
    const keyed = run({ lineup: "guitar:expert+words:normal:sing" });
    expect(parseBoard(JSON.stringify([keyed]))[0].lineup).toBe(keyed.lineup);
    expect(parseBoard(JSON.stringify([run()]))[0].lineup).toBeUndefined();
  });

  test("drops entries that are not runs", () => {
    const raw = JSON.stringify([run(), { song: "x" }, null, 7]);
    expect(parseBoard(raw)).toHaveLength(1);
  });

  test("drops a run whose date a screen would print as Invalid Date", () => {
    const { at: _at, ...undated } = run();
    const raw = JSON.stringify([run(), undated, run({ at: Number.NaN })]);
    expect(parseBoard(raw)).toHaveLength(1);
  });

  test("drops a run with no title, which the history draws", () => {
    const { title: _title, ...untitled } = run();
    expect(parseBoard(JSON.stringify([untitled]))).toEqual([]);
  });

  test("caps a board that grew some other way", () => {
    const many = Array.from({ length: BOARD_LIMIT + 7 }, (_, index) =>
      run({ score: index, at: 1_760_000_000_000 + index }),
    );
    expect(parseBoard(JSON.stringify(many))).toHaveLength(BOARD_LIMIT);
  });
});

describe("boardWithRun", () => {
  test("puts the newest run first", () => {
    const older = run({ score: 10 });
    const newer = run({ score: 20 });
    expect(boardWithRun([older], newer)).toEqual([newer, older]);
  });

  test("keeps the board to its limit", () => {
    const board = [run({ score: 1 }), run({ score: 2 })];
    const trimmed = boardWithRun(board, run({ score: 3 }), 2);
    expect(trimmed).toHaveLength(2);
    expect(trimmed[0].score).toBe(3);
  });
});

describe("lineupKey", () => {
  test("names every player's instrument, difficulty and words mode", () => {
    expect(
      lineupKey([
        { kind: "guitar", difficulty: "expert" },
        { kind: "drums", difficulty: "hard" },
        { kind: "words", difficulty: "normal", wordsMode: "sing" },
      ]),
    ).toBe("drums:hard+guitar:expert+words:normal:sing");
  });

  test("does not depend on the order of the seats", () => {
    const players = [
      { kind: "drums" as const, difficulty: "hard" as const },
      { kind: "guitar" as const, difficulty: "expert" as const },
      { kind: "words" as const, difficulty: "normal" as const, wordsMode: "sing" as const },
    ];
    expect(lineupKey(players)).toBe(lineupKey([...players].reverse()));
  });

  test("distinguishes the instrument, the difficulty and the words mode", () => {
    const guitar = lineupKey([{ kind: "guitar", difficulty: "expert" }]);
    expect(lineupKey([{ kind: "bass", difficulty: "expert" }])).not.toBe(guitar);
    expect(lineupKey([{ kind: "guitar", difficulty: "hard" }])).not.toBe(guitar);
    expect(
      lineupKey([{ kind: "words", difficulty: "normal", wordsMode: "sing" }]),
    ).not.toBe(
      lineupKey([{ kind: "words", difficulty: "normal", wordsMode: "type" }]),
    );
  });

  test("a guitar's non-default role is part of the band", () => {
    // Lead is what a roleless guitar has always meant, so it keeps the old key:
    // a board saved before roles existed still matches the same band.
    expect(lineupKey([{ kind: "guitar", difficulty: "expert", role: "lead" }])).toBe(
      "guitar:expert",
    );
    expect(lineupKey([{ kind: "guitar", difficulty: "expert" }])).toBe("guitar:expert");
    expect(lineupKey([{ kind: "guitar", difficulty: "expert", role: "rhythm" }])).toBe(
      "guitar:expert:rhythm",
    );
    // Two guitars are two seats: a lead and a rhythm.
    expect(
      lineupKey([
        { kind: "guitar", difficulty: "expert", role: "lead" },
        { kind: "guitar", difficulty: "expert", role: "rhythm" },
      ]),
    ).toBe("guitar:expert+guitar:expert:rhythm");
  });

  test("an empty band has an empty key", () => {
    expect(lineupKey([])).toBe("");
  });
});

describe("topFor", () => {
  test("is this song, best first", () => {
    const board = [run({ score: 30 }), run({ score: 60 }), run({ song: "other-song", score: 500 })];
    expect(topFor(board, "nine-lives").map((entry) => entry.score)).toEqual([60, 30]);
  });

  test("shows only the top few", () => {
    const board = Array.from({ length: 9 }, (_, index) => run({ score: index }));
    expect(topFor(board, "nine-lives")).toHaveLength(5);
    expect(topFor(board, "nine-lives", 2).map((entry) => entry.score)).toEqual([8, 7]);
  });

  test("a lineup narrows it to that band, and still shows only the top few", () => {
    const board = [
      run({ score: 30, lineup: "guitar:easy" }),
      run({ score: 60, lineup: "guitar:expert" }),
      run({ score: 50, lineup: "guitar:expert" }),
      run({ score: 500 }),
    ];
    expect(topFor(board, "nine-lives", "guitar:expert").map((entry) => entry.score)).toEqual([
      60, 50,
    ]);
    expect(
      topFor(board, "nine-lives", "guitar:expert", 1).map((entry) => entry.score),
    ).toEqual([60]);
    expect(topFor(board, "nine-lives").map((entry) => entry.score)).toEqual([
      500, 60, 50, 30,
    ]);
  });

  test("an entry saved without a lineup never matches a specific lineup", () => {
    const board = [run({ score: 500 }), run({ score: 60, lineup: "guitar:expert" })];
    expect(topFor(board, "nine-lives", "guitar:expert").map((entry) => entry.score)).toEqual([
      60,
    ]);
  });

  test("an unplayed song has nothing", () => {
    expect(topFor([run()], "brand-new")).toEqual([]);
  });
});

describe("recentFor", () => {
  test("is this song, newest first — not best first", () => {
    const board = [
      run({ score: 300, at: 1000 }),
      run({ score: 10, at: 3000 }),
      run({ score: 200, at: 2000 }),
      run({ song: "other-song", score: 900, at: 9000 }),
    ];
    expect(recentFor(board, "nine-lives").map((entry) => entry.at)).toEqual([
      3000, 2000, 1000,
    ]);
  });

  test("keeps only the last few, by date", () => {
    const board = Array.from({ length: 9 }, (_, index) =>
      run({ score: 90 - index, at: 1000 + index }),
    );
    expect(recentFor(board, "nine-lives", 3).map((entry) => entry.at)).toEqual([
      1008, 1007, 1006,
    ]);
  });

  test("an unplayed song has nothing", () => {
    expect(recentFor([run()], "brand-new")).toEqual([]);
  });
});

describe("bestFor", () => {
  test("is the highest score for the song, whatever the band was set to", () => {
    const board = [
      run({ score: 30 }),
      run({ score: 60 }),
      run({ score: 90, players: [{ label: "Player 1 · Bass", score: 90, difficulty: "hard" }] }),
    ];
    expect(bestFor(board, "nine-lives")).toBe(90);
  });

  test("with a lineup it compares only that band's runs", () => {
    const board = [
      run({ score: 30, lineup: "guitar:easy" }),
      run({ score: 60, lineup: "guitar:expert" }),
      run({ score: 90, lineup: "guitar:expert" }),
    ];
    expect(bestFor(board, "nine-lives", "guitar:expert")).toBe(90);
    expect(bestFor(board, "nine-lives", "guitar:easy")).toBe(30);
    expect(bestFor(board, "nine-lives")).toBe(90);
  });

  test("an entry saved without a lineup is its own group", () => {
    const board = [run({ score: 500 }), run({ score: 60, lineup: "guitar:expert" })];
    expect(bestFor(board, "nine-lives", "guitar:expert")).toBe(60);
    expect(bestFor(board, "nine-lives")).toBe(500);
    expect(bestFor([run({ score: 500 })], "nine-lives", "guitar:expert")).toBeNull();
  });

  test("a failed run is kept but never a best", () => {
    expect(bestFor([run({ score: 900, failed: true })], "nine-lives")).toBeNull();
    expect(bestFor([run({ score: 900, failed: true }), run({ score: 40 })], "nine-lives")).toBe(40);
  });

  test("a failed run never becomes a lineup's best either", () => {
    const board = [
      run({ score: 900, failed: true, lineup: "guitar:expert" }),
      run({ score: 40, lineup: "guitar:expert" }),
    ];
    expect(bestFor(board, "nine-lives", "guitar:expert")).toBe(40);
    expect(bestFor([board[0]], "nine-lives", "guitar:expert")).toBeNull();
  });

  test("no runs means no best", () => {
    expect(bestFor([], "nine-lives")).toBeNull();
  });
});

describe("shouldSaveRun", () => {
  const summary = { runs: 1, failed: false, judged: 40, score: 120 };

  test("a run with something judged and something scored is kept", () => {
    expect(shouldSaveRun(summary)).toBe(true);
    expect(shouldSaveRun({ ...summary, runs: 2, score: 400 })).toBe(true);
  });

  test("no runs — Listen — is nothing to keep", () => {
    expect(shouldSaveRun({ runs: 0, failed: false, judged: 0, score: 0 })).toBe(false);
  });

  test("a published run that judged nothing is not a score", () => {
    // A chart that never arrived, or a folder the browser would not open: the
    // panel is on stage and has zeroes to report, which is not a best.
    expect(shouldSaveRun({ ...summary, judged: 0, score: 0 })).toBe(false);
    // And a zero score is nothing to keep even if something was judged.
    expect(shouldSaveRun({ ...summary, score: 0 })).toBe(false);
  });

  test("a lost run is a verdict, not a score", () => {
    expect(shouldSaveRun({ ...summary, failed: true })).toBe(false);
    expect(shouldSaveRun({ runs: 3, failed: true, judged: 200, score: 50 })).toBe(false);
  });
});

/**
 * The two storage calls, against a store this test owns.
 *
 * `bun test` has no browser, so the module's `window.localStorage` is given one for
 * the length of a test — the same two calls the module makes, and nothing else. It
 * is removed afterwards so no other test inherits a board.
 */
function withStore(): Map<string, string> {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
      },
    },
  });
  return store;
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
});

describe("replaceBoard", () => {
  test("writes a whole board and reads it back", () => {
    withStore();
    const board = [run(), run({ score: 50 })];
    expect(replaceBoard(board)).toEqual(board);
    expect(loadBoard()).toEqual(board);
  });

  test("caps a board at what the board keeps", () => {
    withStore();
    const board = Array.from({ length: BOARD_LIMIT + 10 }, (_, index) =>
      run({ score: BOARD_LIMIT + 10 - index }),
    );
    expect(replaceBoard(board)).toHaveLength(BOARD_LIMIT);
    expect(loadBoard()).toHaveLength(BOARD_LIMIT);
  });

  test("drops what is not a run rather than writing it down", () => {
    withStore();
    const board = [run(), { song: "x" }, null] as unknown as SavedRun[];
    expect(replaceBoard(board)).toHaveLength(1);
    expect(loadBoard()).toHaveLength(1);
  });

  test("an empty board clears the history", () => {
    withStore();
    replaceBoard([run()]);
    expect(replaceBoard([])).toEqual([]);
    expect(loadBoard()).toEqual([]);
  });

  test("a blocked store is a change not remembered, not a throw", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      writable: true,
      value: {
        localStorage: {
          getItem: () => null,
          setItem: () => {
            throw new Error("blocked");
          },
        },
      },
    });
    expect(replaceBoard([run()])).toHaveLength(1);
    expect(loadBoard()).toEqual([]);
  });
});
