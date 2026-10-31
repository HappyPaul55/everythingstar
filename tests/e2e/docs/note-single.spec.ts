import { captureNoteType, test } from "../support";

test(
  "a single note",
  {
    annotation: [
      { type: "doc", description: "note-single" },
      { type: "doc-crop", description: "mobile:bottom 40%" },
    ],
  },
  async ({ context, page }) => {
    await captureNoteType(context, page, "One note");
  },
);
