import { captureNoteType, docshot, test } from "../support";

docshot(test, "note-pull-off", { crop: { mobile: { edge: "bottom", percent: 40 } } });

test("a pull-off", async ({ context, page }) => {
  await captureNoteType(context, page, "Pulled off");
});
