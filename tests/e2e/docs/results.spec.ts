import { captureResults, test } from "../support";

test(
  "the results screen after a run",
  {
    annotation: [{ type: "doc", description: "results" }],
  },
  async ({ context, page }) => {
    await captureResults(context, page);
  },
);
