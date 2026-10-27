import { describe, expect, test } from "bun:test";
import { devToolsEnabled } from "./dev";

describe("devToolsEnabled", () => {
  test("is off unless it is asked for", () => {
    expect(devToolsEnabled("")).toBe(false);
    expect(devToolsEnabled("?cb=12")).toBe(false);
    expect(devToolsEnabled("?dev=")).toBe(false);
  });

  test("asking for it is how the stage gets its review surface", () => {
    expect(devToolsEnabled("?dev=1")).toBe(true);
    expect(devToolsEnabled("?dev=true")).toBe(true);
    expect(devToolsEnabled("?cb=12&dev=1")).toBe(true);
  });

  test("the old way of saying it is gone, not quietly honoured", () => {
    // `?dev=0` used to mean "hide them" when they were on by default. Now it means
    // nothing, and treating it as an alias would be a second way to say one thing.
    expect(devToolsEnabled("?dev=0")).toBe(false);
    expect(devToolsEnabled("?dev=false")).toBe(false);
  });
});
