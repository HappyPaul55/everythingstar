import { describe, expect, test } from "bun:test";
import { shortDate } from "./when";

describe("shortDate", () => {
  test("is a day and a month, in one named locale", () => {
    expect(shortDate(Date.UTC(2026, 9, 15, 12))).toBe("15 Oct");
  });
});
