import { captureNoteType, docshot, test } from "../support";

docshot(test, "note-open", { crop: { mobile: { edge: "bottom", percent: 40 } } });

test("an empty strum", async ({ context, page }) => {
  await captureNoteType(context, page, "Nothing fretted");
});
