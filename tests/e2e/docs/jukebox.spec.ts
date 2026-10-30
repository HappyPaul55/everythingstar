import { captureJukebox, docshot, test } from "../support";

docshot(test, "jukebox", { viewports: ["desktop"] });

test("the jukebox shows its index, rows and now-playing panel", async ({ context, page }) => {
  await captureJukebox(context, page);
});
