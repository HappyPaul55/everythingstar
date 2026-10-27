import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPicker,
  otherThan,
  readSounds,
  soundsOfType,
  soundsToWarm,
  typesOf,
  type Sound,
} from "./sounds";

/**
 * The manifest that ships, checked against the sounds that ship with it.
 *
 * The file it reads is the real one (`public/audio/sounds.json`), so a typo in a
 * path, a missing kind or a file that was never dropped in is a failing test rather
 * than a silence nobody notices.
 */
const MANIFEST = new URL("../../../../public/audio/sounds.json", import.meta.url);
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as unknown;
const read = readSounds(manifest, "https://star.test/audio/sounds.json");

describe("the shipped sound manifest", () => {
  test("reads with nothing wrong in it", () => {
    expect(read.problems).toEqual([]);
  });

  test("every type has a file, and every file has an entry", () => {
    expect(read.sounds.length).toBe(34);
    expect(read.missing).toEqual([]);
    expect(new Set(read.sounds.map((sound) => sound.type)).size).toBe(24);
  });

  test("points at files that are actually there", () => {
    for (const sound of read.sounds) {
      const path = fileURLToPath(
        new URL(sound.url.replace("https://star.test/", "../../../../public/"), import.meta.url),
      );
      expect(existsSync(path)).toBe(true);
    }
  });

  test("every named file is inside public/audio and is not empty", () => {
    // A rename that leaves the manifest pointing at a file nobody ships is a 404 the
    // game hears as silence, so the entry is checked the way the browser will read it:
    // resolved from the manifest's own directory, not from wherever the test is.
    const audioDir = resolve(
      fileURLToPath(new URL("../../../../public/audio/", import.meta.url)),
    );
    const entries = (manifest as { sounds: { id: string; file?: string }[] }).sounds;
    const named = entries.filter((entry) => entry.file);
    expect(named.length).toBeGreaterThan(0);
    for (const entry of named) {
      const path = resolve(audioDir, entry.file as string);
      expect(path.startsWith(audioDir + sep)).toBe(true);
      if (!existsSync(path)) {
        throw new Error(`${entry.id}: ${entry.file} is missing from public/audio`);
      }
      expect(statSync(path).size).toBeGreaterThan(0);
    }
  });

  test("knows what is a track, what is a loop, and what is a one-shot", () => {
    for (const sound of read.sounds) {
      const expected =
        sound.type === "background" ? "track" : sound.type === "crowd" ? "loop" : "oneshot";
      expect(sound.kind).toBe(expected as "track" | "loop" | "oneshot");
    }
  });

  test("gives the types that repeat more than one file", () => {
    // One file where a sound repeats is a machine, so the banks are the point.
    expect(soundsOfType(read.sounds, "background").length).toBe(4);
    expect(soundsOfType(read.sounds, "click").length).toBe(3);
    expect(soundsOfType(read.sounds, "select").length).toBe(2);
    expect(soundsOfType(read.sounds, "type_key").length).toBe(3);
  });

  test("has one recorded entrance per part", () => {
    for (const type of [
      "hype_guitar",
      "hype_bass",
      "hype_drums",
      "hype_vocals",
    ]) {
      expect(soundsOfType(read.sounds, type)).toHaveLength(1);
    }
  });

  test("has no types left waiting on a file", () => {
    // The room, the stings, the band's four entrances and star power's one moment
    // all arrived; the manifest is the whole contract, not a shopping list with holes.
    for (const arrived of [
      "crowd_1",
      "hype_guitar_1",
      "hype_bass_1",
      "hype_drums_1",
      "hype_vocals_1",
      "win_1",
      "fail_1",
      "best_1",
      "miss_1",
      "type_miss_1",
      "meter_activate_1",
    ]) {
      expect(read.sounds.some((sound) => sound.id === arrived)).toBe(true);
    }
    // The merge held: nothing asks for a hit sound, a per-instrument miss, or a second
    // cue for a failure the miss already says.
    for (const gone of ["hit_guitar", "miss_guitar", "miss_drums", "sustain_break", "combo_break"]) {
      expect(read.sounds.some((sound) => sound.id.startsWith(gone))).toBe(false);
    }
  });

  test("says who to credit, for everything that came from somewhere", () => {
    // A sound without a `credit` is provenance we have not written down. Everything
    // we ship is the Kenney pack (CC0), the Pixabay error cue, the public-domain
    // crowd from pdsounds, or one of the author's own Suno beds; a new source is a
    // deliberate addition to this list, not something that slips through — and the
    // beds are included, not skipped.
    for (const sound of read.sounds) {
      expect(sound.credit).not.toBeNull();
      expect(sound.credit).toMatch(
        /CC0|Pixabay Content License|public domain|^HappyPaul55, made with Suno$/,
      );
    }
  });
});

/** A manifest written by hand, for the rules rather than the contents. */
function body(sounds: unknown[]): Record<string, unknown> {
  return { schemaVersion: 1, sounds };
}

const sound = (id: string, type = "click", file = `${id}.ogg`): unknown => ({
  id,
  type,
  kind: "oneshot",
  file,
});

describe("readSounds", () => {
  test("resolves a file against the manifest that listed it", () => {
    const one = readSounds(body([sound("click_1")]), "https://star.test/audio/sounds.json");
    expect(one.sounds[0].url).toBe("https://star.test/audio/click_1.ogg");
    expect(one.sounds[0].type).toBe("click");
    expect(one.sounds[0].gainDb).toBe(0);
    expect(one.sounds[0].credit).toBeNull();
  });

  test("an entry with no file is a sound we have not been given, not a fault", () => {
    const one = readSounds(
      body([{ id: "sparkle_1", type: "sparkle", kind: "oneshot" }]),
      "https://x/audio/sounds.json",
    );
    expect(one.problems).toEqual([]);
    expect(one.sounds).toEqual([]);
    expect(one.missing).toEqual(["sparkle_1"]);
  });

  test("a sound with no type could never be played, so it is named and skipped", () => {
    const one = readSounds(
      body([{ id: "a", kind: "oneshot", file: "a.ogg" }]),
      "https://x/audio/sounds.json",
    );
    expect(one.sounds).toEqual([]);
    expect(one.problems[0]).toContain("could ever play");
  });

  test("keeps a trim, a credit and loop points", () => {
    const one = readSounds(
      body([
        {
          id: "background_1",
          type: "background",
          kind: "loop",
          file: "background_1.ogg",
          gainDb: -8,
          credit: "Kenney, CC0",
          loopStart: 1.5,
          loopEnd: 61.5,
        },
      ]),
      "https://x/audio/sounds.json",
    );
    expect(one.sounds[0]).toMatchObject({
      gainDb: -8,
      credit: "Kenney, CC0",
      loopStart: 1.5,
      loopEnd: 61.5,
    });
  });

  test("a trim cannot be absurd, and a negative moment is not a moment", () => {
    const one = readSounds(
      body([
        { id: "a", type: "background", kind: "loop", file: "a.ogg", gainDb: 400, loopStart: -3 },
      ]),
      "https://x/audio/sounds.json",
    );
    expect(one.sounds[0].gainDb).toBe(24);
    expect(one.sounds[0].loopStart).toBeNull();
  });

  test("a sound with no id, or no kind, is named and skipped", () => {
    const one = readSounds(
      body([
        { type: "click", kind: "oneshot", file: "a.ogg" },
        { id: "b", type: "click", file: "b.ogg" },
        { id: "c", type: "click", kind: "shout", file: "c.ogg" },
      ]),
      "https://x/audio/sounds.json",
    );
    expect(one.sounds).toEqual([]);
    expect(one.problems).toHaveLength(3);
    expect(one.problems[1]).toContain("b");
    expect(one.problems[2]).toContain("shout");
  });

  test("a file that is not a URL is named, and the sound is not played", () => {
    const one = readSounds(
      body([{ id: "a", type: "click", kind: "oneshot", file: "://oops" }]),
      "not a url either",
    );
    expect(one.sounds).toEqual([]);
    expect(one.problems[0]).toContain("a");
  });

  test("a duplicate id is one sound: the first one stands", () => {
    const one = readSounds(
      body([sound("a", "click", "one.ogg"), sound("a", "click", "two.ogg")]),
      "https://x/audio/sounds.json",
    );
    expect(one.sounds).toHaveLength(1);
    expect(one.sounds[0].url).toBe("https://x/audio/one.ogg");
    expect(one.problems[0]).toContain("twice");
  });

  test("two files may share a type: that is a bank, not a duplicate", () => {
    const one = readSounds(
      body([sound("click_1"), sound("click_2")]),
      "https://x/audio/sounds.json",
    );
    expect(one.problems).toEqual([]);
    expect(soundsOfType(one.sounds, "click")).toHaveLength(2);
  });

  test("a bank whose files disagree on what they are is named", () => {
    // Half a bank advancing and half of it looping is nobody's intention.
    const one = readSounds(
      body([
        { id: "a", type: "background", kind: "track", file: "a.ogg" },
        { id: "b", type: "background", kind: "loop", file: "b.ogg" },
      ]),
      "https://x/audio/sounds.json",
    );
    expect(one.sounds).toHaveLength(1);
    expect(one.problems[0]).toContain("is track");
  });

  test("a document that is not a manifest comes back empty", () => {
    expect(readSounds(null, "https://x/audio/sounds.json").sounds).toEqual([]);
    expect(readSounds({ sounds: [] }, "https://x/audio/sounds.json").problems[0]).toContain(
      "schemaVersion",
    );
    expect(
      readSounds({ schemaVersion: 2, sounds: [] }, "https://x/audio/sounds.json").sounds,
    ).toEqual([]);
  });
});

describe("looking a type up", () => {
  const sounds = readSounds(
    body([sound("click_1"), sound("click_2"), sound("background_1", "background", "b.ogg")]),
    "https://x/audio/sounds.json",
  ).sounds;

  test("every file behind a type, in the order it was written", () => {
    expect(soundsOfType(sounds, "click").map((entry) => entry.id)).toEqual([
      "click_1",
      "click_2",
    ]);
    expect(soundsOfType(sounds, "hit_guitar")).toEqual([]);
  });

  test("the types there are, sorted, for a read-out", () => {
    expect(typesOf(sounds)).toEqual(["background", "click"]);
  });
});

/**
 * Warming is a *policy*, not "load everything": a cue must be in hand at its first
 * press, a bed must not be a dozen megabytes of the bank before anybody has heard
 * the opening one.
 */
describe("what is warmed before the first press", () => {
  const bank = readSounds(
    body([
      { id: "background_1", type: "background", kind: "track", file: "1.ogg" },
      { id: "background_2", type: "background", kind: "track", file: "2.ogg" },
      { id: "crowd_1", type: "crowd", kind: "loop", file: "c.ogg" },
      { id: "click_1", type: "click", kind: "oneshot", file: "a.ogg" },
      { id: "move_1", type: "move", kind: "oneshot", file: "b.ogg" },
      { id: "miss_1", type: "miss", kind: "oneshot" },
    ]),
    "https://x/audio/sounds.json",
  ).sounds;

  test("every cue that has a file, so its first use never waits", () => {
    const ids = soundsToWarm(bank).map((sound) => sound.id);
    expect(ids).toContain("click_1");
    expect(ids).toContain("move_1");
    // A listed sound with no file is not in the bank at all; nothing to warm.
    expect(ids).not.toContain("miss_1");
  });

  test("the bed it will open on, and no other track", () => {
    const ids = soundsToWarm(bank).map((sound) => sound.id);
    expect(ids).toContain("background_1");
    expect(ids).not.toContain("background_2");
  });

  test("loops are warm too: a texture has no successor to arrive after", () => {
    expect(soundsToWarm(bank).map((sound) => sound.id)).toContain("crowd_1");
  });

  test("nothing twice", () => {
    const ids = soundsToWarm(bank).map((sound) => sound.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("the opening bed is the one the picker will actually play", () => {
    const picker = createPicker(bank, () => 0.5);
    const opening = picker.next("background");
    expect(opening).not.toBeNull();
    expect(soundsToWarm(bank).map((sound) => sound.id)).toContain(opening!.id);
  });
});

/**
 * A bank of **tracks** is a playlist with a fixed opening: it starts on the manifest's
 * first file — always the same one, so arriving in the game always sounds the same —
 * and then wanders at random, never repeating the one before.
 */
describe("a bank of tracks", () => {
  const tracks = readSounds(
    body([
      { id: "background_1", type: "background", kind: "track", file: "1.ogg" },
      { id: "background_2", type: "background", kind: "track", file: "2.ogg" },
      { id: "background_3", type: "background", kind: "track", file: "3.ogg" },
      { id: "background_4", type: "background", kind: "track", file: "4.ogg" },
    ]),
    "https://x/audio/sounds.json",
  ).sounds;

  test("always opens on the bank's first file, whatever the dice say", () => {
    for (const value of [0, 0.4, 0.99]) {
      const picker = createPicker(tracks, () => value);
      expect(picker.next("background")?.id).toBe("background_1");
    }
  });

  test("then picks at random: the dice decide the second one, not the order", () => {
    const twoPicks = (value: number) => {
      const picker = createPicker(tracks, () => value);
      return [picker.next("background")?.id, picker.next("background")?.id];
    };
    // 0 of the three others is the second file; 0.9 is the fourth.
    expect(twoPicks(0)).toEqual(["background_1", "background_2"]);
    expect(twoPicks(0.9)).toEqual(["background_1", "background_4"]);
  });

  test("never plays the same track twice running", () => {
    let step = 0;
    const picker = createPicker(tracks, () => {
      step += 0.37;
      return step % 1;
    });
    let previous = "";
    for (let i = 0; i < 200; i += 1) {
      const picked = picker.next("background")?.id ?? "";
      expect(picked).not.toBe(previous);
      previous = picked;
    }
  });

  test("reaches every file in the bank, given enough picks", () => {
    let step = 0;
    const picker = createPicker(tracks, () => {
      step += 0.13;
      return step % 1;
    });
    const heard = new Set<string>();
    for (let i = 0; i < 200; i += 1) heard.add(picker.next("background")?.id ?? "");
    expect(heard.size).toBe(4);
  });

  test("one track is a playlist of one, and it just plays", () => {
    const single = tracks.slice(0, 1);
    const picker = createPicker(single, () => 0.9);
    expect(picker.next("background")?.id).toBe("background_1");
    expect(picker.next("background")?.id).toBe("background_1");
  });

  test("the two strategies do not disturb each other", () => {
    const mixed = readSounds(
      body([
        { id: "background_1", type: "background", kind: "track", file: "1.ogg" },
        { id: "background_2", type: "background", kind: "track", file: "2.ogg" },
        { id: "click_1", type: "click", kind: "oneshot", file: "a.ogg" },
        { id: "click_2", type: "click", kind: "oneshot", file: "b.ogg" },
      ]),
      "https://x/audio/sounds.json",
    ).sounds;
    const picker = createPicker(mixed, () => 0);
    expect(picker.next("background")?.id).toBe("background_1");
    expect(picker.next("click")).not.toBeNull();
    expect(picker.next("background")?.id).toBe("background_2");
  });
});

describe("otherThan", () => {
  test("is never the index it was given, and always within the bank", () => {
    for (let size = 2; size <= 6; size += 1) {
      for (let current = 0; current < size; current += 1) {
        for (const value of [0, 0.5, 0.999]) {
          const picked = otherThan(current, size, () => value);
          expect(picked).not.toBe(current);
          expect(picked).toBeGreaterThanOrEqual(0);
          expect(picked).toBeLessThan(size);
        }
      }
    }
  });

  test("can reach every other index", () => {
    const reachable = new Set<number>();
    for (let i = 0; i < 400; i += 1) reachable.add(otherThan(1, 4, () => i / 400));
    expect([...reachable].sort()).toEqual([0, 2, 3]);
  });

  test("a bank of one has nowhere else to go", () => {
    expect(otherThan(0, 1, () => 0.5)).toBe(0);
  });
});

/**
 * The picker is the reason a type exists, so its rules are the point: never the same
 * one twice running, and every one of them used before any comes round again.
 */
describe("the picker", () => {
  /** A random that is a list of numbers: the order is pinned, so a test can say it. */
  const pinned = (values: number[]) => {
    let at = 0;
    return () => values[at++ % values.length];
  };

  const bank = readSounds(
    body([
      sound("click_1"),
      sound("click_2"),
      sound("click_3"),
      sound("click_4"),
    ]),
    "https://x/audio/sounds.json",
  ).sounds;

  test("nothing at all for a type there is no sound for", () => {
    const picker = createPicker(bank);
    expect(picker.next("hit_guitar")).toBeNull();
    expect(picker.next("click")).not.toBeNull();
  });

  test("an empty bank is silence, not a crash", () => {
    // A bank with no files is the same answer as a type with no files: nothing can
    // play it. The bag is never handed an empty deal by `createPicker`, and this is
    // what says so out loud.
    const picker = createPicker([]);
    expect(picker.next("click")).toBeNull();
    expect(picker.next("click")).toBeNull();
  });

  test("the one it has, over and over, when there is only one", () => {
    const one = readSounds(body([sound("miss_1", "miss")]), "https://x/audio/sounds.json").sounds;
    const picker = createPicker(one);
    expect(picker.next("miss")?.id).toBe("miss_1");
    expect(picker.next("miss")?.id).toBe("miss_1");
  });

  test("uses every file in a bank before any of them comes round again", () => {
    const picker = createPicker(bank, pinned([0.9, 0.1, 0.7, 0.3]));
    const first = new Set<string>();
    for (let i = 0; i < 4; i += 1) first.add(picker.next("click")?.id ?? "");
    expect(first.size).toBe(4);
    expect(first.has("")).toBe(false);
  });

  test("never plays the same one twice running, across redeals too", () => {
    // A thousand picks with an awkward bank: the repeat is the failure, not the order.
    for (const size of [2, 3, 4]) {
      const small = readSounds(
        body(Array.from({ length: size }, (_, i) => sound(`click_${i + 1}`))),
        "https://x/audio/sounds.json",
      ).sounds;
      // A random that walks the whole range, so the shuffles differ every deal.
      let step = 0;
      const picker = createPicker(small, () => {
        step += 0.37;
        return step % 1;
      });
      let previous = "";
      for (let i = 0; i < 200; i += 1) {
        const picked = picker.next("click") as Sound;
        expect(picked.id).not.toBe(previous);
        previous = picked.id;
      }
    }
  });

  test("keeps a bank per type, so one type cannot disturb another", () => {
    const both = readSounds(
      body([sound("click_1"), sound("click_2"), sound("miss_1", "miss"), sound("miss_2", "miss")]),
      "https://x/audio/sounds.json",
    ).sounds;
    const picker = createPicker(both);
    const clicks = new Set<string>();
    const misses = new Set<string>();
    for (let i = 0; i < 2; i += 1) {
      clicks.add(picker.next("click")?.id ?? "");
      misses.add(picker.next("miss")?.id ?? "");
    }
    expect(clicks.size).toBe(2);
    expect(misses.size).toBe(2);
  });
});
