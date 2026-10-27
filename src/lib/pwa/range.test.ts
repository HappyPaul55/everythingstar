import { describe, expect, test } from "bun:test";
import { contentRange, parseRange, rangeLength } from "./range";

describe("parseRange", () => {
  test("no header is no range", () => {
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange("", 100)).toBeNull();
  });

  test("a closed range is kept and clamped to the file", () => {
    expect(parseRange("bytes=0-9", 100)).toEqual({ start: 0, end: 9 });
    expect(parseRange("bytes=90-999", 100)).toEqual({ start: 90, end: 99 });
  });

  test("an open end runs to the last byte", () => {
    expect(parseRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 });
  });

  test("a suffix range is the last N bytes", () => {
    expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=-500", 100)).toEqual({ start: 0, end: 99 });
  });

  test("an empty, inverted or past-the-end range is a 416", () => {
    expect(parseRange("bytes=-", 100)).toBe("unsatisfiable");
    expect(parseRange("bytes=-0", 100)).toBe("unsatisfiable");
    expect(parseRange("bytes=10-9", 100)).toBe("unsatisfiable");
    expect(parseRange("bytes=100-", 100)).toBe("unsatisfiable");
  });

  test("multiple ranges are not a single range", () => {
    expect(parseRange("bytes=0-1,4-5", 100)).toBeNull();
    expect(contentRange(null, 100)).toBe("bytes */100");
  });

  test("a suffix range on an empty file is unsatisfiable", () => {
    expect(parseRange("bytes=-1", 0)).toBe("unsatisfiable");
  });
});

describe("rangeLength", () => {
  test("counts an inclusive range", () => {
    expect(rangeLength({ start: 0, end: 0 })).toBe(1);
    expect(rangeLength({ start: 10, end: 19 })).toBe(10);
  });
});
