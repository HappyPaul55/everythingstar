import { captureNoteType, docshot, test } from "../support";

docshot(test, "style-gems", { crop: { mobile: { edge: "bottom", percent: 40 } } });

test("the gems style", async ({ context, page }) => {
  await captureNoteType(context, page, "Note style", "Gems");
});
