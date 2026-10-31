import { captureBandScreen, test } from "../support";

test(
  "the band screen with three players seated",
  {
    annotation: [
      { type: "doc", description: "band-screen" },
    ],
  },
  async ({ context, page }) => {
    await captureBandScreen(context, page);
  },
);
