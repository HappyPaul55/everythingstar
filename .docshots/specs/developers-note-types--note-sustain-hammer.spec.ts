// Generated from docs/developers/note-types.md:119 by `bun run docs:shots`.
import { docshot } from "../../src/lib/docshots/capture";

docshot(test, { doc: "developers/note-types", id: "note-sustain-hammer" });

import { captureNoteType, test } from "./support";

test("a hammer-on inside a sustain", async ({ context, page }) => {
  await captureNoteType(context, page, "Held, then hammered");
});
