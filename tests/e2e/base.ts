/**
 * The browser suite's `test`, with the one check every spec should get for free.
 *
 * `installFixtures` answers every request the game makes and records anything it
 * could not answer. A spec used to have to keep the returned list and assert it was
 * empty; the five that forgot aborted an unexpected request silently and passed. An
 * automatic fixture checks the list after every test instead, so a new external host
 * is a failure wherever it appears.
 *
 * `export *` carries `expect` and the types; the local `test` shadows the star's.
 */
import { expect, test as base } from "@playwright/test";
import { leaksFor } from "./fixture";

export * from "@playwright/test";

export const test = base.extend<{ noLeaks: void }>({
  noLeaks: [
    async ({ context }, use) => {
      await use();
      const leaked = leaksFor(context);
      if (leaked) expect(leaked, "unexpected external requests").toEqual([]);
    },
    { auto: true },
  ],
});
