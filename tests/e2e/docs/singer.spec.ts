import { captureSinger, docshot, test } from "../support";

docshot(test, "singer", { viewports: ["desktop"] });

test("a singer's piano roll, a beat into the run", async ({ context, page }) => {
  await captureSinger(context, page);
});
