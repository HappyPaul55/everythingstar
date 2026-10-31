// Generated from docs/developers/note-types.md:170 by `bun run docs:shots`.
import { docshot } from "../../src/lib/docshots/capture";

docshot(test, { doc: "developers/note-types", id: "style-arrows" });

import { captureNoteType, test } from "./support";

test("the arrows style", async ({ context, page }) => {
  await captureNoteType(context, page, "Note style", "Arrows");
});
