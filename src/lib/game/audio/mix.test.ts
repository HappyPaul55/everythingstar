import { describe, expect, test } from "bun:test";
import { SCREENS, onStage } from "../screens";
import {
  AUDIBLE_FLOOR,
  CHANNEL_LEVEL,
  HELD_SHARE,
  bedFor,
  channelOf,
  crowdFor,
  ducksMusic,
  familyVolume,
  soundGain,
} from "./mix";

describe("channelOf", () => {
  test("the bed is music, the crowd is ambience, everything else is a sound effect", () => {
    expect(channelOf("background")).toBe("music");
    expect(channelOf("crowd")).toBe("ambience");
    expect(channelOf("click")).toBe("sfx");
    expect(channelOf("miss")).toBe("sfx");
    expect(channelOf("win")).toBe("sfx");
  });

  test("a type nobody has planned still mixes: it is a sound effect", () => {
    expect(channelOf("something_new")).toBe("sfx");
  });
});

describe("CHANNEL_LEVEL", () => {
  test("the beds are half, the cues are louder but not the master", () => {
    expect(CHANNEL_LEVEL.music).toBe(0.5);
    expect(CHANNEL_LEVEL.ambience).toBe(0.5);
    expect(CHANNEL_LEVEL.sfx).toBe(0.7);
  });

  test("a cue is always above a bed: the feedback is the point, the room is not", () => {
    expect(CHANNEL_LEVEL.sfx).toBeGreaterThan(CHANNEL_LEVEL.music);
    expect(CHANNEL_LEVEL.sfx).toBeGreaterThan(CHANNEL_LEVEL.ambience);
    // And nothing sits at the master: there has to be somewhere left to shout.
    for (const level of Object.values(CHANNEL_LEVEL)) expect(level).toBeLessThan(1);
  });
});

describe("soundGain", () => {
  test("a trim in dB, as a multiplier the graph understands", () => {
    expect(soundGain(0)).toBe(1);
    expect(soundGain(-6)).toBeCloseTo(0.5, 1);
    expect(soundGain(6)).toBeCloseTo(2, 1);
    expect(soundGain(-60)).toBeLessThan(0.01);
  });
});

describe("ducksMusic", () => {
  test("a sting dips the music under it", () => {
    for (const type of [
      "select",
      "back",
      "refuse",
      "open",
      "screen",
      "win",
      "fail",
      "best",
    ]) {
      expect(ducksMusic(type)).toBe(true);
    }
  });

  test("the band's entrance is not a sting over the song", () => {
    // A six-second dip under the guitar's amp and chord would quiet the first bars.
    for (const type of [
      "hype_guitar",
      "hype_bass",
      "hype_drums",
      "hype_vocals",
    ]) {
      expect(ducksMusic(type)).toBe(false);
    }
  });

  test("nothing a run makes turns the song down", () => {
    // The stage has no bed, and its stems are outside the graph; a cue during a run
    // is heard *beside* the band. So no in-run type may be a ducking one — the rule
    // the player reported as the streak sound pumping the music.
    for (const type of [
      "miss",
      "error",
      "sparkle",
      "meter_activate",
      "type_key",
      "type_word",
      "type_miss",
      "hype_guitar",
      "hype_bass",
      "hype_drums",
      "hype_vocals",
    ]) {
      expect(ducksMusic(type)).toBe(false);
    }
  });

  test("rapid and ambient feedback does not pump the music", () => {
    for (const type of [
      "click",
      "move",
      "tick",
      "crowd",
      "background",
      "something_new",
    ]) {
      expect(ducksMusic(type)).toBe(false);
    }
  });
});

describe("familyVolume", () => {
  test("the master and the family multiply", () => {
    expect(familyVolume(1, 1)).toBe(1);
    expect(familyVolume(0.5, 0.7)).toBeCloseTo(0.35);
  });

  test("both are held to the unit interval", () => {
    expect(familyVolume(2, 0.5)).toBe(0.5);
    expect(familyVolume(0.5, 4)).toBe(0.5);
  });

  test("nothing is ever zero: a silent element leaves the audio clock", () => {
    // A fader at nothing is a mute by intent, and a media element at 0 stops being
    // driven by the browser's audio clock — so what it is given is the floor.
    expect(familyVolume(0, 0.7)).toBe(AUDIBLE_FLOOR);
    expect(familyVolume(0, 0)).toBe(AUDIBLE_FLOOR);
    expect(familyVolume(-1, 0.5)).toBe(AUDIBLE_FLOOR);
  });
});

describe("AUDIBLE_FLOOR", () => {
  test("inaudible, but not silence", () => {
    expect(AUDIBLE_FLOOR).toBeGreaterThan(0);
    expect(AUDIBLE_FLOOR).toBeLessThanOrEqual(0.001);
  });
});

describe("HELD_SHARE", () => {
  test("a missing part is ducked, never silenced", () => {
    expect(HELD_SHARE).toBeGreaterThan(0);
    expect(HELD_SHARE).toBeLessThan(1);
    // Even at the floor, a ducked stem is above zero: it stays on the clock.
    expect(AUDIBLE_FLOOR * HELD_SHARE).toBeGreaterThan(0);
  });

  test("a ducked part is quieter than the room it sits in", () => {
    expect(HELD_SHARE).toBeLessThan(CHANNEL_LEVEL.music);
  });
});

describe("crowdFor", () => {
  test("the pause is the only screen with a crowd", () => {
    expect(crowdFor("paused", true)).toBe("crowd");
    for (const screen of SCREENS) {
      if (screen === "paused") continue;
      expect(crowdFor(screen, true)).toBeNull();
    }
  });

  test("the setting can leave the pause in silence", () => {
    expect(crowdFor("paused", false)).toBeNull();
  });
});

describe("bedFor", () => {
  test("the pages want the background bank, except the preview booth", () => {
    for (const screen of ["welcome", "band", "loading", "results"] as const) {
      expect(bedFor(screen)).toBe("background");
    }
    expect(bedFor("songs")).toBeNull();
  });

  test("the stage wants none: the song is what plays there", () => {
    for (const screen of ["countdown", "playing", "paused"] as const) {
      expect(bedFor(screen)).toBeNull();
    }
  });

  test("the two rules cover every screen the game has", () => {
    for (const screen of SCREENS) {
      const silent = screen === "songs" || onStage(screen);
      expect(bedFor(screen)).toBe(silent ? null : "background");
    }
  });
});
