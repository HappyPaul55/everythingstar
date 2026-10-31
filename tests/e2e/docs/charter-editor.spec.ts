import { captureCharterEditor, test } from "../support";

test(
  "the editor with a note added and selected",
  {
    annotation: [{ type: "doc", description: "charter-editor" }],
  },
  async ({ context, page }) => {
    await captureCharterEditor(context, page);
  },
);
