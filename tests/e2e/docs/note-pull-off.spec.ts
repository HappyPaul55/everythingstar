import { captureNoteType, test } from "../support";

test(
  "a pull-off",
  {
    annotation: [
      { type: "doc", description: "note-pull-off" },
      { type: "doc-crop", description: "mobile:bottom 40%" },
    ],
  },
  async ({ context, page }) => {
    await captureNoteType(context, page, "Pulled off");
  },
);
