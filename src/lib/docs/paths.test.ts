import { describe, expect, test } from "bun:test";
import {
  DOCS_ROOT,
  docHref,
  docIdFromPath,
  docSectionOf,
  resolveDocLink,
} from "./paths";
import type { Locale } from "../../i18n/locales";

describe("docHref", () => {
  test("the hub is /docs", () => {
    expect(docHref("README")).toBe("/docs");
  });

  test("a section is in the URL", () => {
    expect(docHref("players/songs")).toBe("/docs/players/songs");
    expect(docHref("charters/formats")).toBe("/docs/charters/formats");
    expect(docHref("developers/audio")).toBe("/docs/developers/audio");
  });

  test("a notice keeps a site-root URL", () => {
    expect(docHref("other/privacy")).toBe("/privacy");
    expect(docHref("other/credits")).toBe("/credits");
  });

  test("a page in another locale is prefixed, like every other internal link", () => {
    // Only English ships, so the second locale is a cast: the arithmetic is the
    // point, and it is the same `localePath` every link uses.
    const de = "de" as Locale;
    expect(docHref("players/songs", de)).toBe("/de/docs/players/songs");
    expect(docHref("README", de)).toBe("/de/docs");
    expect(docHref("other/privacy", de)).toBe("/de/privacy");
  });
});

describe("docSectionOf", () => {
  test("the folder is the section", () => {
    expect(docSectionOf("players/songs")).toBe("players");
    expect(docSectionOf("developers/a/b")).toBe("developers");
    expect(docSectionOf("other/privacy")).toBe("other");
  });

  test("the hub and a stray file are not in a section", () => {
    expect(docSectionOf("README")).toBeNull();
    expect(docSectionOf("stray")).toBeNull();
    expect(docSectionOf("drafts/a")).toBeNull();
  });
});

describe("resolveDocLink", () => {
  test("a sibling document", () => {
    expect(resolveDocLink("players/songs", "instruments.md")).toBe(
      "/docs/players/instruments",
    );
  });

  test("a parent and a child", () => {
    expect(resolveDocLink("players/songs", "../charters/formats.md")).toBe(
      "/docs/charters/formats",
    );
    expect(resolveDocLink("players/songs", "deep/page.md")).toBe(
      "/docs/players/deep/page",
    );
  });

  test("a notice is rewritten to its root URL", () => {
    expect(resolveDocLink("README", "other/privacy.md")).toBe("/privacy");
    expect(resolveDocLink("developers/audio", "../other/terms.md")).toBe("/terms");
  });

  test("an anchor and a query survive", () => {
    expect(resolveDocLink("players/songs", "instruments.md#drums")).toBe(
      "/docs/players/instruments#drums",
    );
    expect(resolveDocLink("players/songs", "instruments.md?v=2#x")).toBe(
      "/docs/players/instruments?v=2#x",
    );
  });

  test("what already means something is left alone", () => {
    for (const url of [
      "https://example.com/a.md",
      "mailto:someone@example.com",
      "//example.com/a.md",
      "/docs/players/songs",
      "#a-heading",
      "https://everythingstar.happypaul55.com/play",
    ]) {
      expect(resolveDocLink("players/songs", url)).toBe(url);
    }
  });

  test("a file outside docs is left to the author to link in full", () => {
    expect(resolveDocLink("developers/audio", "../../README.md")).toBe("../../README.md");
    expect(resolveDocLink("developers/audio", "song.json")).toBe("song.json");
    expect(resolveDocLink("developers/audio", "../playlist.schema.json")).toBe(
      "../playlist.schema.json",
    );
  });

  test("a link that climbs out of docs is not a route", () => {
    expect(resolveDocLink("README", "../players/songs.md")).toBe("../players/songs.md");
  });
});

describe("docIdFromPath", () => {
  test("a path under docs is its id", () => {
    expect(docIdFromPath(`${DOCS_ROOT}players/songs.md`)).toBe("players/songs");
    expect(docIdFromPath(`${DOCS_ROOT}README.md`)).toBe("README");
  });

  test("another directory or another file type is not a document", () => {
    expect(docIdFromPath("/tmp/docs/players/songs.md")).toBeNull();
    expect(docIdFromPath(`${DOCS_ROOT}players/songs.json`)).toBeNull();
  });
});
