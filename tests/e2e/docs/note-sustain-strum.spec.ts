import { captureNoteType, test } from "../support";

test(
  "a note to strum inside a sustain",
  {
    annotation: [
      { type: "doc", description: "note-sustain-strum" },
      { type: "doc-crop", description: "mobile:bottom 40%" },
    ],
  },
  async ({ context, page }) => {
    await captureNoteType(context, page, "Held, then strummed");
  },
);
