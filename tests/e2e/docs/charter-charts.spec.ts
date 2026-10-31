import { captureCharterCharts, test } from "../support";

test(
  "the chart list over the editor",
  {
    annotation: [{ type: "doc", description: "charter-charts" }],
  },
  async ({ context, page }) => {
    await captureCharterCharts(context, page);
  },
);
