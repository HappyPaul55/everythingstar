import { captureNoteType, test } from "../support";

test(
  "the gems style",
  {
    annotation: [
      { type: "doc", description: "style-gems" },
      { type: "doc-crop", description: "mobile:bottom 40%" },
    ],
  },
  async ({ context, page }) => {
    await captureNoteType(context, page, "Note style", "Gems");
  },
);
