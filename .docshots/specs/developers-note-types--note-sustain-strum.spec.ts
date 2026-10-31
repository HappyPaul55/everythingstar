// Generated from docs/developers/note-types.md:106 by `bun run docs:shots`.
import { docshot } from "../../src/lib/docshots/capture";

docshot(test, { doc: "developers/note-types", id: "note-sustain-strum" });

import { captureNoteType, test } from "./support";

test("a note to strum inside a sustain", async ({ context, page }) => {
  await captureNoteType(context, page, "Held, then strummed");
});
