import { capturePause, test } from "../support";

test(
  "the pause over a run",
  {
    annotation: [{ type: "doc", description: "pause" }],
  },
  async ({ context, page }) => {
    await capturePause(context, page);
  },
);
