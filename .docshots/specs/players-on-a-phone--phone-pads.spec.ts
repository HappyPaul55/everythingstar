// Generated from docs/players/on-a-phone.md:10 by `bun run docs:shots`.
import { docshot } from "../../src/lib/docshots/capture";

docshot(test, { doc: "players/on-a-phone", id: "phone-pads" });

test.beforeEach(({}, testInfo) => {
  if (!["mobile"].includes(testInfo.project.name)) testInfo.skip();
});
import { capturePhonePads, test } from "./support";

test("the pads on a portrait phone, a beat into the run", async ({ context, page }) => {
  await capturePhonePads(context, page);
});
