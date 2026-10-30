import { describe, expect, test } from "bun:test";
import { fenceShots, parseFenceMeta } from "./fence";

const BODY = [
  'import { expect, test } from "./support";',
  "",
  'test("a screen", async ({ page }) => {',
  "  expect(page).toBeDefined();",
  "});",
].join("\n");

function fence(meta: string, body = BODY): string {
  return ["# A page", "", "```ts " + meta, body, "```", ""].join("\n");
}

describe("a capture fence", () => {
  test("reads the id, alt and body", () => {
    const { shots, problems } = fenceShots(
      fence('id="jukebox" alt="The jukebox with its A–Z index and its rows."'),
      "players/songs",
    );
    expect(problems).toEqual([]);
    expect(shots).toHaveLength(1);
    expect(shots[0]).toMatchObject({
      doc: "players/songs",
      id: "jukebox",
      alt: "The jukebox with its A–Z index and its rows.",
      line: 3,
    });
    expect(shots[0]!.body).toContain('test("a screen"');
  });

  test("leaves an ordinary ts block alone", () => {
    const { shots, problems } = fenceShots(
      ["```ts", "const answer = 42;", "```", ""].join("\n"),
      "players/songs",
    );
    expect(problems).toEqual([]);
    expect(shots).toEqual([]);
  });

  test("does not read an example inside a longer fence", () => {
    const source = [
      "````markdown",
      "```ts id=\"jukebox\" alt=\"An example of the syntax, quoted in prose.\"",
      BODY,
      "```",
      "````",
      "",
    ].join("\n");
    expect(fenceShots(source, "developers/writing-docs").shots).toEqual([]);
  });

  test("takes viewports and a caption", () => {
    const { shots } = fenceShots(
      fence(
        'id="jukebox" viewports=desktop,mobile caption="The jukebox, on two screens." alt="The jukebox with its A–Z index and its rows."',
      ),
      "players/songs",
    );
    expect(shots[0]?.viewports).toEqual(["desktop", "mobile"]);
    expect(shots[0]?.caption).toBe("The jukebox, on two screens.");
  });

  test("refuses an alt short enough to say nothing", () => {
    const { problems } = fenceShots(fence('id="jukebox" alt="A shot."'), "players/songs");
    expect(problems).toEqual([
      'players/songs:3: "jukebox" needs alt="…": the description a screen reader hears',
    ]);
  });

  test("refuses two tests in one capture", () => {
    const body = [BODY, BODY].join("\n");
    const { problems } = fenceShots(
      fence('id="jukebox" alt="The jukebox with its A–Z index and its rows."', body),
      "players/songs",
    );
    expect(problems).toContain(
      'players/songs:3: "jukebox" must hold exactly one test(), found 2',
    );
  });

  test("refuses a test that does not come from ./support", () => {
    const body = 'import { test } from "@playwright/test";\n\ntest("a screen", async () => {});';
    const { problems } = fenceShots(
      fence('id="jukebox" alt="The jukebox with its A–Z index and its rows."', body),
      "players/songs",
    );
    expect(problems).toContain(
      'players/songs:3: "jukebox" must import test and its helpers from "./support"',
    );
  });

  test("refuses a hook of its own", () => {
    const body = [BODY, 'test.afterEach(async () => {});'].join("\n");
    const { problems } = fenceShots(
      fence('id="jukebox" alt="The jukebox with its A–Z index and its rows."', body),
      "players/songs",
    );
    expect(problems).toContain(
      'players/songs:3: "jukebox" must not register hooks: the capture owns the screenshot',
    );
  });

  test("reports a fence that is never closed", () => {
    const { problems } = fenceShots(['```ts id="x" alt="A description long enough."', "test("].join("\n"), "players/x");
    expect(problems).toContain("players/x:1: this fence is never closed");
  });
});

describe("parseFenceMeta", () => {
  test("keeps a quoted value whole and a bare one as written", () => {
    expect(parseFenceMeta('id="a-b" alt="one two" viewports=desktop,mobile')).toEqual({
      id: "a-b",
      alt: "one two",
      viewports: "desktop,mobile",
    });
  });
});
