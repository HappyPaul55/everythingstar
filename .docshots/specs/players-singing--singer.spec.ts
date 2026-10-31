// Generated from docs/players/singing.md:10 by `bun run docs:shots`.
import { docshot } from "../../src/lib/docshots/capture";

docshot(test, { doc: "players/singing", id: "singer" });

test.beforeEach(({}, testInfo) => {
  if (!["desktop"].includes(testInfo.project.name)) testInfo.skip();
});
import { captureSinger, test } from "./support";

test("a singer's piano roll, a beat into the run", async ({ context, page }) => {
  await captureSinger(context, page);
});
