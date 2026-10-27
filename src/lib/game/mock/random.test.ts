import { describe, expect, test } from "bun:test";
import { createRandom, randomInt } from "./random";

describe("createRandom", () => {
  test("repeats for the same seed", () => {
    const a = createRandom(42);
    const b = createRandom(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  test("differs for a different seed", () => {
    const a = createRandom(1);
    const b = createRandom(2);
    expect(a()).not.toBe(b());
  });

  test("stays within [0, 1)", () => {
    const random = createRandom(7);
    for (let i = 0; i < 500; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("randomInt", () => {
  test("stays within the range, inclusive", () => {
    const random = createRandom(9);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i += 1) {
      const value = randomInt(random, 3, 6);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(6);
      seen.add(value);
    }
    expect(seen.size).toBe(4);
  });
});
