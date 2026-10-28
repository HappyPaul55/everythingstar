import { describe, expect, test } from "bun:test";
import { firstBand } from "./band/types";
import { EMPTY_ONBOARDING } from "./onboarding";
import {
  buildProfile,
  PROFILE_FORMAT,
  PROFILE_LIMIT_BYTES,
  PROFILE_VERSION,
  profileFilename,
  readProfile,
  type ProfileSource,
} from "./profile";
import type { SavedRun } from "./scores";

function run(over: Partial<SavedRun> = {}): SavedRun {
  return {
    song: "nine-lives",
    title: "Nine Lives",
    failed: false,
    score: 100,
    bestCombo: 12,
    hits: 40,
    misses: 2,
    players: [{ label: "Player 1 · Guitar", score: 100, difficulty: "normal" }],
    at: 1_760_000_000_000,
    ...over,
  };
}

function source(over: Partial<ProfileSource> = {}): ProfileSource {
  return {
    settings: {
      audioLagMs: 25,
      visualLagMs: 10,
      volume: 0.8,
      levels: { music: 0.5, ambience: 0.5, sfx: 0.7 },
      guideVocal: true,
      video: false,
      view: "flat",
      noteStyle: "gems",
      noteSpeed: 1.5,
      backdropDim: 0.2,
      flares: false,
      crowd: false,
      tap: false,
      haptics: false,
      keepAwake: false,
    },
    plan: firstBand(),
    board: [run(), run({ score: 200 })],
    onboarding: { seats: [0, 2] },
    now: 1_790_000_000_000,
    ...over,
  };
}

describe("buildProfile", () => {
  test("is the versioned envelope, with the export's own moment", () => {
    const profile = buildProfile(source());
    expect(profile.format).toBe(PROFILE_FORMAT);
    expect(profile.version).toBe(PROFILE_VERSION);
    expect(profile.exportedAt).toBe(1_790_000_000_000);
    expect(profile.board).toHaveLength(2);
    expect(profile.settings.noteSpeed).toBe(1.5);
  });

  test("caps the board at what the board itself keeps", () => {
    const board = Array.from({ length: 60 }, (_, index) => run({ score: index }));
    expect(buildProfile(source({ board })).board).toHaveLength(50);
  });

  test("is a copy, not a view of the live records", () => {
    const records = source();
    const profile = buildProfile(records);
    records.board.push(run({ score: 999 }));
    records.settings.noteSpeed = 0.5;
    expect(profile.board).toHaveLength(2);
    expect(profile.settings.noteSpeed).toBe(1.5);
  });
});

describe("readProfile", () => {
  test("round-trips what the builder wrote", () => {
    const profile = buildProfile(source());
    const result = readProfile(JSON.stringify(profile));
    expect(result).toEqual({ ok: true, profile });
  });

  test("a missing onboarding is an empty one", () => {
    const { onboarding: _onboarding, ...without } = buildProfile(source());
    const result = readProfile(JSON.stringify(without));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.onboarding).toEqual(EMPTY_ONBOARDING);
  });

  test("the records are read through their own parsers, so a broken one is repaired", () => {
    const raw = JSON.stringify({
      format: PROFILE_FORMAT,
      version: PROFILE_VERSION,
      settings: { noteSpeed: 99, audioLagMs: "loud" },
      band: { slots: [] },
      board: [run()],
    });
    const result = readProfile(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.settings.noteSpeed).toBe(2);
    expect(result.profile.settings.audioLagMs).toBe(0);
  });

  test("a board entry that is not a run is dropped rather than imported", () => {
    const raw = JSON.stringify({
      format: PROFILE_FORMAT,
      version: PROFILE_VERSION,
      settings: {},
      band: { slots: [] },
      board: [run(), { song: "x" }, null],
    });
    const result = readProfile(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.board).toHaveLength(1);
  });

  test("a board longer than the board keeps is trimmed", () => {
    const raw = JSON.stringify({
      format: PROFILE_FORMAT,
      version: PROFILE_VERSION,
      settings: {},
      band: { slots: [] },
      board: Array.from({ length: 60 }, (_, index) => run({ score: index })),
    });
    const result = readProfile(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.board).toHaveLength(50);
  });

  test("a wrong format is refused before its records are read", () => {
    const raw = JSON.stringify({ format: "something-else", version: 1 });
    expect(readProfile(raw)).toEqual({ ok: false, problem: "wrongFormat" });
  });

  test("a version this build does not know is refused", () => {
    const raw = JSON.stringify({ format: PROFILE_FORMAT, version: 2 });
    expect(readProfile(raw)).toEqual({ ok: false, problem: "wrongVersion" });
  });

  test("a missing record is named", () => {
    const base = { format: PROFILE_FORMAT, version: 1 };
    expect(
      readProfile(JSON.stringify({ ...base, settings: null, band: {}, board: [] })),
    ).toEqual({ ok: false, problem: "missingSettings" });
    expect(
      readProfile(JSON.stringify({ ...base, settings: {}, board: [] })),
    ).toEqual({ ok: false, problem: "missingBand" });
    expect(
      readProfile(JSON.stringify({ ...base, settings: {}, band: {} })),
    ).toEqual({ ok: false, problem: "missingBoard" });
  });

  test("a file that is not an object, or not JSON, says which", () => {
    expect(readProfile("[]")).toEqual({ ok: false, problem: "notObject" });
    expect(readProfile("42")).toEqual({ ok: false, problem: "notObject" });
    expect(readProfile("null")).toEqual({ ok: false, problem: "notObject" });
    expect(readProfile("{not json")).toEqual({ ok: false, problem: "notJson" });
  });

  test("a file over the size cap is refused before it is parsed", () => {
    expect(readProfile("x".repeat(PROFILE_LIMIT_BYTES + 1))).toEqual({
      ok: false,
      problem: "tooLarge",
    });
  });
});

describe("profileFilename", () => {
  test("is the game's name and the profile's own day", () => {
    expect(profileFilename(Date.UTC(2026, 9, 28, 23, 30))).toBe(
      "everythingstar-profile-2026-10-28.json",
    );
  });

  test("a broken moment still names a file", () => {
    expect(profileFilename(Number.NaN)).toBe("everythingstar-profile-profile.json");
  });
});
