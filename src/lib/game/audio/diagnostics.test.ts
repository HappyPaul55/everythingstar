import { describe, expect, test } from "bun:test";
import {
  audioFacts,
  audioLine,
  autoplayPolicy,
  MEDIA_ERRORS,
  progressText,
  READY_STATES,
} from "./diagnostics";

describe("audioFacts", () => {
  test("reads what the element is playing and how far in", () => {
    const facts = audioFacts({
      currentSrc: "blob:http://localhost:4321/9c8b",
      readyState: 4,
      paused: false,
      muted: false,
      volume: 1,
      error: null,
      currentTime: 12.5,
      duration: 227.4,
      webkitAudioDecodedByteCount: 4096,
    });
    expect(facts).toMatchObject({
      scheme: "blob",
      readyState: 4,
      paused: false,
      muted: false,
      volume: 1,
      error: 0,
      timeMs: 12500,
      durationMs: 227400,
      decodedAudio: 4096,
    });
  });

  test("an element that has nothing to say is reported as paused and unknown", () => {
    // A 0-byte file, or a URL that never resolved: no `src`, no duration, no error yet.
    const facts = audioFacts({});
    expect(facts).toMatchObject({ scheme: "", paused: true, error: 0, durationMs: 0, decodedAudio: null });
  });
});

describe("audioLine", () => {
  test("the file and its progression lead, and trouble follows them", () => {
    const line = audioLine(
      audioFacts({ src: "blob:x", readyState: 0, paused: true, error: { code: 4 }, currentTime: 0 }),
    );
    expect(line).toBe("blob 0s · error unsupported · nothing · paused");
  });

  test("a stem says its own file name and where it is in the song", () => {
    // The dev panel's question when a part is missing or late: which file, and how
    // far through it is. `1m12s`, not `72.0s`.
    const line = audioLine(
      audioFacts({
        src: "https://host/audio/drums_1.ogg",
        readyState: 4,
        paused: false,
        currentTime: 72,
        duration: 190,
      }),
      "drums_1.ogg",
    );
    expect(line).toBe("drums_1.ogg 1m12s / 3m10s");
  });

  test("a silent stream is named, and a quiet fader is shown", () => {
    // The two causes that look identical from the outside: nothing decoded, and a
    // fader somebody dragged to zero.
    const line = audioLine(
      audioFacts({
        src: "blob:x",
        readyState: 4,
        paused: false,
        volume: 0,
        currentTime: 3,
        duration: 100,
        webkitAudioDecodedByteCount: 0,
      }),
    );
    expect(line).toContain("no audio decoded");
    expect(line).toContain("vol 0%");
  });

  test("a healthy element says its file and clock, and nothing else", () => {
    const line = audioLine(
      audioFacts({ src: "blob:x", readyState: 4, paused: false, currentTime: 1.2, duration: 100 }),
    );
    expect(line).toBe("blob 1s / 1m40s");
  });

  test("every code the browser can give has a name", () => {
    expect(Object.values(MEDIA_ERRORS)).toHaveLength(4);
    expect(READY_STATES[4]).toBe("enough");
  });
});

describe("progressText", () => {
  test("a position is spoken in minutes and seconds", () => {
    expect(progressText(0)).toBe("0s");
    expect(progressText(12_000)).toBe("12s");
    expect(progressText(72_000)).toBe("1m12s");
    expect(progressText(190_000)).toBe("3m10s");
    // Seconds under ten are padded, so a list of stems lines up.
    expect(progressText(65_000)).toBe("1m05s");
  });

  test("a broken value is the start of the file", () => {
    expect(progressText(Number.NaN)).toBe("0s");
    expect(progressText(-5_000)).toBe("0s");
    expect(progressText(Number.POSITIVE_INFINITY)).toBe("0s");
  });
});

describe("autoplayPolicy", () => {
  test("asks the browser, and says so when it will not answer", () => {
    expect(autoplayPolicy({ getAutoplayPolicy: () => "allowed" })).toBe("allowed");
    expect(autoplayPolicy({})).toBe("unknown");
    expect(autoplayPolicy(null)).toBe("unknown");
    expect(
      autoplayPolicy({
        getAutoplayPolicy: () => {
          throw new Error("no");
        },
      }),
    ).toBe("unknown");
  });
});
