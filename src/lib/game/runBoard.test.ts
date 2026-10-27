import { describe, expect, test } from "bun:test";
import { createRunBoard } from "./runBoard";

interface Entry {
  key: string;
  score: number;
}

describe("createRunBoard", () => {
  test("report keeps the latest entry per key in first-seen order", () => {
    const board = createRunBoard<Entry>();
    board.report({ key: "a", score: 1 });
    board.report({ key: "b", score: 2 });
    board.report({ key: "a", score: 3 });

    expect(board.entries()).toEqual([
      { key: "a", score: 3 },
      { key: "b", score: 2 },
    ]);
  });

  test("flush writes every registered run before entries is read", () => {
    const board = createRunBoard<Entry>();
    let lane = 10;
    let words = 20;
    board.register(() => board.report({ key: "lane", score: lane }));
    board.register(() => board.report({ key: "words", score: words }));

    // The board only has what was explicitly reported so far.
    expect(board.entries()).toEqual([]);

    // The runs judge on, in their refs, and the screen is about to change.
    lane = 11;
    words = 21;
    board.flush();

    expect(board.entries()).toEqual([
      { key: "lane", score: 11 },
      { key: "words", score: 21 },
    ]);
  });

  test("a flush after a reset reports the reset state, not the last attempt", () => {
    const board = createRunBoard<Entry>();
    let state: Entry = { key: "run", score: 99 };
    board.register(() => board.report(state));
    board.flush();
    expect(board.entries()).toEqual([{ key: "run", score: 99 }]);

    // A seek starts the run over: the callback reads the fresh ref, so a flush
    // must not write the previous attempt back over it.
    state = { key: "run", score: 0 };
    board.flush();
    expect(board.entries()).toEqual([{ key: "run", score: 0 }]);
  });

  test("only a flush bumps the version and notifies; a report stays quiet", () => {
    const board = createRunBoard<Entry>();
    let notifications = 0;
    const stop = board.subscribe(() => {
      notifications += 1;
    });

    const before = board.version();
    board.report({ key: "a", score: 1 });
    expect(board.version()).toBe(before);
    expect(notifications).toBe(0);

    board.flush();
    expect(board.version()).toBe(before + 1);
    expect(notifications).toBe(1);

    stop();
    board.flush();
    expect(board.version()).toBe(before + 2);
    expect(notifications).toBe(1);
  });

  test("unregistering a run stops it reporting on the next flush", () => {
    const board = createRunBoard<Entry>();
    let score = 1;
    const stop = board.register(() => board.report({ key: "a", score }));
    stop();

    score = 2;
    board.flush();
    expect(board.entries()).toEqual([]);
  });

  test("clear forgets the entries but keeps the mounted runs registered", () => {
    const board = createRunBoard<Entry>();
    let score = 4;
    board.register(() => board.report({ key: "a", score }));
    board.flush();
    expect(board.entries()).toHaveLength(1);

    board.clear();
    expect(board.entries()).toEqual([]);

    score = 5;
    board.flush();
    expect(board.entries()).toEqual([{ key: "a", score: 5 }]);
  });
});
