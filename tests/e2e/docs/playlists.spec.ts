import { capturePlaylists, test } from "../support";

test(
  "the playlists dialog, over the song list",
  {
    annotation: [{ type: "doc", description: "playlists" }],
  },
  async ({ context, page }) => {
    await capturePlaylists(context, page);
  },
);
