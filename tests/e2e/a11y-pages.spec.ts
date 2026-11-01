import { expect, test } from "./base";
import { installFixtures } from "./fixture";
import { describeViolations, seriousViolations } from "./axe";

/**
 * The paper pages, each loaded on its own.
 *
 * They are plain Astro, so there is no screen machine to walk: the document is
 * the whole page and the audit is of exactly what a search or a link lands on.
 * The not-found page answers 404, which is still a document like any other.
 *
 * Separate from the game-screen scans so the browser shards can run the two on
 * different workers: five page loads and one long screen walk are not one unit
 * of work.
 */
const PAPER_PAGES = [
  { path: "/", status: 200, name: "the landing page" },
  { path: "/privacy", status: 200, name: "the privacy page" },
  { path: "/docs", status: 200, name: "the documentation hub" },
  {
    path: "/docs/developers/architecture",
    status: 200,
    name: "a documentation page",
  },
  { path: "/404", status: 404, name: "the not-found page" },
];

for (const paper of PAPER_PAGES) {
  test(`${paper.name} has no critical or serious violations`, async ({
    context,
    page,
  }) => {
    const leaked = await installFixtures(context);
    const response = await page.goto(paper.path);
    expect(response?.status(), paper.path).toBe(paper.status);
    await expect(page.locator("#main")).toBeVisible();

    const violations = await seriousViolations(page);
    expect(describeViolations(violations)).toBe("");

    expect(leaked, "unexpected external requests").toEqual([]);
  });
}
