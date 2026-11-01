import { describe, expect, test } from "bun:test";
import { SOURCE_STALL_MS, sourceStalled } from "./stall";

describe("sourceStalled", () => {
  test("the first silent frame starts the window and does not give up", () => {
    expect(sourceStalled(null, 1000)).toEqual({ since: 1000, stalled: false });
  });

  test("a source that is still silent before the limit is still waited for", () => {
    expect(sourceStalled(1000, 1000 + SOURCE_STALL_MS - 1)).toEqual({
      since: 1000,
      stalled: false,
    });
  });

  test("the limit itself is enough", () => {
    expect(sourceStalled(1000, 1000 + SOURCE_STALL_MS)).toEqual({
      since: 1000,
      stalled: true,
    });
  });

  test("the window is the first silence, not the last look", () => {
    expect(sourceStalled(1000, 9000).since).toBe(1000);
  });

  test("a zero limit gives up at once, for a caller that means it", () => {
    expect(sourceStalled(null, 5, 0)).toEqual({ since: 5, stalled: true });
  });
});
