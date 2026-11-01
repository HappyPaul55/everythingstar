import { describe, expect, test } from "bun:test";
import { errorMessage, searchError, unreachableMessage } from "./errors";

const UNREACHABLE = /could not be reached/;

describe("unreachableMessage", () => {
  test("a fetch that never got an answer is one plain sentence", () => {
    // The three wordings the browsers use for CORS, offline, DNS and mixed content:
    // none of them is something a player can act on.
    expect(unreachableMessage(new TypeError("Failed to fetch"))).toMatch(UNREACHABLE);
    expect(
      unreachableMessage(new TypeError("NetworkError when attempting to fetch resource.")),
    ).toMatch(UNREACHABLE);
    expect(unreachableMessage(new TypeError("Load failed"))).toMatch(UNREACHABLE);
    // It says both things it could be, because `fetch` genuinely cannot tell.
    expect(unreachableMessage(new TypeError("Failed to fetch"))).toMatch(/CORS/);
  });

  test("a failure that already says what it was is left alone", () => {
    expect(unreachableMessage(new TypeError("URL includes credentials"))).toBeNull();
    expect(
      unreachableMessage(new Error("This document timed out, so it was not read.")),
    ).toBeNull();
    expect(unreachableMessage(new Error("404 Not Found"))).toBeNull();
    expect(unreachableMessage("Failed to fetch")).toBeNull();
  });
});

describe("errorMessage", () => {
  test("the network's opacity is replaced, and every other message kept", () => {
    expect(errorMessage(new TypeError("Failed to fetch"), "fallback")).toMatch(UNREACHABLE);
    expect(errorMessage(new Error("404 Not Found"), "fallback")).toBe("404 Not Found");
    expect(errorMessage("anything at all", "fallback")).toBe("fallback");
  });

  test("an abort keeps its own wording", () => {
    const abort = new DOMException("The operation was aborted.", "AbortError");
    expect(errorMessage(abort, "fallback")).not.toMatch(UNREACHABLE);
  });

  test("a page that is not a document says so without quoting it", () => {
    const html = new SyntaxError(
      'Unexpected token \'<\', "<!DOCTYPE " is not valid JSON',
    );
    expect(errorMessage(html, "fallback")).toBe(
      "that address answered with something that is not a playlist",
    );
  });
});

describe("searchError", () => {
  test("an abort is still the timeout it was, and a network failure is translated", () => {
    expect(searchError(new DOMException("aborted", "AbortError"))).toBe("timed out");
    expect(searchError(new TypeError("Failed to fetch"))).toMatch(UNREACHABLE);
    expect(searchError(undefined)).toBe("could not be searched");
  });
});
