/**
 * Render the social cards from `scripts/og-card.html`.
 *
 * One source layout, two outputs, because the sizes are the sizes the services
 * ask for rather than two designs:
 *
 * - `public/og-image.png` — **1200×630**, the Open Graph / Twitter card the site
 *   serves (`Seo.astro`), and the picture in the README.
 * - `.github/social-preview.png` — **1280×640**, GitHub's "best display" size for
 *   a repository social preview. It is not a site asset and GitHub does not pick
 *   it up on its own: upload it by hand under Settings → General → Social preview.
 *   It lives outside `public/` so the deploy does not upload a picture only
 *   GitHub shows.
 *
 * The card is `@font-face`d from the self-hosted files beside it and fills the
 * viewport, so a size is a viewport and nothing else. Run with `bun run cards`
 * after a branding change, then bump `OG_IMAGE_VERSION` in `src/lib/seo.ts` if
 * the picture a visitor sees actually changed.
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CARD = join(ROOT, "scripts/og-card.html");

interface Card {
  label: string;
  width: number;
  height: number;
  out: string;
}

const CARDS: Card[] = [
  {
    label: "Open Graph / Twitter",
    width: 1200,
    height: 630,
    out: join(ROOT, "public/og-image.png"),
  },
  {
    label: "GitHub social preview",
    width: 1280,
    height: 640,
    out: join(ROOT, ".github/social-preview.png"),
  },
];

const browser = await chromium.launch();
try {
  for (const card of CARDS) {
    const context = await browser.newContext({
      viewport: { width: card.width, height: card.height },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.goto(pathToFileURL(CARD).href);
    // A card is its type, so the faces have to be in before the shutter.
    await page.evaluate(() => document.fonts.ready);
    mkdirSync(dirname(card.out), { recursive: true });
    await page.screenshot({ path: card.out });
    await context.close();
    console.log(`${card.out} (${card.width}×${card.height}, ${card.label})`);
  }
} finally {
  await browser.close();
}
