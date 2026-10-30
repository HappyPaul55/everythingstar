import { captureNoteType, docshot, test } from "../support";

docshot(test, "note-hammer-on", { crop: { mobile: { edge: "bottom", percent: 40 } } });

test("a hammer-on", async ({ context, page }) => {
  await captureNoteType(context, page, "Hammered on");
});
