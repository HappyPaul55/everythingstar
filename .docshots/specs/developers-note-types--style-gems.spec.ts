// Generated from docs/developers/note-types.md:160 by `bun run docs:shots`.
import { docshot } from "../../src/lib/docshots/capture";

docshot(test, { doc: "developers/note-types", id: "style-gems" });

import { captureNoteType, test } from "./support";

test("the gems style", async ({ context, page }) => {
  await captureNoteType(context, page, "Note style", "Gems");
});
