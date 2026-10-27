import { describe, expect, test } from "bun:test";
import {
  COUNT_UP_STEPS,
  countUpSteps,
  countUpValue,
} from "./countUp";

describe("countUpSteps", () => {
  test("counts one step per point up to the cap", () => {
    expect(countUpSteps(0)).toBe(0);
    expect(countUpSteps(5)).toBe(5);
    expect(countUpSteps(COUNT_UP_STEPS + 100)).toBe(COUNT_UP_STEPS);
  });

  test("a fraction of a point is still one step", () => {
    expect(countUpSteps(0.5)).toBe(1);
  });
});

describe("countUpValue", () => {
  test("walks the total in equal parts and lands exactly on it", () => {
    expect(countUpValue(1000, 0, 20)).toBe(0);
    expect(countUpValue(1000, 10, 20)).toBe(500);
    expect(countUpValue(1000, 20, 20)).toBe(1000);
    expect(countUpValue(1000, 99, 20)).toBe(1000);
  });

  test("a total smaller than the step count still counts up", () => {
    expect(countUpValue(5, 0, 5)).toBe(0);
    expect(countUpValue(5, 1, 5)).toBe(1);
    expect(countUpValue(5, 5, 5)).toBe(5);
  });

  test("nothing is a count-up, and nothing below zero is a step", () => {
    expect(countUpValue(0, 10, 20)).toBe(0);
    expect(countUpValue(1000, -4, 20)).toBe(0);
    expect(countUpValue(1000, 4, 0)).toBe(0);
  });
});
