// Generated from docs/developers/note-types.md:150 by `bun run docs:shots`.
import { docshot } from "../../src/lib/docshots/capture";

docshot(test, { doc: "developers/note-types", id: "style-bars" });

import { captureNoteType, test } from "./support";

test("the bars style", async ({ context, page }) => {
  await captureNoteType(context, page, "Note style", "Bars");
});
