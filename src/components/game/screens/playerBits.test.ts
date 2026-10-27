import { describe, expect, test } from "bun:test";
import { translator } from "../../../i18n";
import { INSTRUMENT_KINDS } from "../../../lib/game/track";
import { kindLabel, kindTone } from "./playerBits";

/**
 * The colour rule for the ways to play: **every instrument is the default schema
 * and only Vocals wears the accent**. Typing is its own way to play, not a second
 * spelling of karaoke, so a typist's seat is default even though it sits at the
 * words' place.
 */
describe("kindTone", () => {
  test("every instrument uses the default schema", () => {
    for (const kind of INSTRUMENT_KINDS) expect(kindTone(kind)).toBe("default");
  });

  test("a singer is the blue part", () => {
    expect(kindTone("words", "sing")).toBe("vocals");
  });

  test("a typist is not — Typing is its own way to play", () => {
    expect(kindTone("words", "type")).toBe("default");
  });

  test("an unstated words mode is a singer by default", () => {
    // The song's pitch settles it, and a pitched song defaults to singing; the
    // caller passes the resolved mode where it knows the song.
    expect(kindTone("words")).toBe("vocals");
  });
});

describe("kindLabel", () => {
  const t = translator("en");

  test("a guitar's role is its name", () => {
    expect(kindLabel(t, "guitar", true, "lead")).toBe("Lead guitar");
    expect(kindLabel(t, "guitar", true, "rhythm")).toBe("Rhythm guitar");
    expect(kindLabel(t, "guitar", true)).toBe("Guitar");
  });
});
