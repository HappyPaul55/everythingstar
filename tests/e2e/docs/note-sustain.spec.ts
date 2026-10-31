import { captureNoteType, test } from "../support";

test(
  "a sustain",
  {
    annotation: [
      { type: "doc", description: "note-sustain" },
      { type: "doc-crop", description: "mobile:bottom 40%" },
    ],
  },
  async ({ context, page }) => {
    await captureNoteType(context, page, "One held note");
  },
);
