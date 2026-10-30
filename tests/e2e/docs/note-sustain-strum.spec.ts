import { captureNoteType, docshot, test } from "../support";

docshot(test, "note-sustain-strum", { crop: { mobile: { edge: "bottom", percent: 40 } } });

test("a note to strum inside a sustain", async ({ context, page }) => {
  await captureNoteType(context, page, "Held, then strummed");
});
