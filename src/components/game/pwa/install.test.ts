import { describe, expect, test } from "bun:test";
import { installStatus } from "./install";

const BASE = {
  standalone: false,
  native: false,
  ios: false,
  promptAvailable: false,
};

describe("installStatus", () => {
  test("a prompt in hand is the installable case", () => {
    expect(installStatus({ ...BASE, promptAvailable: true })).toBe("available");
  });

  test("already standalone is installed, even with no prompt", () => {
    expect(installStatus({ ...BASE, standalone: true })).toBe("installed");
  });

  test("the native shell has nothing to install", () => {
    expect(installStatus({ ...BASE, native: true, promptAvailable: true })).toBe(
      "native",
    );
  });

  test("iOS gets instructions rather than a prompt", () => {
    expect(installStatus({ ...BASE, ios: true })).toBe("ios");
  });

  test("another browser with no prompt is the menu's problem", () => {
    expect(installStatus(BASE)).toBe("unsupported");
  });

  test("native wins over every other fact", () => {
    expect(
      installStatus({ standalone: true, native: true, ios: true, promptAvailable: true }),
    ).toBe("native");
  });
});
