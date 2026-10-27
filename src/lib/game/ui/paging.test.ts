import { describe, expect, test } from "bun:test";
import { pageIndex } from "./paging";

describe("pageIndex", () => {
  test("wraps at both ends on an ordinary screen", () => {
    expect(pageIndex(2, 4, 1, true)).toBe(3);
    expect(pageIndex(3, 4, 1, true)).toBe(0);
    expect(pageIndex(1, 4, -1, true)).toBe(0);
    expect(pageIndex(0, 4, -1, true)).toBe(3);
  });

  test("stays put at an end when wrapping is off", () => {
    expect(pageIndex(2, 4, 1, false)).toBe(3);
    expect(pageIndex(3, 4, 1, false)).toBeNull();
    expect(pageIndex(0, 4, -1, false)).toBeNull();
  });

  test("nothing focused starts at the near end", () => {
    expect(pageIndex(-1, 4, 1, true)).toBe(0);
    expect(pageIndex(-1, 4, -1, true)).toBe(3);
    expect(pageIndex(-1, 4, 1, false)).toBe(0);
    expect(pageIndex(-1, 4, -1, false)).toBe(3);
  });

  test("an empty screen has nowhere to go", () => {
    expect(pageIndex(0, 0, 1, true)).toBeNull();
    expect(pageIndex(0, 0, 1, false)).toBeNull();
  });
});
