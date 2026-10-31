import { defineDocshots } from "./src/lib/docshots/config";

/**
 * The captures the documentation needs, and the screen they are taken on.
 *
 * One entry is one Playwright project and one label in the built page, so the
 * selector a reader sees and the browser a shot was taken in cannot disagree.
 * The list is deliberately short: every entry multiplies the capture run.
 */
export default defineDocshots({
  // Written by `bun run docs:shots` and ignored by Git: the images are a build
  // artefact, not source. Under `public/` so the page can name the file directly.
  outDir: "public/docs/test-output",
  quality: 82,
  variants: {
    desktop: { viewport: { width: 1440, height: 900 } },
    mobile: {
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      deviceScaleFactor: 2,
    },
  },
});
