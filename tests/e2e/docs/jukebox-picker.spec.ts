import { captureJukeboxPicker, test } from "../support";

test(
  "the Jukebox picker: search, play now, play next and the queue",
  {
    annotation: [{ type: "doc", description: "jukebox-picker" }],
  },
  async ({ context, page }) => {
    await captureJukeboxPicker(context, page);
  },
);
