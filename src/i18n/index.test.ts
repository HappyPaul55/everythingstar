import { describe, expect, test } from "bun:test";
import { translate, translateWith, type MessageKey } from "./index";
import { en } from "./ui/en";

describe("translate", () => {
  test("fills a placeholder from the variables it is given", () => {
    expect(translate("en", "seo.titleOpen", { name: "EverythingStar" })).toBe(
      "Open in EverythingStar",
    );
    expect(translate("en", "screen.songCount", { count: 3 })).toBe("3 songs");
  });

  test("leaves a placeholder visible when no variable fills it", () => {
    expect(translate("en", "screen.songCount")).toBe("{count} songs");
    expect(translate("en", "screen.songCount", { other: 1 })).toBe(
      "{count} songs",
    );
  });
});

describe("translateWith", () => {
  test("a locale with no dictionary reads English", () => {
    expect(translateWith({ en }, "de", "common.skipToContent")).toBe(
      "Skip to content",
    );
  });

  test("a non-default locale overlays English key by key", () => {
    const de = { "common.skipToContent": "Zum Inhalt springen" };

    expect(translateWith({ en, de }, "de", "common.skipToContent")).toBe(
      "Zum Inhalt springen",
    );
    // A key the overlay does not carry still reads English.
    expect(translateWith({ en, de }, "de", "nav.home")).toBe("Home");
  });

  test("a key no dictionary carries stays visible rather than empty", () => {
    expect(translateWith({ en }, "en", "nothing.here" as MessageKey)).toBe(
      "nothing.here",
    );
  });
});
