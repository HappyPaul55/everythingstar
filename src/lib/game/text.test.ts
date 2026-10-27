import { describe, expect, test } from "bun:test";
import { basename, slug } from "./text";

describe("slug", () => {
  test("lower-cases a name and joins its words with one hyphen", () => {
    expect(slug("Turn the Volume Up")).toBe("turn-the-volume-up");
    expect(slug("Nine Lives")).toBe("nine-lives");
  });

  test("every run of punctuation and space is one hyphen", () => {
    expect(slug("Hello,   World!")).toBe("hello-world");
    expect(slug("The Example — First Light")).toBe("the-example-first-light");
  });

  test("leading and trailing punctuation leaves no hyphen at either end", () => {
    expect(slug("...Hello...")).toBe("hello");
    expect(slug("— Nine Lives —")).toBe("nine-lives");
  });

  test("a letter is a letter in any script, so a name keeps its own", () => {
    // The contract says a letter or a digit — Unicode's, not ASCII's. Cutting
    // `ö` and `é` out would make the id a different word from the name.
    expect(slug("Zürich")).toBe("zürich");
    expect(slug("Café")).toBe("café");
    // A decomposed accent is the same letter as a precomposed one.
    expect(slug("Cafe\u0301")).toBe("café");
  });

  test("an ordinary ASCII name is unchanged by the rule", () => {
    expect(slug("Static Bloom")).toBe("static-bloom");
  });

  test("a name with nothing in it has no slug, and says so", () => {
    expect(slug("")).toBe("");
    expect(slug("!!!")).toBe("");
    expect(slug("   ")).toBe("");
  });
});

describe("basename", () => {
  test("takes the last segment of a path", () => {
    expect(basename("art/songs/nine-lives.svg")).toBe("nine-lives.svg");
    expect(basename("song.ogg")).toBe("song.ogg");
  });

  test("a path with no slash is its own name", () => {
    expect(basename("notes.chart")).toBe("notes.chart");
  });

  test("a trailing slash has nothing after it", () => {
    expect(basename("folder/songs/")).toBe("");
  });
});
