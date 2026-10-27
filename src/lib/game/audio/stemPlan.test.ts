import { describe, expect, test } from "bun:test";
import { audioFromFiles } from "../sources/files";
import {
  FULL_PRESET,
  PARTS_PRESET,
  resolveStemPlan,
  type MixPreset,
  type StemRef,
} from "./stemPlan";

const stem = (id: string, url: string): StemRef => ({ id, url });
const preset = (id: string, stemIds: string[]): MixPreset => ({ id, stemIds });

describe("resolveStemPlan", () => {
  test("a full multitrack plays the preset's parts in their own order", () => {
    const plan = resolveStemPlan(
      [
        stem("stem_master", "song.ogg"),
        stem("stem_guitar", "guitar.ogg"),
        stem("stem_bass", "bass.ogg"),
        stem("stem_drums", "drums.ogg"),
      ],
      [preset(FULL_PRESET, ["stem_guitar", "stem_bass", "stem_drums"])],
      FULL_PRESET,
      ["song.ogg"],
    );
    expect(plan).toEqual({
      urls: ["guitar.ogg", "bass.ogg", "drums.ogg"],
      preset: FULL_PRESET,
      missingPreset: null,
      missingIds: [],
    });
  });

  test("a master-only song resolves the one file it has", () => {
    const plan = resolveStemPlan(
      [stem("stem_master", "song.ogg")],
      [preset(FULL_PRESET, ["stem_master"])],
      FULL_PRESET,
      [],
    );
    expect(plan.urls).toEqual(["song.ogg"]);
    expect(plan.preset).toBe(FULL_PRESET);
    expect(plan.missingIds).toEqual([]);
  });

  test("an id the song does not carry is named, and the rest still play", () => {
    const plan = resolveStemPlan(
      [stem("stem_guitar", "guitar.ogg"), stem("stem_bass", "bass.ogg")],
      [preset(FULL_PRESET, ["stem_guitar", "stem_missing", "stem_bass"])],
      FULL_PRESET,
      ["guitar.ogg", "bass.ogg"],
    );
    // One stale id in somebody else's document must not cost the whole mix.
    expect(plan.urls).toEqual(["guitar.ogg", "bass.ogg"]);
    expect(plan.preset).toBe(FULL_PRESET);
    expect(plan.missingIds).toEqual(["stem_missing"]);
  });

  test("an empty preset is no answer, so the fallback plays", () => {
    const plan = resolveStemPlan(
      [stem("stem_master", "song.ogg")],
      [preset(FULL_PRESET, [])],
      FULL_PRESET,
      ["song.ogg"],
    );
    expect(plan.urls).toEqual(["song.ogg"]);
    expect(plan.preset).toBeNull();
    // It *was* found: the gap is in what it names, not in the document's presets.
    expect(plan.missingPreset).toBeNull();
    expect(plan.missingIds).toEqual([]);
  });

  test("a preset that names nothing the song has falls back and says why", () => {
    const plan = resolveStemPlan(
      [stem("stem_guitar", "guitar.ogg")],
      [preset(FULL_PRESET, ["stem_missing"])],
      FULL_PRESET,
      ["guitar.ogg"],
    );
    expect(plan.urls).toEqual(["guitar.ogg"]);
    expect(plan.preset).toBeNull();
    expect(plan.missingPreset).toBeNull();
    expect(plan.missingIds).toEqual(["stem_missing"]);
  });

  test("the same file is played once however many ids point at it", () => {
    const plan = resolveStemPlan(
      [stem("a", "bass.ogg"), stem("b", "bass.ogg")],
      [preset(FULL_PRESET, ["a", "b"])],
      FULL_PRESET,
      [],
    );
    expect(plan.urls).toEqual(["bass.ogg"]);
  });

  test("the fallback is deduplicated too", () => {
    const plan = resolveStemPlan(
      [stem("a", "bass.ogg")],
      [],
      PARTS_PRESET,
      ["bass.ogg", "bass.ogg", "drums.ogg"],
    );
    expect(plan.urls).toEqual(["bass.ogg", "drums.ogg"]);
  });

  test("no preset at all falls back, and names the preset that was asked for", () => {
    const plan = resolveStemPlan(
      [stem("stem_guitar", "guitar.ogg")],
      [],
      PARTS_PRESET,
      ["guitar.ogg"],
    );
    expect(plan.urls).toEqual(["guitar.ogg"]);
    expect(plan.preset).toBeNull();
    expect(plan.missingPreset).toBe(PARTS_PRESET);
    expect(plan.missingIds).toEqual([]);
  });

  test("no preset asked for is a plain fallback, not a missing one", () => {
    const plan = resolveStemPlan(
      [stem("stem_master", "song.ogg")],
      [preset(FULL_PRESET, ["stem_master"])],
      null,
      ["song.ogg"],
    );
    expect(plan.urls).toEqual(["song.ogg"]);
    expect(plan.missingPreset).toBeNull();
  });

  test("never mutates the document it resolves", () => {
    const stems = Object.freeze([
      Object.freeze(stem("stem_guitar", "guitar.ogg")),
      Object.freeze(stem("stem_bass", "bass.ogg")),
    ]);
    const presets = Object.freeze([
      Object.freeze({ id: FULL_PRESET, stemIds: Object.freeze(["stem_guitar", "stem_bass"]) }),
    ]);
    const fallback = Object.freeze(["guitar.ogg"]);

    const plan = resolveStemPlan(stems, presets, FULL_PRESET, fallback);
    expect(plan.urls).toEqual(["guitar.ogg", "bass.ogg"]);
    expect(plan.urls).not.toBe(fallback);
    expect(stems[0].url).toBe("guitar.ogg");
    expect(presets[0].stemIds).toEqual(["stem_guitar", "stem_bass"]);
  });
});

/**
 * The importer writes the presets and the runtime resolves them, so each case below
 * asks the *importer's* output for a mix and checks the files a run would fetch. If
 * `mixPresetsFor` ever changes which ids make the whole song — or starts naming a
 * master that is meant to be a bed — this test says so in one place.
 */
describe("mixPresetsFor resolves back through the stage's rule", () => {
  const resolveFull = (files: Parameters<typeof audioFromFiles>[0]) => {
    const audio = audioFromFiles(files);
    return resolveStemPlan(
      audio.stems,
      audio.mixPresets,
      FULL_PRESET,
      audio.stems.map((stem) => stem.url),
    );
  };

  test("a multitrack's `full` is its parts, and its `song.ogg` is not the song", () => {
    const plan = resolveFull({
      master: "song.ogg",
      lead_guitar: "guitar.ogg",
      bass: "bass.ogg",
      drums: "drums_1.ogg",
      vocals: "vocals.ogg",
    });
    expect(plan.preset).toBe(FULL_PRESET);
    expect(plan.missingIds).toEqual([]);
    expect(plan.urls).toEqual(["guitar.ogg", "bass.ogg", "drums_1.ogg", "vocals.ogg"]);
  });

  test("one or two parts are played with the master that holds the rest", () => {
    const plan = resolveFull({
      master: "song.ogg",
      lead_guitar: "guitar.ogg",
      rhythm_guitar: "rhythm.ogg",
    });
    expect(plan.preset).toBe(FULL_PRESET);
    expect(plan.urls).toEqual(["song.ogg", "guitar.ogg", "rhythm.ogg"]);
  });

  test("a master-only chart folder's `full` is that file, and its parts preset has nothing", () => {
    const audio = audioFromFiles({ master: "song.ogg" });
    expect(
      resolveStemPlan(
        audio.stems,
        audio.mixPresets,
        FULL_PRESET,
        audio.stems.map((stem) => stem.url),
      ).urls,
    ).toEqual(["song.ogg"]);
    // No instrument files, so the parts preset is absent and the parts fallback is
    // empty: a one-master song has no channel to take out.
    expect(
      resolveStemPlan(audio.stems, audio.mixPresets, PARTS_PRESET, []).urls,
    ).toEqual([]);
  });

  test("the parts preset is the instruments, never the master", () => {
    const audio = audioFromFiles({
      master: "song.ogg",
      lead_guitar: "guitar.ogg",
      bass: "bass.ogg",
    });
    const plan = resolveStemPlan(audio.stems, audio.mixPresets, PARTS_PRESET, []);
    expect(plan.preset).toBe(PARTS_PRESET);
    expect(plan.urls).toEqual(["guitar.ogg", "bass.ogg"]);
  });
});
