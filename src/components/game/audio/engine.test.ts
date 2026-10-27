/**
 * The mixer's resource rules, held to with fakes rather than a browser.
 *
 * A jukebox is a list you click through, so the preview is the one path in the
 * engine that is asked for hundreds of times in a session. These tests pin what it
 * may create (one element, one node), the order the element is configured in
 * (`crossOrigin` before `src`), and that the graph can be let go of.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Sound } from "../../../lib/game/audio/sounds";
import { createEngine } from "./engine";

class FakeParam {
  value = 0;
  /** Every scheduled move, in order, so the envelope can be inspected. */
  events: { kind: "set" | "ramp"; value: number; at: number }[] = [];
  cancelScheduledValues() {}
  setValueAtTime(value: number, at = 0) {
    this.value = value;
    this.events.push({ kind: "set", value, at });
  }
  linearRampToValueAtTime(value: number, at = 0) {
    this.value = value;
    this.events.push({ kind: "ramp", value, at });
  }
}

class FakeGain {
  gain = new FakeParam();
  inputs: unknown[] = [];
  disconnected = false;
  connect(node: unknown) {
    this.inputs.push(node);
    return node;
  }
  disconnect() {
    this.disconnected = true;
  }
}

class FakeSource {
  outputs: unknown[] = [];
  disconnected = false;
  connect(node: unknown) {
    this.outputs.push(node);
    return node;
  }
  disconnect() {
    this.disconnected = true;
  }
}

class FakeBufferSource extends FakeSource {
  buffer: unknown = null;
  playbackRate = new FakeParam();
  started = false;
  /** The context time it was asked to start at, so a group can be compared. */
  startedAt: number | null = null;
  start(when = 0) {
    this.started = true;
    this.startedAt = when;
  }
}

class FakePanner {
  pan = new FakeParam();
  outputs: unknown[] = [];
  connect(node: unknown) {
    this.outputs.push(node);
    return node;
  }
}

class FakeContext {
  static made: FakeContext[] = [];
  /** What every decoded buffer claims to last, in seconds. */
  static duration = 0.2;
  destination = { name: "destination" };
  currentTime = 0;
  state: AudioContextState = "running";
  /** The engine's own state-change handler, called when the browser moves. */
  onstatechange: (() => void) | null = null;
  resumes = 0;
  gains: FakeGain[] = [];
  sources: FakeSource[] = [];
  buffers: FakeBufferSource[] = [];
  panners: FakePanner[] = [];
  closed = 0;

  constructor() {
    FakeContext.made.push(this);
  }
  createGain() {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }
  createStereoPanner() {
    const panner = new FakePanner();
    this.panners.push(panner);
    return panner;
  }
  createMediaElementSource() {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
  createBufferSource() {
    const source = new FakeBufferSource();
    this.buffers.push(source);
    return source;
  }
  async decodeAudioData() {
    return { duration: FakeContext.duration } as AudioBuffer;
  }
  async resume() {
    this.resumes += 1;
    this.state = "running";
  }
  async close() {
    this.closed += 1;
    this.state = "closed";
  }
}

class FakeAudio {
  static made: FakeAudio[] = [];
  /** How many of the next `play()` calls the browser refuses. */
  static refusePlay = 0;
  /** The order the element was configured in, which is what the CORS rule is about. */
  order: string[] = [];
  srcValue = "";
  cross = "";
  preload = "";
  loop = false;
  loopStart: number | undefined;
  loopEnd: number | undefined;
  readyState = 0;
  currentTime = 0;
  paused = true;
  ended = false;
  error: { code: number } | null = null;
  plays = 0;
  loads = 0;
  private listeners = new Map<string, Set<() => void>>();

  constructor() {
    FakeAudio.made.push(this);
  }
  get src() {
    return this.srcValue;
  }
  set src(value: string) {
    this.order.push("src");
    this.srcValue = value;
    // The engine waits for metadata; a fake that is ready at once takes the same path.
    this.readyState = 1;
  }
  get crossOrigin() {
    return this.cross;
  }
  set crossOrigin(value: string) {
    this.order.push("crossOrigin");
    this.cross = value;
  }
  pause() {
    this.paused = true;
  }
  play() {
    this.plays += 1;
    if (FakeAudio.refusePlay > 0) {
      FakeAudio.refusePlay -= 1;
      return Promise.reject(new Error("refused"));
    }
    this.paused = false;
    return Promise.resolve();
  }
  load() {
    this.loads += 1;
  }
  removeAttribute(name: string) {
    if (name === "src") {
      this.srcValue = "";
      this.readyState = 0;
    }
  }
  addEventListener(type: string, listener: () => void) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }
  removeEventListener(type: string, listener: () => void) {
    this.listeners.get(type)?.delete(listener);
  }
  dispatch(type: string) {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

const globals = globalThis as unknown as Record<string, unknown>;
const saved: Record<string, unknown> = {};

beforeEach(() => {
  FakeAudio.made = [];
  FakeAudio.refusePlay = 0;
  FakeContext.made = [];
  FakeContext.duration = 0.2;
  for (const key of ["Audio", "AudioContext", "window", "fetch"]) saved[key] = globals[key];
  globals.Audio = FakeAudio;
  globals.AudioContext = FakeContext;
  globals.window = { setTimeout: (fn: () => void) => setTimeout(fn, 0) };
  globals.fetch = () =>
    Promise.resolve({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });
});

afterEach(() => {
  for (const key of Object.keys(saved)) {
    if (saved[key] === undefined) delete globals[key];
    else globals[key] = saved[key];
  }
});

function sound(over: Partial<Sound> & Pick<Sound, "id" | "type" | "url" | "kind">): Sound {
  return { gainDb: 0, credit: null, loopStart: null, loopEnd: null, ...over };
}

/** Let the decode-and-schedule path's microtasks and its `setTimeout` land. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("a jukebox preview", () => {
  test("two previews reuse one element and one graph source", async () => {
    const engine = createEngine();
    await engine.start();

    engine.preview({ url: "https://example.com/a.ogg", startMs: 1500 });
    engine.preview({ url: "https://example.com/b.ogg" });

    expect(FakeAudio.made).toHaveLength(1);
    expect(FakeContext.made[0].sources).toHaveLength(1);
    const element = FakeAudio.made[0];
    expect(element.src).toBe("https://example.com/b.ogg");
    // Each preview started, and the first one sought its own cue.
    expect(element.plays).toBe(2);
  });

  test("crossOrigin is set before src", async () => {
    const engine = createEngine();
    await engine.start();

    engine.preview({ url: "https://example.com/a.ogg" });

    const element = FakeAudio.made[0];
    expect(element.order.indexOf("crossOrigin")).toBeGreaterThanOrEqual(0);
    expect(element.order.indexOf("crossOrigin")).toBeLessThan(element.order.indexOf("src"));
  });

  test("a finished preview loops back to its start cue", async () => {
    const engine = createEngine();
    await engine.start();
    engine.preview({ url: "https://example.com/a.ogg", startMs: 1500 });
    const element = FakeAudio.made[0];

    element.currentTime = 30;
    element.ended = true;
    element.dispatch("ended");

    expect(element.currentTime).toBe(1.5);
    expect(element.plays).toBe(2);

    // A stale ended from a file the element has already moved on from does nothing.
    element.ended = false;
    element.dispatch("ended");
    expect(element.plays).toBe(2);
  });

  test("stopPreview clears the source and keeps the node for the next file", async () => {
    const engine = createEngine();
    await engine.start();
    engine.preview({ url: "https://example.com/a.ogg" });

    engine.preview(null);

    const element = FakeAudio.made[0];
    expect(element.src).toBe("");
    expect(element.paused).toBe(true);
    expect(element.plays).toBe(1);

    // The same element is still the one the next preview uses.
    engine.preview({ url: "https://example.com/b.ogg" });
    expect(FakeAudio.made).toHaveLength(1);
    expect(FakeContext.made[0].sources).toHaveLength(1);
  });
});

describe("the beds", () => {
  const background = sound({
    id: "background_1",
    type: "background",
    url: "https://example.com/background_1.ogg",
    kind: "track",
  });
  const crowd = sound({
    id: "crowd_1",
    type: "crowd",
    url: "https://example.com/crowd.ogg",
    kind: "loop",
    loopStart: 1.5,
    loopEnd: 61.5,
  });

  test("a crowd loop plays on the ambience channel, with its loop points", async () => {
    const engine = createEngine();
    await engine.start();
    engine.load([crowd]);

    await engine.ambience("crowd");

    const context = FakeContext.made[0];
    // build() makes the master, then music, ambience, sfx; the bed's trim is next.
    const music = context.gains[1];
    const ambience = context.gains[2];
    const trim = context.gains[4];
    expect(trim.inputs[0]).toBe(ambience);
    expect(trim.inputs).not.toContain(music);

    const element = FakeAudio.made[0];
    expect(element.loop).toBe(true);
    expect(element.loopStart).toBe(1.5);
    expect(element.loopEnd).toBe(61.5);
    expect(element.order.indexOf("crossOrigin")).toBeLessThan(element.order.indexOf("src"));
  });

  test("two beds play at once, each on its own channel", async () => {
    const engine = createEngine();
    await engine.start();
    engine.load([background, crowd]);

    await engine.bed("background");
    await engine.ambience("crowd");

    const context = FakeContext.made[0];
    const music = context.gains[1];
    const ambience = context.gains[2];
    // The two trims follow the channels: the master, the three channels, then each
    // bed as it arrives.
    expect(context.gains[4].inputs[0]).toBe(music);
    expect(context.gains[5].inputs[0]).toBe(ambience);
    expect(FakeAudio.made[0].paused).toBe(false);
    expect(FakeAudio.made[1].paused).toBe(false);
  });

  test("stopping one bed leaves the other playing", async () => {
    const engine = createEngine();
    await engine.start();
    engine.load([background, crowd]);
    await engine.bed("background");
    await engine.ambience("crowd");

    await engine.ambience(null);

    // The room went; the music did not.
    expect(FakeAudio.made[1].paused).toBe(true);
    expect(FakeAudio.made[0].paused).toBe(false);
  });

  test("a preview takes the music and leaves the room alone", async () => {
    const engine = createEngine();
    await engine.start();
    engine.load([background, crowd]);
    await engine.bed("background");
    await engine.ambience("crowd");

    // The preview element is the third the test has made.
    engine.preview({ url: "https://example.com/preview.ogg" });

    expect(FakeAudio.made[0].paused).toBe(true);
    expect(FakeAudio.made[1].paused).toBe(false);
    expect(FakeAudio.made[2].paused).toBe(false);
  });

  test("a bed fades the channel that owns it, not always the music", async () => {
    const engine = createEngine();
    engine.setLevels({ music: 0.2, ambience: 0.3, sfx: 0.4 });
    await engine.start();
    engine.load([background, crowd]);

    await engine.bed("background");
    await engine.ambience("crowd");

    const context = FakeContext.made[0];
    const music = context.gains[1];
    const ambience = context.gains[2];
    expect(music.gain.events[music.gain.events.length - 1]?.value).toBe(0.2);
    expect(ambience.gain.events[ambience.gain.events.length - 1]?.value).toBe(0.3);
  });

  test("a track bank still advances; a loop stays where it is", async () => {
    const second = sound({
      id: "background_2",
      type: "background",
      url: "https://example.com/background_2.ogg",
      kind: "track",
    });
    const engine = createEngine();
    await engine.start();
    engine.load([background, second, crowd]);
    await engine.bed("background");
    await engine.ambience("crowd");

    FakeAudio.made[0].ended = true;
    FakeAudio.made[0].dispatch("ended");
    await settle();

    // The bank moved on to its next file...
    expect(FakeAudio.made[2].plays).toBe(1);
    // ...while the crowd's loop was never advanced.
    expect(FakeAudio.made[1].plays).toBe(1);
  });

  test("a bed that cannot advance is cleared, so the next request deals again", async () => {
    const seen: (string | null)[] = [];
    const engine = createEngine((id) => seen.push(id));
    const second = sound({
      id: "background_2",
      type: "background",
      url: "https://example.com/background_2.ogg",
      kind: "track",
    });
    await engine.start();
    engine.load([background, second]);
    await engine.bed("background");
    expect(seen).toEqual(["background_1"]);

    // The next file refuses to start. The ended element used to stay in the slot,
    // so every later request for the bank matched it and did nothing.
    FakeAudio.refusePlay = 1;
    FakeAudio.made[0].ended = true;
    FakeAudio.made[0].dispatch("ended");
    await settle();
    expect(seen[seen.length - 1]).toBeNull();

    await engine.bed("background");
    expect(seen[seen.length - 1]).not.toBeNull();
    expect(FakeAudio.made.some((element) => !element.paused)).toBe(true);
  });

  test("a loop may start at the top of the file", async () => {
    const intro = sound({
      id: "crowd_2",
      type: "crowd",
      url: "https://example.com/crowd_2.ogg",
      kind: "loop",
      loopStart: 0,
      loopEnd: 30,
    });
    const engine = createEngine();
    await engine.start();
    engine.load([intro]);

    await engine.ambience("crowd");

    const element = FakeAudio.made[0];
    expect(element.loopStart).toBe(0);
    expect(element.loopEnd).toBe(30);
  });

  test("a loop whose end is not after its start falls back to the whole file", async () => {
    const inverted = sound({
      id: "crowd_3",
      type: "crowd",
      url: "https://example.com/crowd_3.ogg",
      kind: "loop",
      loopStart: 10,
      loopEnd: 5,
    });
    const engine = createEngine();
    await engine.start();
    engine.load([inverted]);

    await engine.ambience("crowd");

    const element = FakeAudio.made[0];
    expect(element.loopStart).toBeUndefined();
    expect(element.loopEnd).toBeUndefined();
  });

  test("warming a bed that is already playing does not restart it", async () => {
    const engine = createEngine();
    await engine.start();
    engine.load([background]);
    await engine.bed("background");
    const element = FakeAudio.made[0];
    expect(element.paused).toBe(false);

    await engine.prepare();

    // `src` already asked for the file; a `load()` here would start it over.
    expect(element.loads).toBe(0);
    expect(element.paused).toBe(false);
    expect(FakeAudio.made).toHaveLength(1);
  });

  test("re-reading the same bank keeps the track it is on", async () => {
    const second = sound({
      id: "background_2",
      type: "background",
      url: "https://example.com/background_2.ogg",
      kind: "track",
    });
    const third = sound({
      id: "background_3",
      type: "background",
      url: "https://example.com/background_3.ogg",
      kind: "track",
    });
    const random = Math.random;
    // A deterministic rotation: the opening piece, then the far one.
    Math.random = () => 0.9;
    try {
      const engine = createEngine();
      await engine.start();
      const bank = [background, second, third];
      engine.load(bank);
      await engine.bed("background");

      FakeAudio.made[0].ended = true;
      FakeAudio.made[0].dispatch("ended");
      await settle();
      const far = FakeAudio.made[1];
      expect(far.src).toContain("background_3");

      // The same manifest arrives again, as a screen change asks it to.
      engine.load(bank);

      far.ended = true;
      far.dispatch("ended");
      await settle();

      // The rotation carried on: a rebuilt picker would have dealt background_1.
      expect(FakeAudio.made[0].plays).toBe(1);
      expect(
        FakeAudio.made.some(
          (element) => element.src.includes("background_2") && element.plays === 1,
        ),
      ).toBe(true);
    } finally {
      Math.random = random;
    }
  });
});

describe("the family levels", () => {
  test("build seats the levels that were set before the gesture", async () => {
    const engine = createEngine();
    engine.setLevels({ music: 0.2, ambience: 0.3, sfx: 0.4 });
    await engine.start();

    const context = FakeContext.made[0];
    expect(context.gains[1].gain.value).toBe(0.2);
    expect(context.gains[2].gain.value).toBe(0.3);
    expect(context.gains[3].gain.value).toBe(0.4);
  });

  test("a later change reaches every channel", async () => {
    const engine = createEngine();
    await engine.start();
    engine.setLevels({ music: 0.1, ambience: 0.8, sfx: 0.6 });

    const context = FakeContext.made[0];
    expect(context.gains[1].gain.value).toBe(0.1);
    expect(context.gains[2].gain.value).toBe(0.8);
    expect(context.gains[3].gain.value).toBe(0.6);
  });

  test("a level set before the graph exists only remembers, and does not throw", () => {
    const engine = createEngine();
    expect(() =>
      engine.setLevels({ music: 0.4, ambience: 0.4, sfx: 0.4 }),
    ).not.toThrow();
    expect(FakeContext.made).toHaveLength(0);
  });
});

describe("ducking", () => {
  test("a sting dips music and ambience, and schedules their return", async () => {
    const engine = createEngine();
    engine.load([
      sound({
        id: "sting",
        type: "select",
        url: "https://example.com/select.ogg",
        kind: "oneshot",
      }),
    ]);
    await engine.start();
    engine.play("select");
    await settle();

    const context = FakeContext.made[0];
    const music = context.gains[1];
    const ambience = context.gains[2];
    const sfx = context.gains[3];

    for (const channel of [music, ambience]) {
      const events = channel.gain.events;
      // A dip below the family's own level, then a ramp back to it.
      expect(events.some((event) => event.kind === "ramp" && event.value < 0.5)).toBe(
        true,
      );
      expect(events[events.length - 1]?.kind).toBe("ramp");
      expect(events[events.length - 1]?.value).toBe(0.5);
    }
    // The cue's own channel is not ducked: only the bed and the room give way.
    expect(sfx.gain.events).toHaveLength(0);
    expect(context.buffers[0]?.started).toBe(true);
  });

  test("the hold follows the decoded cue's own length", async () => {
    FakeContext.duration = 2;
    const engine = createEngine();
    engine.load([
      sound({
        id: "sting",
        type: "select",
        url: "https://example.com/select.ogg",
        kind: "oneshot",
      }),
    ]);
    await engine.start();
    engine.play("select");
    await settle();

    const music = FakeContext.made[0].gains[1];
    const last = music.gain.events[music.gain.events.length - 1];
    // The floor is a quarter second; a two-second sting holds past two.
    expect(last?.at).toBeGreaterThan(2);
  });

  test("a click leaves the music alone", async () => {
    const engine = createEngine();
    engine.load([
      sound({
        id: "click",
        type: "click",
        url: "https://example.com/click.ogg",
        kind: "oneshot",
      }),
    ]);
    await engine.start();
    engine.play("click");
    await settle();

    const context = FakeContext.made[0];
    expect(context.gains[1].gain.events).toHaveLength(0);
    expect(context.gains[2].gain.events).toHaveLength(0);
  });

  test("a second sting restarts the hold rather than stacking it", async () => {
    const engine = createEngine();
    engine.load([
      sound({
        id: "sting",
        type: "select",
        url: "https://example.com/select.ogg",
        kind: "oneshot",
      }),
    ]);
    await engine.start();
    engine.play("select");
    engine.play("select");
    await settle();

    const music = FakeContext.made[0].gains[1];
    const dips = music.gain.events.filter(
      (event) => event.kind === "ramp" && event.value < 0.5,
    );
    expect(dips.length).toBeGreaterThanOrEqual(2);
    expect(music.gain.events[music.gain.events.length - 1]?.value).toBe(0.5);
  });

  test("a cue before the graph exists is silence, not a throw", () => {
    const engine = createEngine();
    expect(() => engine.play("select")).not.toThrow();
  });
});

describe("a cue that failed to arrive", () => {
  test("is fetched again on the next play, and then it sounds", async () => {
    const engine = createEngine();
    engine.load([
      sound({
        id: "click_1",
        type: "click",
        url: "https://example.com/click_1.ogg",
        kind: "oneshot",
      }),
    ]);
    await engine.start();

    let calls = 0;
    globals.fetch = () => {
      calls += 1;
      return Promise.resolve({
        ok: calls > 1,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });
    };

    engine.play("click");
    await settle();
    // The failure is not remembered as a decode: the first cue never sounded.
    expect(FakeContext.made[0].buffers).toHaveLength(0);

    engine.play("click");
    await settle();

    expect(calls).toBe(2);
    expect(FakeContext.made[0].buffers).toHaveLength(1);
  });
});

describe("a context that is suspended underneath the game", () => {
  test("drops cues, and asks to resume when the browser says it went away", async () => {
    const engine = createEngine();
    engine.load([
      sound({
        id: "click_1",
        type: "click",
        url: "https://example.com/click_1.ogg",
        kind: "oneshot",
      }),
    ]);
    await engine.start();
    const context = FakeContext.made[0];

    // An interruption: scheduling into this would pile every sting up for the resume.
    context.state = "suspended";
    engine.play("click");
    await settle();
    expect(context.buffers).toHaveLength(0);

    context.onstatechange?.();
    await settle();
    expect(context.resumes).toBe(1);
    expect(context.state as AudioContextState).toBe("running");

    engine.play("click");
    await settle();
    expect(context.buffers).toHaveLength(1);
  });
});

describe("a group of cues", () => {
  test("every file starts on the same clock", async () => {
    const engine = createEngine();
    engine.load([
      sound({
        id: "hype_guitar",
        type: "hype_guitar",
        url: "https://example.com/guitar.ogg",
        kind: "oneshot",
      }),
      sound({
        id: "hype_drums",
        type: "hype_drums",
        url: "https://example.com/drums.ogg",
        kind: "oneshot",
      }),
    ]);
    await engine.start();
    engine.playMany([{ type: "hype_guitar" }, { type: "hype_drums" }]);
    await settle();

    const buffers = FakeContext.made[0].buffers;
    expect(buffers).toHaveLength(2);
    expect(buffers.every((source) => source.started)).toBe(true);
    expect(buffers[0]?.startedAt).toBe(buffers[1]?.startedAt);
  });

  test("places a cue with a panner and leaves a centre cue alone", async () => {
    const engine = createEngine();
    engine.load([
      sound({
        id: "hype_guitar",
        type: "hype_guitar",
        url: "https://example.com/guitar.ogg",
        kind: "oneshot",
      }),
      sound({
        id: "hype_bass",
        type: "hype_bass",
        url: "https://example.com/bass.ogg",
        kind: "oneshot",
      }),
      sound({
        id: "hype_drums",
        type: "hype_drums",
        url: "https://example.com/drums.ogg",
        kind: "oneshot",
      }),
    ]);
    await engine.start();
    engine.playMany([
      { type: "hype_guitar", pan: -0.25 },
      { type: "hype_bass", pan: 0.25 },
      { type: "hype_drums", pan: 0 },
    ]);
    await settle();

    const context = FakeContext.made[0];
    expect(context.panners).toHaveLength(2);
    expect(context.panners[0]?.pan.value).toBe(-0.25);
    expect(context.panners[1]?.pan.value).toBe(0.25);
    // The centre cue goes source → trim → channel, with no panner in between.
    expect(context.buffers).toHaveLength(3);
  });

  test("a group ducks once, for its longest cue", async () => {
    FakeContext.duration = 2;
    const engine = createEngine();
    engine.load([
      sound({
        id: "select_1",
        type: "select",
        url: "https://example.com/select-1.ogg",
        kind: "oneshot",
      }),
      sound({
        id: "select_2",
        type: "select",
        url: "https://example.com/select-2.ogg",
        kind: "oneshot",
      }),
    ]);
    await engine.start();
    engine.playMany([{ type: "select" }, { type: "select" }]);
    await settle();

    const music = FakeContext.made[0].gains[1];
    const dips = music.gain.events.filter(
      (event) => event.kind === "ramp" && event.value < 0.5,
    );
    expect(dips).toHaveLength(1);
    const last = music.gain.events[music.gain.events.length - 1];
    expect(last?.at).toBeGreaterThan(2);
  });
});

describe("dispose", () => {
  test("closes the context once, lets the elements go, and is idempotent", async () => {
    const engine = createEngine();
    await engine.start();
    engine.preview({ url: "https://example.com/a.ogg" });
    const context = FakeContext.made[0];

    engine.dispose();
    engine.dispose();

    expect(context.closed).toBe(1);
    expect(context.sources[0].disconnected).toBe(true);
    expect(FakeAudio.made[0].paused).toBe(true);
    expect(FakeAudio.made[0].src).toBe("");
    // A disposed engine is inert, not broken.
    expect(() => engine.preview({ url: "https://example.com/b.ogg" })).not.toThrow();
    expect(FakeAudio.made).toHaveLength(1);
  });

  test("disposes both beds, not just the one that is playing music", async () => {
    const engine = createEngine();
    await engine.start();
    engine.load([
      sound({
        id: "background_1",
        type: "background",
        url: "https://example.com/background.ogg",
        kind: "track",
      }),
      sound({
        id: "crowd_1",
        type: "crowd",
        url: "https://example.com/crowd.ogg",
        kind: "loop",
      }),
    ]);
    await engine.bed("background");
    await engine.ambience("crowd");

    engine.dispose();

    for (const element of FakeAudio.made) {
      expect(element.paused).toBe(true);
      expect(element.src).toBe("");
    }
    // A disposed engine asks for nothing, in either channel.
    expect(() => engine.ambience("crowd")).not.toThrow();
    expect(FakeAudio.made).toHaveLength(2);
  });
});
