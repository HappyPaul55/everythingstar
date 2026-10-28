import { describe, expect, test } from "bun:test";
import { docGroups, docNeighbours } from "./nav";
import type { DocSummary } from "./nav";

function doc(
  id: string,
  order: number,
  title = id,
): DocSummary {
  return {
    id,
    data: { title, description: title, updated: "2026-10-28", order },
  };
}

const entries: DocSummary[] = [
  doc("README", 0, "Documentation"),
  doc("players/typing", 2),
  doc("players/songs", 1),
  doc("developers/gotchas", 2),
  doc("developers/architecture", 1),
  doc("other/privacy", 1),
  doc("charters/formats", 1),
  doc("stray", 1),
];

describe("docGroups", () => {
  test("sections are in the site's order and documents by their order", () => {
    expect(
      docGroups(entries).map((group) => [group.section, group.docs.map((doc) => doc.id)]),
    ).toEqual([
      ["players", ["players/songs", "players/typing"]],
      ["charters", ["charters/formats"]],
      ["developers", ["developers/architecture", "developers/gotchas"]],
      ["other", ["other/privacy"]],
    ]);
  });

  test("the hub and a stray file are not listed", () => {
    const ids = docGroups(entries).flatMap((group) => group.docs.map((doc) => doc.id));
    expect(ids).not.toContain("README");
    expect(ids).not.toContain("stray");
  });

  test("an empty section is not a group", () => {
    expect(docGroups([doc("README", 0)])).toEqual([]);
  });
});

describe("docNeighbours", () => {
  test("the previous and next inside the same section", () => {
    expect(docNeighbours(entries, "players/songs")).toEqual({
      previous: null,
      next: entries.find((entry) => entry.id === "players/typing")!,
    });
    expect(docNeighbours(entries, "players/typing")).toEqual({
      previous: entries.find((entry) => entry.id === "players/songs")!,
      next: null,
    });
  });

  test("a page in the middle has both", () => {
    const middle = docNeighbours(entries, "developers/architecture");
    expect(middle.previous).toBeNull();
    expect(middle.next?.id).toBe("developers/gotchas");
  });

  test("the hub has no pager", () => {
    expect(docNeighbours(entries, "README")).toEqual({ previous: null, next: null });
  });

  test("an unknown page has no pager", () => {
    expect(docNeighbours(entries, "players/nope")).toEqual({ previous: null, next: null });
  });
});
