import { captureNoteType, docshot, test } from "../support";

docshot(test, "style-arrows", { crop: { mobile: { edge: "bottom", percent: 40 } } });

test("the arrows style", async ({ context, page }) => {
  await captureNoteType(context, page, "Note style", "Arrows");
});
