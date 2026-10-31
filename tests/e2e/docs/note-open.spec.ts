import { captureNoteType, test } from "../support";

test(
  "an empty strum",
  {
    annotation: [
      { type: "doc", description: "note-open" },
      { type: "doc-crop", description: "mobile:bottom 40%" },
    ],
  },
  async ({ context, page }) => {
    await captureNoteType(context, page, "Nothing fretted");
  },
);
