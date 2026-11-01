import { captureStagePause, test } from "../support";

test(
  "a phone's stage carries the pause chip while the song runs",
  {
    annotation: [
      { type: "doc", description: "stage-pause" },
      // The chip exists for a coarse pointer, so this is a phone picture by
      // definition; the desktop project skips it.
      { type: "doc-viewport", description: "mobile" },
    ],
  },
  async ({ context, page }) => {
    await captureStagePause(context, page);
  },
);
