import { captureNoteType, test } from "../support";

test(
  "the arrows style",
  {
    annotation: [
      { type: "doc", description: "style-arrows" },
      { type: "doc-crop", description: "mobile:bottom 40%" },
    ],
  },
  async ({ context, page }) => {
    await captureNoteType(context, page, "Note style", "Arrows");
  },
);
