import { describe, expect, test } from "bun:test";
import {
  INTENT_MAX_URL,
  readIntent,
  readIntentFromUrl,
  shareUrl,
  withoutIntent,
} from "./intent";
import { MAX_URL_CHARS } from "./url";

const PLAYLIST = "https://example.com/library/playlist.json";
const SONG = "https://example.com/library/songs/one.json";

describe("readIntent", () => {
  test("an empty query asks for nothing", () => {
    expect(readIntent("")).toEqual({ state: "none" });
    expect(readIntent("?dev=1")).toEqual({ state: "none" });
  });

  test("a playlist link is an intent", () => {
    const search = `?playlist=${encodeURIComponent(PLAYLIST)}`;
    expect(readIntent(search)).toEqual({
      state: "intent",
      intent: { kind: "playlist", url: PLAYLIST },
    });
  });

  test("a song link is an intent", () => {
    const search = `?song=${encodeURIComponent(SONG)}`;
    expect(readIntent(search)).toEqual({
      state: "intent",
      intent: { kind: "song", url: SONG },
    });
  });

  test("a bare query without the question mark still reads", () => {
    expect(readIntent(`playlist=${encodeURIComponent(PLAYLIST)}`).state).toBe(
      "intent",
    );
  });

  test("naming both is refused rather than guessed", () => {
    const search = `?playlist=${encodeURIComponent(PLAYLIST)}&song=${encodeURIComponent(SONG)}`;
    expect(readIntent(search)).toEqual({ state: "invalid", reason: "both" });
  });

  test("only an absolute http(s) address with a host and no credentials", () => {
    const cases = [
      "javascript:alert(1)",
      "data:text/plain,x",
      "file:///etc/passwd",
      "/relative/playlist.json",
      "https://user:pass@example.com/playlist.json",
      "not a url",
    ];
    for (const url of cases) {
      expect(readIntent(`?playlist=${encodeURIComponent(url)}`)).toEqual({
        state: "invalid",
        reason: "url",
      });
    }
  });

  test("an absurdly long target is refused before it is stored", () => {
    const long = `https://example.com/${"a".repeat(INTENT_MAX_URL)}`;
    expect(readIntent(`?playlist=${encodeURIComponent(long)}`)).toEqual({
      state: "invalid",
      reason: "long",
    });
  });

  test("the link ceiling is the URL policy's own", () => {
    // One number for a link and a pasted playlist: `fetchableUrl` refuses anything
    // past it, so the two surfaces cannot drift apart.
    expect(INTENT_MAX_URL).toBe(MAX_URL_CHARS);
  });

  test("the address is normalised, so the same document is one intent", () => {
    expect(readIntent("?playlist=https%3A%2F%2Fexample.com%2Flibrary%2Fplaylist.json").state).toBe(
      "intent",
    );
  });
});

describe("readIntentFromUrl", () => {
  const base = "https://everythingstar.happypaul55.com/open";

  test("reads the query of a whole website address", () => {
    expect(readIntentFromUrl(`${base}?song=${encodeURIComponent(SONG)}`, base)).toEqual({
      state: "intent",
      intent: { kind: "song", url: SONG },
    });
  });

  test("the custom scheme reads the same query", () => {
    expect(
      readIntentFromUrl(`everythingstar://open?playlist=${encodeURIComponent(PLAYLIST)}`, base),
    ).toEqual({
      state: "intent",
      intent: { kind: "playlist", url: PLAYLIST },
    });
  });

  test("an address that is not one is nothing", () => {
    expect(readIntentFromUrl("", base)).toEqual({ state: "none" });
  });
});

describe("shareUrl", () => {
  test("builds the canonical open link and reads back", () => {
    const link = shareUrl("https://everythingstar.happypaul55.com", {
      kind: "playlist",
      url: PLAYLIST,
    });
    expect(link).toBe(
      `https://everythingstar.happypaul55.com/open?playlist=${encodeURIComponent(PLAYLIST)}`,
    );
    expect(readIntent(new URL(link).search)).toEqual({
      state: "intent",
      intent: { kind: "playlist", url: PLAYLIST },
    });
  });

  test("a target with a query of its own survives the round trip", () => {
    const target = "https://example.com/playlist.json?key=a&lang=en";
    const link = shareUrl("https://everythingstar.happypaul55.com", {
      kind: "playlist",
      url: target,
    });
    expect(readIntent(new URL(link).search)).toEqual({
      state: "intent",
      intent: { kind: "playlist", url: target },
    });
  });
});

describe("withoutIntent", () => {
  test("strips the intent and keeps everything else", () => {
    expect(withoutIntent("?dev=1&playlist=https%3A%2F%2Fexample.com%2Fp.json")).toBe(
      "?dev=1",
    );
    expect(withoutIntent("?song=https%3A%2F%2Fexample.com%2Fs.json&lang=en")).toBe(
      "?lang=en",
    );
  });

  test("no intent leaves an empty query", () => {
    expect(withoutIntent("?playlist=x")).toBe("");
    expect(withoutIntent("")).toBe("");
  });
});
