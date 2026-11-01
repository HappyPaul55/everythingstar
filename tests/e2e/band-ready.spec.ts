import { expect, test } from "./base";
import { installDocsFixtures } from "./docs-library";
import { disableFullscreen } from "./fixture";
import { enterGame, openDocsBand, seatPlayers, setSlot } from "./helpers";

/**
 * Play waits for the charts the run will actually judge.
 *
 * A seat change (a difficulty here) keeps the old charts on screen while the new
 * one is fetched — right, because the band should not go blank — but the band used
 * to call them **ready** at the same time. Play then started on the old chart and
 * the run reset when the new one landed. The chart request is held open so the
 * window is observable rather than a race: the stage must not start moving while
 * the difficulty it will judge is still arriving.
 */
test("Play waits for the chart a difficulty change is still fetching", async ({
  context,
  page,
}) => {
  const leaked = await installDocsFixtures(context);

  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = false;
  // The most recently added route is asked first; `fallback` hands the request to
  // the docs fixture, which is the real answer.
  await context.route(
    /\/charts\/jonathan-coulton-code-monkey\/guitar-expert\.json$/,
    async (route) => {
      requested = true;
      await held;
      await route.fallback();
    },
  );

  await disableFullscreen(page);
  await enterGame(page);
  await openDocsBand(page);
  await seatPlayers(page, 1);
  await setSlot(page, 1, "Guitar");

  const play = page.getByRole("button", { name: "Play", exact: true });
  await expect(play).toBeEnabled();
  await page.locator(".slot").first().getByRole("button", { name: "expert", exact: true }).click();
  await expect.poll(() => requested, { timeout: 10_000 }).toBe(true);
  await play.click();

  const screen = page.locator("html");
  // The guitar's entrance is 4.87 s (`hype.ts`), so 6.5 s is past the point a
  // ready band would have been playing: a stage that is moving now is a stage
  // playing the chart the player did not choose.
  await page.waitForTimeout(6_500);
  expect(await screen.getAttribute("data-screen")).not.toBe("playing");

  // The chart arrives: now the run starts, on the difficulty the band shows.
  release();
  await expect(screen).toHaveAttribute("data-screen", "playing", { timeout: 20_000 });

  expect(leaked, "unexpected external requests").toEqual([]);
});
