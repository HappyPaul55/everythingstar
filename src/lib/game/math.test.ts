import { describe, expect, test } from "bun:test";
import { clamp, clamp01, minMax } from "./math";

describe("clamp", () => {
  test("holds a value between its ends", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-2, 0, 10)).toBe(0);
    expect(clamp(12, 0, 10)).toBe(10);
  });

  test("keeps a value already at an end", () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });
});

describe("clamp01", () => {
  test("holds a value to the unit interval", () => {
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
  });
});

describe("minMax", () => {
  test("finds both ends in one pass", () => {
    expect(minMax([3, -1, 9, 4])).toEqual({ min: -1, max: 9 });
  });

  test("a single value is both ends", () => {
    expect(minMax([7])).toEqual({ min: 7, max: 7 });
  });

  test("nothing is null rather than an infinity", () => {
    expect(minMax([])).toBeNull();
    expect(minMax([Number.NaN, Number.POSITIVE_INFINITY])).toBeNull();
  });

  test("ignores a value that is not a number", () => {
    expect(minMax([Number.NaN, 2, 5])).toEqual({ min: 2, max: 5 });
  });

  test("a list past the argument limit does not throw", () => {
    const many = Array.from({ length: 200_000 }, (_, index) => index);
    expect(minMax(many)).toEqual({ min: 0, max: 199_999 });
  });
});
