// Generated from docs/developers/note-types.md:66 by `bun run docs:shots`.
import { docshot } from "../../src/lib/docshots/capture";

docshot(test, { doc: "developers/note-types", id: "note-pull-off" });

import { captureNoteType, test } from "./support";

test("a pull-off", async ({ context, page }) => {
  await captureNoteType(context, page, "Pulled off");
});
