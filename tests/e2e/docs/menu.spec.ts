import { captureMenu, test } from "../support";

test(
  "the main menu, where the loop starts",
  {
    annotation: [{ type: "doc", description: "menu" }],
  },
  async ({ context, page }) => {
    await captureMenu(context, page);
  },
);
