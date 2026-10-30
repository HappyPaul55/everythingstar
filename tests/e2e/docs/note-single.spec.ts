import { captureNoteType, docshot, test } from "../support";

docshot(test, "note-single", { crop: { mobile: { edge: "bottom", percent: 40 } } });

test("a single note", async ({ context, page }) => {
  await captureNoteType(context, page, "One note");
});
