import { describe, expect, test } from "bun:test";
import { AUDIBLE_FLOOR, CHANNEL_LEVEL } from "./audio/mix";
import {
  BACKDROP_DIM_MAX,
  BACKDROP_DIM_STEP,
  DEFAULT_SETTINGS,
  LAG_LIMIT_MS,
  LAG_STEP_MS,
  NOTE_SPEED_MAX,
  NOTE_SPEED_MIN,
  NOTE_SPEED_STEP,
  masterVolume,
  parseSettings,
  snapBackdropDim,
  snapLag,
  snapLevel,
  snapNoteSpeed,
  stepLag,
  formatLag,
} from "./settings";

describe("parseSettings", () => {
  test("nothing stored is the default", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("")).toEqual(DEFAULT_SETTINGS);
  });

  test("every missing field falls back to the default, not a second literal", () => {
    // `{}` reaches every fallback in the reader. A default changed in one place
    // must therefore still agree with the stored-value path.
    expect(parseSettings("{}")).toEqual(DEFAULT_SETTINGS);
  });

  test("nonsense is the default", () => {
    expect(parseSettings("{")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("null")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('"loud"')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("[]")).toEqual({
      audioLagMs: 0,
      visualLagMs: 0,
      volume: 1,
      levels: CHANNEL_LEVEL,
      guideVocal: false,
      video: true,
      view: "3d",
      noteStyle: "bars",
      noteSpeed: 1,
      backdropDim: 0,
      flares: true,
      crowd: true,
      tap: true,
    });
  });

  test("what is missing falls back, what is there is kept", () => {
    expect(parseSettings('{"volume":0.4}')).toEqual({
      audioLagMs: 0,
      visualLagMs: 0,
      volume: 0.4,
      levels: CHANNEL_LEVEL,
      guideVocal: false,
      video: true,
      view: "3d",
      noteStyle: "bars",
      noteSpeed: 1,
      backdropDim: 0,
      flares: true,
      crowd: true,
      tap: true,
    });
    expect(parseSettings('{"video":false}')).toEqual({
      audioLagMs: 0,
      visualLagMs: 0,
      volume: 1,
      levels: CHANNEL_LEVEL,
      guideVocal: false,
      video: false,
      view: "3d",
      noteStyle: "bars",
      noteSpeed: 1,
      backdropDim: 0,
      flares: true,
      crowd: true,
      tap: true,
    });
  });

  test("a value of the wrong type is not one", () => {
    // A stored string where a number belongs is a default, not a NaN on the fader.
    expect(parseSettings('{"audioLagMs":"25","volume":"half","video":1}')).toEqual(
      DEFAULT_SETTINGS,
    );
  });

  test("the family levels are held between silence and full", () => {
    const parsed = parseSettings(
      '{"levels":{"music":-3,"ambience":12,"sfx":0.25}}',
    );
    expect(parsed.levels).toEqual({ music: 0, ambience: 1, sfx: 0.25 });
  });

  test("a broken family is its default without taking the others", () => {
    expect(
      parseSettings('{"levels":{"music":"loud","ambience":0.2}}').levels,
    ).toEqual({ music: CHANNEL_LEVEL.music, ambience: 0.2, sfx: CHANNEL_LEVEL.sfx });
    expect(parseSettings('{"levels":null}').levels).toEqual(CHANNEL_LEVEL);
    expect(parseSettings('{"levels":[]}').levels).toEqual(CHANNEL_LEVEL);
    expect(parseSettings('{"levels":7}').levels).toEqual(CHANNEL_LEVEL);
  });

  test("the default levels are the mixer's own balance", () => {
    expect(DEFAULT_SETTINGS.levels).toEqual(CHANNEL_LEVEL);
    expect(parseSettings(null).levels).toEqual(CHANNEL_LEVEL);
  });

  test("a family level survives a round trip with the rest", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      levels: { music: 0.9, ambience: 0.15, sfx: 0.4 },
    };
    expect(parseSettings(JSON.stringify(settings))).toEqual(settings);
  });

  test("the default levels are a copy, not the constant itself", () => {
    const settings = parseSettings(null);
    settings.levels.music = 0.1;
    expect(parseSettings(null).levels.music).toBe(CHANNEL_LEVEL.music);
  });

  test("the view is one of the two there are, and nothing else", () => {
    expect(parseSettings('{"view":"3d"}').view).toBe("3d");
    expect(parseSettings('{"view":"flat"}').view).toBe("flat");
    // A view that never existed, or a view of the wrong type, is the default.
    expect(parseSettings('{"view":"isometric"}').view).toBe("3d");
    expect(parseSettings('{"view":2}').view).toBe("3d");
  });

  test("the note style is one of the three there are, and nothing else", () => {
    expect(parseSettings('{"noteStyle":"gems"}').noteStyle).toBe("gems");
    expect(parseSettings('{"noteStyle":"arrows"}').noteStyle).toBe("arrows");
    expect(parseSettings('{"noteStyle":"bars"}').noteStyle).toBe("bars");
    // A skin that never existed, or one of the wrong type, is the note we know.
    expect(parseSettings('{"noteStyle":"triangles"}').noteStyle).toBe("bars");
    expect(parseSettings('{"noteStyle":3}').noteStyle).toBe("bars");
    expect(parseSettings(null).noteStyle).toBe("bars");
  });

  test("tapping the pads is on unless it was turned off", () => {
    expect(parseSettings(null).tap).toBe(true);
    expect(parseSettings('{"tap":false}').tap).toBe(false);
    // A stored non-boolean is not a setting: the pads stay playable.
    expect(parseSettings('{"tap":"off"}').tap).toBe(true);
  });

  test("the lag is held to steps inside the limit", () => {
    expect(parseSettings('{"audioLagMs":27}').audioLagMs).toBe(25);
    expect(parseSettings('{"audioLagMs":9999}').audioLagMs).toBe(LAG_LIMIT_MS);
    expect(parseSettings('{"audioLagMs":-9999}').audioLagMs).toBe(-LAG_LIMIT_MS);
  });

  test("the picture lag is its own value, held to the same steps and limit", () => {
    expect(parseSettings(null).visualLagMs).toBe(0);
    expect(parseSettings('{"visualLagMs":27}').visualLagMs).toBe(25);
    expect(parseSettings('{"visualLagMs":9999}').visualLagMs).toBe(LAG_LIMIT_MS);
    expect(parseSettings('{"visualLagMs":-9999}').visualLagMs).toBe(-LAG_LIMIT_MS);
    // The two offsets are separate: measuring one does not move the other.
    expect(parseSettings('{"audioLagMs":35,"visualLagMs":-20}')).toMatchObject({
      audioLagMs: 35,
      visualLagMs: -20,
    });
    // A stored string is not a number, so the picture starts with the sound.
    expect(parseSettings('{"visualLagMs":"25"}').visualLagMs).toBe(0);
  });

  test("the volume is held between silence and full — and silence is not zero", () => {
    // A stored zero is a fader dragged to nothing, and a media element at nothing
    // leaves the browser's audio clock. It lands on the floor instead.
    expect(parseSettings('{"volume":-3}').volume).toBe(AUDIBLE_FLOOR);
    expect(parseSettings('{"volume":0}').volume).toBe(AUDIBLE_FLOOR);
    expect(parseSettings('{"volume":12}').volume).toBe(1);
    expect(masterVolume(0)).toBe(AUDIBLE_FLOOR);
    expect(masterVolume(0.4)).toBe(0.4);
    expect(masterVolume(Number.NaN)).toBe(AUDIBLE_FLOOR);
  });

  test("the comfort settings have their own defaults", () => {
    expect(parseSettings(null).noteSpeed).toBe(1);
    expect(parseSettings(null).backdropDim).toBe(0);
    expect(parseSettings(null).flares).toBe(true);
  });

  test("the note speed is held to tenths between half and double", () => {
    expect(parseSettings('{"noteSpeed":1.04}').noteSpeed).toBe(1);
    expect(parseSettings('{"noteSpeed":1.06}').noteSpeed).toBe(1.1);
    expect(parseSettings('{"noteSpeed":0.1}').noteSpeed).toBe(NOTE_SPEED_MIN);
    expect(parseSettings('{"noteSpeed":9}').noteSpeed).toBe(NOTE_SPEED_MAX);
  });

  test("the backdrop dim is held to twentieths between none and the limit", () => {
    expect(parseSettings('{"backdropDim":0.33}').backdropDim).toBe(0.35);
    expect(parseSettings('{"backdropDim":0.38}').backdropDim).toBe(0.4);
    expect(parseSettings('{"backdropDim":-1}').backdropDim).toBe(0);
    expect(parseSettings('{"backdropDim":4}').backdropDim).toBe(BACKDROP_DIM_MAX);
  });

  test("the guide vocal is off unless it was turned on", () => {
    expect(parseSettings(null).guideVocal).toBe(false);
    expect(parseSettings('{"guideVocal":true}').guideVocal).toBe(true);
    // A stored non-boolean is not a setting: karaoke stays the default.
    expect(parseSettings('{"guideVocal":"on"}').guideVocal).toBe(false);
  });

  test("a stored guide vocal survives a round trip with the rest", () => {
    const settings = { ...DEFAULT_SETTINGS, guideVocal: true, volume: 0.4 };
    expect(parseSettings(JSON.stringify(settings))).toEqual(settings);
  });

  test("the drifting lights are on unless they were turned off", () => {
    expect(parseSettings('{"flares":false}').flares).toBe(false);
    // A stored non-boolean is not a setting: the room keeps its lights.
    expect(parseSettings('{"flares":"off"}').flares).toBe(true);
  });

  test("the crowd is on unless it was turned off", () => {
    expect(DEFAULT_SETTINGS.crowd).toBe(true);
    expect(parseSettings(null).crowd).toBe(true);
    expect(parseSettings('{"crowd":false}').crowd).toBe(false);
    // A stored non-boolean is not a setting: the room keeps its crowd.
    expect(parseSettings('{"crowd":"off"}').crowd).toBe(true);
    expect(parseSettings('{"crowd":1}').crowd).toBe(true);
  });

  test("a stored crowd setting survives a round trip with the rest", () => {
    const settings = { ...DEFAULT_SETTINGS, crowd: false };
    expect(parseSettings(JSON.stringify(settings))).toEqual(settings);
  });

  test("an unreadable comfort value is its default", () => {
    expect(
      parseSettings('{"noteSpeed":"fast","backdropDim":null,"flares":0}'),
    ).toEqual(DEFAULT_SETTINGS);
  });

  test("the default is a copy, so one player's change is not the next one's", () => {
    const settings = parseSettings(null);
    settings.volume = 0.1;
    expect(parseSettings(null).volume).toBe(1);
  });
});

describe("snapNoteSpeed", () => {
  test("snaps to tenths", () => {
    expect(snapNoteSpeed(1.04)).toBe(1);
    expect(snapNoteSpeed(1.06)).toBe(1.1);
    expect(snapNoteSpeed(1.25)).toBe(1.3);
  });

  test("clamps both ways", () => {
    expect(snapNoteSpeed(0.1)).toBe(NOTE_SPEED_MIN);
    expect(snapNoteSpeed(9)).toBe(NOTE_SPEED_MAX);
  });

  test("a number that is not a number is the usual speed", () => {
    expect(snapNoteSpeed(Number.NaN)).toBe(1);
    expect(snapNoteSpeed(Number.POSITIVE_INFINITY)).toBe(1);
  });

  test("one step is a tenth, and a snapped value survives the next step", () => {
    expect(NOTE_SPEED_STEP).toBe(0.1);
    expect(snapNoteSpeed(snapNoteSpeed(1.06) + NOTE_SPEED_STEP)).toBe(1.2);
  });
});

describe("snapBackdropDim", () => {
  test("snaps to twentieths", () => {
    expect(snapBackdropDim(0.33)).toBe(0.35);
    expect(snapBackdropDim(0.38)).toBe(0.4);
    expect(snapBackdropDim(0.8)).toBe(BACKDROP_DIM_MAX);
  });

  test("clamps both ways", () => {
    expect(snapBackdropDim(-1)).toBe(0);
    expect(snapBackdropDim(4)).toBe(BACKDROP_DIM_MAX);
  });

  test("a number that is not a number is no dim at all", () => {
    expect(snapBackdropDim(Number.NaN)).toBe(0);
    expect(snapBackdropDim(Number.NEGATIVE_INFINITY)).toBe(0);
  });

  test("one step is a twentieth", () => {
    expect(BACKDROP_DIM_STEP).toBe(0.05);
    expect(snapBackdropDim(snapBackdropDim(0.33) + BACKDROP_DIM_STEP)).toBe(0.4);
  });
});

describe("snapLevel", () => {
  test("clamps a family level between silence and full", () => {
    expect(snapLevel(0.5, 0.7)).toBe(0.5);
    expect(snapLevel(-2, 0.7)).toBe(0);
    expect(snapLevel(8, 0.7)).toBe(1);
  });

  test("a value that is not a number is the fallback", () => {
    expect(snapLevel(Number.NaN, 0.7)).toBe(0.7);
    expect(snapLevel(Number.POSITIVE_INFINITY, 0.5)).toBe(0.5);
  });
});

describe("snapLag", () => {
  test("snaps to whole steps", () => {
    expect(snapLag(0)).toBe(0);
    expect(snapLag(2)).toBe(0);
    expect(snapLag(3)).toBe(5);
    expect(snapLag(23)).toBe(25);
    expect(snapLag(-23)).toBe(-25);
  });

  test("clamps both ways", () => {
    expect(snapLag(5000)).toBe(LAG_LIMIT_MS);
    expect(snapLag(-5000)).toBe(-LAG_LIMIT_MS);
  });

  test("a number that is not a number is no lag at all", () => {
    expect(snapLag(Number.NaN)).toBe(0);
    expect(snapLag(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("stepLag", () => {
  test("one press is one step", () => {
    expect(stepLag(0, 1)).toBe(LAG_STEP_MS);
    expect(stepLag(0, -1)).toBe(-LAG_STEP_MS);
    expect(stepLag(25, 1)).toBe(30);
    expect(stepLag(-25, -1)).toBe(-30);
  });

  test("a snapped value survives a press either way", () => {
    // Whatever the store held, a press takes it from a step, not from between two.
    expect(stepLag(27, 1)).toBe(30);
    expect(stepLag(27, -1)).toBe(20);
  });

  test("it stops at the limit rather than wrapping", () => {
    expect(stepLag(LAG_LIMIT_MS, 1)).toBe(LAG_LIMIT_MS);
    expect(stepLag(-LAG_LIMIT_MS, -1)).toBe(-LAG_LIMIT_MS);
  });
});

describe("formatLag", () => {
  test("a lag reads signed, in milliseconds", () => {
    expect(formatLag(0)).toBe("0 ms");
    expect(formatLag(35)).toBe("+35 ms");
    expect(formatLag(-20)).toBe("-20 ms");
    // The measured calibration and the stepper read the same way.
    expect(formatLag(stepLag(30, 1))).toBe("+35 ms");
  });
});
