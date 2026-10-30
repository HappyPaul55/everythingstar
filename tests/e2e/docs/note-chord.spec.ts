import { captureNoteType, docshot, test } from "../support";

docshot(test, "note-chord", { crop: { mobile: { edge: "bottom", percent: 40 } } });

test("a chord", async ({ context, page }) => {
  await captureNoteType(context, page, "Three at once");
});
