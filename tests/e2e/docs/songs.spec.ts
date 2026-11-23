import { captureSongs, test } from "../support";

test(
  "the Songs screen shows its index, rows and now-playing panel",
  {
    annotation: [
      { type: "doc", description: "songs" },
    ],
  },
  async ({ context, page }) => {
    await captureSongs(context, page);
  },
);
