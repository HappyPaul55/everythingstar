import { describe, expect, test } from "bun:test";
import {
  fullscreenElementOf,
  isGameFullscreen,
  shouldRestoreFullscreen,
} from "./useFullscreen";

/** A stand-in for an element, so the predicates can be tested without a DOM. */
const element = (name: string) => ({ name }) as unknown as Element;

describe("fullscreenElementOf", () => {
  test("reads the element on the whole screen", () => {
    const game = element("game");
    expect(fullscreenElementOf({ fullscreenElement: null })).toBeNull();
    expect(fullscreenElementOf({ fullscreenElement: game })).toBe(game);
  });

  test("understands the older WebKit spelling", () => {
    const old = element("old");
    expect(fullscreenElementOf({ webkitFullscreenElement: old })).toBe(old);
  });
});

describe("isGameFullscreen", () => {
  test("anything of ours on the whole screen is the game", () => {
    expect(isGameFullscreen({ fullscreenElement: element("game") })).toBe(true);
    // The backdrop is ours too, and means the same thing.
    expect(isGameFullscreen({ fullscreenElement: element("iframe") })).toBe(true);
  });

  test("nothing fullscreen means the page is itself", () => {
    expect(isGameFullscreen({ fullscreenElement: null })).toBe(false);
    expect(isGameFullscreen({})).toBe(false);
  });

  test("the older WebKit spelling counts the same", () => {
    expect(isGameFullscreen({ webkitFullscreenElement: element("game") })).toBe(true);
  });
});

describe("shouldRestoreFullscreen", () => {
  test("asks for the screen back only when it was ours and is now gone", () => {
    expect(shouldRestoreFullscreen(true, {})).toBe(true);
    expect(shouldRestoreFullscreen(true, { fullscreenElement: null })).toBe(true);
    expect(shouldRestoreFullscreen(true, { fullscreenElement: element("game") })).toBe(false);
  });

  test("does nothing when the game was not fullscreen before the prompt", () => {
    expect(shouldRestoreFullscreen(false, {})).toBe(false);
    expect(shouldRestoreFullscreen(false, { fullscreenElement: null })).toBe(false);
  });
});
