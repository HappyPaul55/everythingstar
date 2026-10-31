import { capturePhonePads, test } from "../support";

test(
  "the pads on a portrait phone, a beat into the run",
  {
    annotation: [
      { type: "doc", description: "phone-pads" },
      { type: "doc-viewport", description: "mobile" },
    ],
  },
  async ({ context, page }) => {
    await capturePhonePads(context, page);
  },
);
