import { captureBandScreen, docshot, test } from "../support";

docshot(test, "band-screen", { viewports: ["desktop"] });

test("the band screen with three players seated", async ({ context, page }) => {
  await captureBandScreen(context, page);
});
