import { captureNoteType, test } from "../support";

test(
  "a hammer-on",
  {
    annotation: [
      { type: "doc", description: "note-hammer-on" },
      { type: "doc-crop", description: "mobile:bottom 40%" },
    ],
  },
  async ({ context, page }) => {
    await captureNoteType(context, page, "Hammered on");
  },
);
