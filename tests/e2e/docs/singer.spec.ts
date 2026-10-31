import { captureSinger, test } from "../support";

test(
  "a singer's piano roll, a beat into the run",
  {
    annotation: [
      { type: "doc", description: "singer" },
    ],
  },
  async ({ context, page }) => {
    await captureSinger(context, page);
  },
);
