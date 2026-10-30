import { captureNoteType, docshot, test } from "../support";

docshot(test, "note-sustain-hammer", { crop: { mobile: { edge: "bottom", percent: 40 } } });

test("a hammer-on inside a sustain", async ({ context, page }) => {
  await captureNoteType(context, page, "Held, then hammered");
});
