import { captureJukeboxMode, test } from "../support";

test(
  "the Jukebox shows its record, its words and the queue",
  {
    annotation: [{ type: "doc", description: "jukebox-mode" }],
  },
  async ({ context, page }) => {
    await captureJukeboxMode(context, page);
  },
);
