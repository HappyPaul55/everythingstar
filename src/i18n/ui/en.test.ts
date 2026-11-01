import { describe, expect, test } from "bun:test";
import { en } from "./en";
import { enCharterOnly } from "./en.charter";
import { enGame } from "./en.game";
import { enSite } from "./en.site";

describe("the English dictionaries", () => {
  test("the game, site and charter keys are disjoint and cover the whole dictionary", () => {
    const keys = [
      ...Object.keys(enGame),
      ...Object.keys(enSite),
      ...Object.keys(enCharterOnly),
    ];
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.sort()).toEqual(Object.keys(en).sort());
  });

  test("the first download's dictionary carries neither site nor charter strings", () => {
    for (const key of [
      "home.title",
      "docs.title",
      "seo.title",
      "privacy.title",
      "charter.title",
    ]) {
      expect(key in enGame).toBe(false);
    }
    // The menu's one link into the charter is the exception.
    expect("charter.menu" in enGame).toBe(true);
  });
});
