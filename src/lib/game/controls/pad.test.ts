import { describe, expect, test } from "bun:test";
import {
  PAD_AXIS_PRESS,
  PAD_AXIS_RELEASE,
  droppedKeys,
  padAxisEdges,
  padAxisState,
  padEdges,
  retainConnected,
} from "./pad";

describe("padEdges", () => {
  test("nothing changes, nothing happens", () => {
    expect(padEdges([false, false, false], [false, false, false])).toEqual([]);
  });

  test("a press and a release are edges; a hold is not", () => {
    expect(padEdges([true, false], [false, false])).toEqual([{ button: 0, down: true }]);
    expect(padEdges([true, false], [true, false])).toEqual([]);
    expect(padEdges([false, false], [true, false])).toEqual([{ button: 0, down: false }]);
  });

  test("a pad that has only just appeared counts what is already held", () => {
    // A button held before the browser would talk to us is still a press.
    expect(padEdges([true, false, true], undefined)).toEqual([
      { button: 0, down: true },
      { button: 2, down: true },
    ]);
  });

  test("a shorter snapshot does not invent buttons", () => {
    expect(padEdges([true], [false, false, false])).toEqual([{ button: 0, down: true }]);
  });
});

describe("padAxisEdges", () => {
  test("the first look says nothing, even with the bar already moved", () => {
    // A bar at rest is not a press; a bar held over from before the stage looked
    // is a press nobody made. The hold is latched, so it still has to be released.
    expect(padAxisEdges([0], undefined)).toEqual([]);
    expect(padAxisEdges([0.7], undefined)).toEqual([]);
    expect(padAxisState([0.7], undefined)).toEqual([1]);
    expect(padAxisEdges([0.4], [1])).toEqual([]);
  });

  test("a resting axis is not a press", () => {
    expect(padAxisEdges([0.1], [0])).toEqual([]);
    expect(padAxisEdges([-0.2], [0])).toEqual([]);
  });

  test("half the travel is a press, either way", () => {
    expect(padAxisEdges([PAD_AXIS_PRESS], [0])).toEqual([
      { axis: 0, direction: 1, down: true },
    ]);
    expect(padAxisEdges([-PAD_AXIS_PRESS], [0])).toEqual([
      { axis: 0, direction: -1, down: true },
    ]);
  });

  test("hysteresis: a bar inside the release band is still held", () => {
    // Pressed at 0.7, drifting to 0.4: not a release, because 0.4 is above 0.35.
    expect(padAxisEdges([0.4], [1])).toEqual([]);
    expect(padAxisState([0.4], [1])).toEqual([1]);
    // Back inside the band is a release.
    expect(padAxisEdges([PAD_AXIS_RELEASE], [1])).toEqual([
      { axis: 0, direction: 1, down: false },
    ]);
    expect(padAxisState([PAD_AXIS_RELEASE], [1])).toEqual([0]);
    // The same on the other side.
    expect(padAxisEdges([-0.4], [-1])).toEqual([]);
    expect(padAxisEdges([-PAD_AXIS_RELEASE], [-1])).toEqual([
      { axis: 0, direction: -1, down: false },
    ]);
  });

  test("a swing from one side to the other is a release then a press", () => {
    expect(padAxisEdges([-0.6], [1])).toEqual([
      { axis: 0, direction: 1, down: false },
      { axis: 0, direction: -1, down: true },
    ]);
    expect(padAxisState([-0.6], [1])).toEqual([-1]);
  });

  test("each axis keeps its own direction", () => {
    expect(padAxisEdges([0, 0.7], [0, 0])).toEqual([
      { axis: 1, direction: 1, down: true },
    ]);
    expect(padAxisEdges([0, 0.7], [0, 1])).toEqual([]);
    expect(padAxisEdges([0, 0.4], [0, 1])).toEqual([]);
    expect(padAxisEdges([0, 0.3], [0, 1])).toEqual([
      { axis: 1, direction: 1, down: false },
    ]);
  });

  test("the thresholds can be moved", () => {
    expect(padAxisEdges([0.3], [0], { press: 0.25, release: 0.1 })).toEqual([
      { axis: 0, direction: 1, down: true },
    ]);
    expect(padAxisEdges([0.2], [1], { press: 0.25, release: 0.1 })).toEqual([]);
    expect(padAxisEdges([0.1], [1], { press: 0.25, release: 0.1 })).toEqual([
      { axis: 0, direction: 1, down: false },
    ]);
  });

  test("an axis that is no longer reported is released", () => {
    expect(padAxisEdges([], [1, 0])).toEqual([
      { axis: 0, direction: 1, down: false },
    ]);
  });
});

describe("retainConnected", () => {
  test("every pad still connected is left exactly as it was", () => {
    const map = new Map([
      [0, ["a"]],
      [1, ["b"]],
    ]);
    retainConnected(map, [0, 1]);
    expect([...map]).toEqual([
      [0, ["a"]],
      [1, ["b"]],
    ]);
  });

  test("a pad that went away is dropped and the rest are kept", () => {
    const map = new Map([
      [0, ["a"]],
      [1, ["b"]],
      [2, ["c"]],
    ]);
    retainConnected(map, [0, 2]);
    expect([...map.keys()]).toEqual([0, 2]);
    expect(map.get(2)).toEqual(["c"]);
  });

  test("no pads at all forgets everything", () => {
    const map = new Map([
      [0, ["a"]],
      [3, ["b"]],
    ]);
    retainConnected(map, []);
    expect(map.size).toBe(0);
  });

  test("an empty map stays empty", () => {
    const map = new Map<number, boolean[]>();
    retainConnected(map, [0, 1]);
    expect(map.size).toBe(0);
  });

  test("a pad that is still connected is not dropped", () => {
    const map = new Map([
      [0, [true, false]],
      [1, [false, true]],
    ]);
    expect(droppedKeys(map, [0, 1])).toEqual([]);
  });

  test("a pad that went away is named, and the rest are not", () => {
    const map = new Map([
      [0, [true]],
      [2, [false]],
    ]);
    expect(droppedKeys(map, [0])).toEqual([2]);
  });

  test("nothing connected drops everything, and an empty map drops nothing", () => {
    expect(droppedKeys(new Map([[0, [true]]]), [])).toEqual([0]);
    expect(droppedKeys(new Map(), [0, 1])).toEqual([]);
  });

  test("a pad reconnecting at the same index has no previous buttons", () => {
    // The pad that went away was holding A, so its last look still says A is down.
    const previous = new Map<number, boolean[]>([[0, [true, false]]]);
    retainConnected(previous, []);
    expect(previous.has(0)).toBe(false);

    // The returning pad's A is a fresh press. Diffed against the old pad's look
    // instead, it would be swallowed — which is the bug this exists to stop.
    expect(padEdges([true, false], previous.get(0))).toEqual([{ button: 0, down: true }]);
    expect(padEdges([true, false], [true, false])).toEqual([]);
  });
});
