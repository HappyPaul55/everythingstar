import { captureNoteType, docshot, test } from "../support";

docshot(test, "note-chord-sustain", { crop: { mobile: { edge: "bottom", percent: 40 } } });

test("a chord sustain", async ({ context, page }) => {
  await captureNoteType(context, page, "Three held at once");
});
