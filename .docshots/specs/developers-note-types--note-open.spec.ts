// Generated from docs/developers/note-types.md:133 by `bun run docs:shots`.
import { docshot } from "../../src/lib/docshots/capture";

docshot(test, { doc: "developers/note-types", id: "note-open" });

import { captureNoteType, test } from "./support";

test("an empty strum", async ({ context, page }) => {
  await captureNoteType(context, page, "Nothing fretted");
});
