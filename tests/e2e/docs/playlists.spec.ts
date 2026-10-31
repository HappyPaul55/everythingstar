import { capturePlaylists, test } from "../support";

test(
  "the playlists dialog, over the jukebox",
  {
    annotation: [{ type: "doc", description: "playlists" }],
  },
  async ({ context, page }) => {
    await capturePlaylists(context, page);
  },
);
