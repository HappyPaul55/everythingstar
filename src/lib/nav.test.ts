import { describe, expect, test } from "bun:test";
import { translator } from "../i18n";
import { siteNav } from "./nav";

const t = translator("en");

describe("siteNav", () => {
  test("links Play, Docs then Privacy for the default locale", () => {
    expect(siteNav("en", t)).toEqual([
      { href: "/play", label: "Play" },
      { href: "/docs", label: "Docs" },
      { href: "/privacy", label: "Privacy" },
    ]);
  });

  test("every item has a label and an absolute path", () => {
    for (const item of siteNav("en", t)) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.href.startsWith("/")).toBe(true);
    }
  });
});
