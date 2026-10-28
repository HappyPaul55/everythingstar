import { describe, expect, test } from "bun:test";
import { readableDate } from "./date";

describe("readableDate", () => {
  test("a frontmatter day becomes a date a reader can check", () => {
    expect(readableDate("2026-10-28")).toBe("28 October 2026");
    expect(readableDate("2027-01-01")).toBe("1 January 2027");
  });

  test("a value that is not a day is printed as written", () => {
    expect(readableDate("tomorrow")).toBe("tomorrow");
    expect(readableDate("")).toBe("");
  });
});
