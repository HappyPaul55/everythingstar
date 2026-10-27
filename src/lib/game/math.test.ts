import { describe, expect, test } from "bun:test";
import { clamp, clamp01 } from "./math";

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
