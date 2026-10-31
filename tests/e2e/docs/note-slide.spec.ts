import { captureNoteType, test } from "../support";

test(
  "a slide",
  {
    annotation: [
      { type: "doc", description: "note-slide" },
      { type: "doc-crop", description: "mobile:bottom 55%" },
    ],
  },
  async ({ context, page }) => {
    await captureNoteType(context, page, "A slide");
  },
);
