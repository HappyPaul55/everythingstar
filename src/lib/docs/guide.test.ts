import { describe, expect, test } from "bun:test";
import { GUIDE_SECTIONS, guideAnchor, guideGroups } from "./guide";
import type { DocSummary } from "./nav";

function doc(id: string, order: number, title = id): DocSummary {
  return {
    id,
    data: { title, description: title, updated: "2026-11-03", order },
  };
}

const entries: DocSummary[] = [
  doc("README", 0, "Documentation"),
  doc("players/songs", 1),
  doc("players/typing", 2),
  doc("charters/formats", 1),
  doc("developers/architecture", 1),
  doc("developers/gotchas", 2),
  doc("other/privacy", 1),
  doc("other/terms", 2),
  doc("stray", 1),
];

describe("guideGroups", () => {
  test("players, charters and notices, each in its own order", () => {
    expect(
      guideGroups(entries).map((group) => [group.section, group.docs.map((doc) => doc.id)]),
    ).toEqual([
      ["players", ["players/songs", "players/typing"]],
      ["charters", ["charters/formats"]],
      ["other", ["other/privacy", "other/terms"]],
    ]);
  });

  test("the developers' pages, the hub and a stray file are not chapters", () => {
    const ids = guideGroups(entries).flatMap((group) => group.docs.map((doc) => doc.id));
    expect(ids).not.toContain("developers/architecture");
    expect(ids).not.toContain("developers/gotchas");
    expect(ids).not.toContain("README");
    expect(ids).not.toContain("stray");
  });

  test("the sections are the module's own list", () => {
    expect(guideGroups(entries).map((group) => group.section)).toEqual([...GUIDE_SECTIONS]);
  });
});

describe("guideAnchor", () => {
  test("a chapter id becomes one anchor", () => {
    expect(guideAnchor("players/songs")).toBe("doc-players-songs");
    expect(guideAnchor("other/privacy")).toBe("doc-other-privacy");
    expect(guideAnchor("players/on-a-phone")).toBe("doc-players-on-a-phone");
  });

  test("different documents never share an anchor", () => {
    const ids = entries.map((entry) => entry.id);
    expect(new Set(ids.map(guideAnchor)).size).toBe(ids.length);
  });
});
