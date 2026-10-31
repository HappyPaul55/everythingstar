import { captureTyping, test } from "../support";

test(
  "a typist's read-along",
  {
    annotation: [{ type: "doc", description: "typing" }],
  },
  async ({ context, page }) => {
    await captureTyping(context, page);
  },
);
