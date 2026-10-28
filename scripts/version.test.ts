import { describe, expect, test } from "bun:test";
import { formatVersion, nextVersion } from "./version";

describe("formatVersion", () => {
  test("names the version and the short commit", () => {
    expect(formatVersion("1.0.0", "abc1234def5678")).toBe("v1.0.0+abc1234");
  });

  test("falls back to dev without a commit", () => {
    expect(formatVersion("2.3.1", null)).toBe("v2.3.1+dev");
    expect(formatVersion("2.3.1", "")).toBe("v2.3.1+dev");
  });
});

describe("nextVersion", () => {
  test("bumps each part from a clean version", () => {
    expect(nextVersion("1.0.0", "patch")).toBe("1.0.1");
    expect(nextVersion("1.0.0", "minor")).toBe("1.1.0");
    expect(nextVersion("1.0.0", "major")).toBe("2.0.0");
  });

  test("carries into the next part", () => {
    expect(nextVersion("1.9.9", "patch")).toBe("1.9.10");
    expect(nextVersion("1.9.9", "minor")).toBe("1.10.0");
    expect(nextVersion("1.9.9", "major")).toBe("2.0.0");
  });

  test("refuses a version that is not major.minor.patch", () => {
    expect(() => nextVersion("1.0", "patch")).toThrow(/major\.minor\.patch/);
  });

  test("refuses an unknown bump", () => {
    expect(() =>
      nextVersion("1.0.0", "huge" as "patch"),
    ).toThrow(/Unknown bump/);
  });
});
