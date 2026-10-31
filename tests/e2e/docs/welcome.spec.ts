import { captureWelcome, test } from "../support";

test(
  "the way in: the poster and its one button",
  {
    annotation: [{ type: "doc", description: "welcome" }],
  },
  async ({ context, page }) => {
    await captureWelcome(context, page);
  },
);
