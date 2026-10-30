import { captureNoteType, docshot, test } from "../support";

docshot(test, "note-sustain", { crop: { mobile: { edge: "bottom", percent: 40 } } });

test("a sustain", async ({ context, page }) => {
  await captureNoteType(context, page, "One held note");
});
