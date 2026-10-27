import { describe, expect, test } from "bun:test";
import { artStateFor, artUrlFor } from "./useArtUrl";

describe("artStateFor", () => {
  test("a new local cover shows the placeholder, not the last picture", () => {
    const state = { src: "folder://a/One/cover.png", url: "blob:old" };
    expect(artStateFor(state, "folder://a/Two/cover.png")).toBeNull();
    expect(artStateFor(state, null)).toBeNull();
  });

  test("a URL cover is its own answer at once", () => {
    const state = { src: "folder://a/One/cover.png", url: "blob:old" };
    expect(artStateFor(state, "https://x/cover.png")).toBe("https://x/cover.png");
  });

  test("the same src keeps what was resolved for it", () => {
    const state = { src: "folder://a/One/cover.png", url: "blob:new" };
    expect(artStateFor(state, "folder://a/One/cover.png")).toBe("blob:new");
  });
});

describe("artUrlFor", () => {
  test("reads a URL as itself and a folder as nothing yet", () => {
    expect(artUrlFor("https://x/cover.png")).toBe("https://x/cover.png");
    expect(artUrlFor("folder://a/One/cover.png")).toBeNull();
    expect(artUrlFor(null)).toBeNull();
  });
});
