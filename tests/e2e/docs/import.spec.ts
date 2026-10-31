import { captureImport, test } from "../support";

test(
  "a package copied into the browser's storage",
  {
    annotation: [{ type: "doc", description: "import" }],
  },
  async ({ context, page }) => {
    await captureImport(context, page);
  },
);
