import { captureNoteType, docshot, test } from "../support";

docshot(test, "style-bars", { crop: { mobile: { edge: "bottom", percent: 40 } } });

test("the bars style", async ({ context, page }) => {
  await captureNoteType(context, page, "Note style", "Bars");
});
