import { describe, expect, test } from "bun:test";
import { hashString, hashUnit } from "./hash";

describe("hashString", () => {
  test("is stable for a value, and spread out across values", () => {
    expect(hashString("note-1")).toBe(hashString("note-1"));
    expect(hashString("note-1")).not.toBe(hashString("note-2"));
  });

  test("is a 32-bit unsigned integer", () => {
    const hash = hashString("nine-lives");
    expect(Number.isInteger(hash)).toBe(true);
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThanOrEqual(0xffffffff);
  });

  test("lands hashUnit in [0, 1)", () => {
    expect(hashUnit("note-1")).toBeGreaterThanOrEqual(0);
    expect(hashUnit("note-1")).toBeLessThan(1);
  });
});
