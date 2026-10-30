import { captureGuitarHighway, docshot, test } from "../support";

docshot(test, "guitar-highway", { viewports: ["desktop"] });

test("one guitar player's highway, a beat into the run", async ({ context, page }) => {
  await captureGuitarHighway(context, page);
});
