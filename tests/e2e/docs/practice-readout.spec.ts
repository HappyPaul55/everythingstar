import { capturePracticeReadout, test } from "../support";

test(
  "a practice run at 80%, looping",
  {
    annotation: [{ type: "doc", description: "practice-readout" }],
  },
  async ({ context, page }) => {
    await capturePracticeReadout(context, page);
  },
);
