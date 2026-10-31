import { captureDuet, test } from "../support";

test(
  "two singers on one song, both parts on the roll",
  {
    annotation: [{ type: "doc", description: "duet" }],
  },
  async ({ context, page }) => {
    await captureDuet(context, page);
  },
);
