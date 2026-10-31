import { captureNoteType, test } from "../support";

test(
  "a hammer-on inside a sustain",
  {
    annotation: [
      { type: "doc", description: "note-sustain-hammer" },
      { type: "doc-crop", description: "mobile:bottom 40%" },
    ],
  },
  async ({ context, page }) => {
    await captureNoteType(context, page, "Held, then hammered");
  },
);
