// Generated from docs/players/songs.md:10 by `bun run docs:shots`.
import { docshot } from "../../src/lib/docshots/capture";

docshot(test, { doc: "players/songs", id: "jukebox" });

test.beforeEach(({}, testInfo) => {
  if (!["desktop"].includes(testInfo.project.name)) testInfo.skip();
});
import { captureJukebox, test } from "./support";

test("the jukebox shows its index, its rows and the now-playing panel", async ({ context, page }) => {
  await captureJukebox(context, page);
});
