import { capturePracticeDialog, test } from "../support";

test(
  "the practice chooser over a paused run",
  {
    annotation: [{ type: "doc", description: "practice-dialog" }],
  },
  async ({ context, page }) => {
    await capturePracticeDialog(context, page);
  },
);
