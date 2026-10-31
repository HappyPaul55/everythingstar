import { captureController, test } from "../support";

test(
  "one player's controller, open on their device",
  {
    annotation: [{ type: "doc", description: "controller" }],
  },
  async ({ context, page }) => {
    await captureController(context, page);
  },
);
