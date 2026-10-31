import { captureJukebox, test } from "../support";

test(
  "the jukebox shows its index, rows and now-playing panel",
  {
    annotation: [
      { type: "doc", description: "jukebox" },
      { type: "doc-viewport", description: "desktop" },
    ],
  },
  async ({ context, page }) => {
    await captureJukebox(context, page);
  },
);
