// Generated from docs/players/band-and-controllers.md:10 by `bun run docs:shots`.
import { docshot } from "../../src/lib/docshots/capture";

docshot(test, { doc: "players/band-and-controllers", id: "band-screen" });

test.beforeEach(({}, testInfo) => {
  if (!["desktop"].includes(testInfo.project.name)) testInfo.skip();
});
import { captureBandScreen, test } from "./support";

test("the band screen with three players seated", async ({ context, page }) => {
  await captureBandScreen(context, page);
});
