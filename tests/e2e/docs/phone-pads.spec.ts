import { capturePhonePads, docshot, test } from "../support";

docshot(test, "phone-pads", { viewports: ["mobile"] });

test("the pads on a portrait phone, a beat into the run", async ({ context, page }) => {
  await capturePhonePads(context, page);
});
