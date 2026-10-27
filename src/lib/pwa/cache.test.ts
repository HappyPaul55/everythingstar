import { describe, expect, test } from "bun:test";
import { shellCacheName, SHELL_CACHE_PREFIX } from "./cache";

describe("shellCacheName", () => {
  test("keeps a version readable and drops separators a cache name cannot carry", () => {
    expect(shellCacheName("v1.2.3-4-gabc", "2026-10-24T19:54:09.000Z")).toBe(
      `${SHELL_CACHE_PREFIX}20261024T195409000Z-v1.2.3-4-gabc`,
    );
    expect(shellCacheName("feature/thing", "now")).toBe(
      `${SHELL_CACHE_PREFIX}now-feature-thing`,
    );
  });

  test("an empty version still names a cache", () => {
    expect(shellCacheName("", "")).toBe(`${SHELL_CACHE_PREFIX}0-dev`);
  });

  test("a later build sorts after an earlier one", () => {
    const older = shellCacheName("v1", "2026-10-24T19:00:00.000Z");
    const newer = shellCacheName("v1", "2026-10-24T20:00:00.000Z");
    expect([newer, older].sort()).toEqual([older, newer]);
  });
});
