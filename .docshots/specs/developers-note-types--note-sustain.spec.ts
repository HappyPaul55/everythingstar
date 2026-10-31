// Generated from docs/developers/note-types.md:79 by `bun run docs:shots`.
import { docshot } from "../../src/lib/docshots/capture";

docshot(test, { doc: "developers/note-types", id: "note-sustain" });

import { captureNoteType, test } from "./support";

test("a sustain", async ({ context, page }) => {
  await captureNoteType(context, page, "One held note");
});
