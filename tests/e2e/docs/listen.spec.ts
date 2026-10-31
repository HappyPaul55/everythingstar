import { captureListen, test } from "../support";

test(
  "Listen: the song with nobody on stage",
  {
    annotation: [{ type: "doc", description: "listen" }],
  },
  async ({ context, page }) => {
    await captureListen(context, page);
  },
);
