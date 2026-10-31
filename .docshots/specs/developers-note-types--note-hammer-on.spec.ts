// Generated from docs/developers/note-types.md:52 by `bun run docs:shots`.
import { docshot } from "../../src/lib/docshots/capture";

docshot(test, { doc: "developers/note-types", id: "note-hammer-on" });

import { captureNoteType, test } from "./support";

test("a hammer-on", async ({ context, page }) => {
  await captureNoteType(context, page, "Hammered on");
});
