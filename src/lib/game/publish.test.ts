import { describe, expect, test } from "bun:test";
import { PUBLISH_MS, publishDue } from "./publish";

const base = {
  now: 1_000,
  published: 1_000,
  durationMs: 240_000,
  playing: true,
  dirty: true,
};

describe("publishDue", () => {
  test("publishes on the throttle, not on every frame", () => {
    expect(publishDue({ ...base, now: base.published + PUBLISH_MS - 1 })).toBe(false);
    expect(publishDue({ ...base, now: base.published + PUBLISH_MS })).toBe(true);
  });

  test("publishes the final frame when the playhead reaches a known length", () => {
    // Well inside the throttle, but the song is over: the stage is about to go.
    expect(
      publishDue({
        now: 240_000,
        published: 239_990,
        durationMs: 240_000,
        playing: true,
        dirty: true,
      }),
    ).toBe(true);
  });

  test("an unknown length is not the end of the song", () => {
    expect(
      publishDue({
        now: 30_000,
        published: 29_990,
        durationMs: 0,
        playing: true,
        dirty: true,
      }),
    ).toBe(false);
  });

  test("a pause publishes what was judged since the last tick", () => {
    expect(
      publishDue({ ...base, now: base.published + 10, playing: false }),
    ).toBe(true);
  });

  test("a pause with nothing new does not publish", () => {
    expect(
      publishDue({ ...base, now: base.published + 10, playing: false, dirty: false }),
    ).toBe(false);
  });

  test("a paused stage stays quiet", () => {
    // Once the dirty state has been published, every later paused frame is silent.
    const first = publishDue({ ...base, playing: false, dirty: true });
    expect(first).toBe(true);
    expect(
      publishDue({ ...base, now: base.now + 1_000, playing: false, dirty: false }),
    ).toBe(false);
    expect(
      publishDue({ ...base, now: base.now + 10_000, playing: false, dirty: false }),
    ).toBe(false);
  });
});
