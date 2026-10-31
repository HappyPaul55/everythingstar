import { captureNoteType, test } from "../support";

test(
  "a chord sustain",
  {
    annotation: [
      { type: "doc", description: "note-chord-sustain" },
      { type: "doc-crop", description: "mobile:bottom 40%" },
    ],
  },
  async ({ context, page }) => {
    await captureNoteType(context, page, "Three held at once");
  },
);
