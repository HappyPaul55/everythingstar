import { captureGuitarHighway, test } from "../support";

test(
  "one guitar player's highway, a beat into the run",
  {
    annotation: [
      { type: "doc", description: "guitar-highway" },
    ],
  },
  async ({ context, page }) => {
    await captureGuitarHighway(context, page);
  },
);
