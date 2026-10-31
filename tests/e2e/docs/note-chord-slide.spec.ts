import { captureNoteType, test } from "../support";

test(
  "a chord that crosses",
  {
    annotation: [
      { type: "doc", description: "note-chord-slide" },
      { type: "doc-crop", description: "mobile:bottom 55%" },
    ],
  },
  async ({ context, page }) => {
    await captureNoteType(context, page, "A chord that crosses");
  },
);
