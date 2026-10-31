// Generated from docs/developers/note-types.md:25 by `bun run docs:shots`.
import { docshot } from "../../src/lib/docshots/capture";

docshot(test, { doc: "developers/note-types", id: "note-single" });

import { captureNoteType, test } from "./support";

test("a single note", async ({ context, page }) => {
  await captureNoteType(context, page, "One note");
});
