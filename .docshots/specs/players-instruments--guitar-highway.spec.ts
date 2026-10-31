// Generated from docs/players/instruments.md:10 by `bun run docs:shots`.
import { docshot } from "../../src/lib/docshots/capture";

docshot(test, { doc: "players/instruments", id: "guitar-highway" });

test.beforeEach(({}, testInfo) => {
  if (!["desktop"].includes(testInfo.project.name)) testInfo.skip();
});
import { captureGuitarHighway, test } from "./support";

test("one guitar player's highway, a beat into the run", async ({ context, page }) => {
  await captureGuitarHighway(context, page);
});
