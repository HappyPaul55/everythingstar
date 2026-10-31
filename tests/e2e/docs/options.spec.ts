import { captureOptions, test } from "../support";

test(
  "options: what the game is set to",
  {
    annotation: [{ type: "doc", description: "options" }],
  },
  async ({ context, page }) => {
    await captureOptions(context, page);
  },
);
