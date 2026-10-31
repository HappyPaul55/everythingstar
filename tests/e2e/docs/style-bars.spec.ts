import { captureNoteType, test } from "../support";

test(
  "the bars style",
  {
    annotation: [
      { type: "doc", description: "style-bars" },
      { type: "doc-crop", description: "mobile:bottom 40%" },
    ],
  },
  async ({ context, page }) => {
    await captureNoteType(context, page, "Note style", "Bars");
  },
);
