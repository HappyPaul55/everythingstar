// Generated from docs/developers/note-types.md:38 by `bun run docs:shots`.
import { docshot } from "../../src/lib/docshots/capture";

docshot(test, { doc: "developers/note-types", id: "note-chord" });

import { captureNoteType, test } from "./support";

test("a chord", async ({ context, page }) => {
  await captureNoteType(context, page, "Three at once");
});
