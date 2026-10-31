import { captureNoteType, test } from "../support";

test(
  "a chord",
  {
    annotation: [
      { type: "doc", description: "note-chord" },
      { type: "doc-crop", description: "mobile:bottom 40%" },
    ],
  },
  async ({ context, page }) => {
    await captureNoteType(context, page, "Three at once");
  },
);
