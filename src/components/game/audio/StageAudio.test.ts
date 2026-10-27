import { describe, expect, test } from "bun:test";
import type { AudioApi } from "./StageAudio";

/**
 * The mixer's stable API, as a type check.
 *
 * The bug this guards is a **re-render**, and this suite has no DOM to render into,
 * so the thing worth pinning is the shape. A sting ducks the **menu's** bed — a graph
 * node — and nothing else: a run's stems are media elements outside the graph, so no
 * cue can turn the song down and no dip has to be published to the stage. If a
 * `ducked`-style flag ever creeps into the value every `useAudio()` consumer reads,
 * each dip would redraw every panel and the melody mid-run for a number none of them
 * uses; the assignments below fail `bun run typecheck:tests` if it appears, or if a
 * new key joins the API without this test being told.
 */
const stable = [
  "bed",
  "ready",
  "volume",
  "setVolume",
  "play",
  "preview",
] as const satisfies readonly (keyof AudioApi)[];

/** Type equality, so an added key fails rather than being silently ignored. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const exact: Same<keyof AudioApi, (typeof stable)[number]> = true;

describe("the mixer's context value", () => {
  test("carries no duck for a screen to re-render for", () => {
    expect(exact).toBe(true);
    expect(stable).not.toContain("ducked");
  });
});
