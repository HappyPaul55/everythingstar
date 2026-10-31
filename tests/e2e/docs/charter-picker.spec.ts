import { captureCharterPicker, test } from "../support";

test(
  "the charter's picker",
  {
    annotation: [{ type: "doc", description: "charter-picker" }],
  },
  async ({ context, page }) => {
    await captureCharterPicker(context, page);
  },
);
