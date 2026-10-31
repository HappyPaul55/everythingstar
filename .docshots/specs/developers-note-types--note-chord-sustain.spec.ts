// Generated from docs/developers/note-types.md:92 by `bun run docs:shots`.
import { docshot } from "../../src/lib/docshots/capture";

docshot(test, { doc: "developers/note-types", id: "note-chord-sustain" });

import { captureNoteType, test } from "./support";

test("a chord sustain", async ({ context, page }) => {
  await captureNoteType(context, page, "Three held at once");
});
