import { describe, expect, test } from "bun:test";
import { bestClockOffset, clockOffset, ServerClock, serverNow } from "./clock";

describe("room clock", () => {
  test("NTP's offset is the midpoint of the two one-way paths", () => {
    expect(clockOffset(0, 1100, 1100, 1200)).toEqual({
      offsetMs: 500,
      rttMs: 1200,
      atMs: 1200,
    });
  });

  test("a delayed reply is a larger round trip", () => {
    const quiet = clockOffset(0, 10, 10, 20);
    const queued = clockOffset(0, 10, 10, 220);
    expect(quiet?.rttMs).toBe(20);
    expect(queued?.rttMs).toBe(220);
  });

  test("the least delayed samples decide the offset", () => {
    const samples = [
      { offsetMs: 1000, rttMs: 400, atMs: 1 },
      { offsetMs: 40, rttMs: 5, atMs: 2 },
      { offsetMs: 42, rttMs: 6, atMs: 3 },
      { offsetMs: 44, rttMs: 7, atMs: 4 },
    ];
    expect(bestClockOffset(samples)).toBe(41);
  });

  test("a clock turns a server moment into local time", () => {
    const clock = new ServerClock();
    clock.add({ offsetMs: 500, rttMs: 10, atMs: 0 });
    expect(serverNow(clock.offsetMs, 1000)).toBe(1500);
    expect(clock.until(2000, 1000)).toBe(500);
  });

  test("no samples is a zero offset, not a crash", () => {
    expect(bestClockOffset([])).toBe(0);
  });
});
