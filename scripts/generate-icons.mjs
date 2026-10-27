import { promises as fs } from "node:fs";
import path from "node:path";
import { favicons } from "favicons";

const root = process.cwd();
const source = path.join(root, "public", "icons", "brand-mark.svg");
const maskable = path.join(root, "public", "icons", "brand-maskable.svg");
const outDir = path.join(root, "public", "icons");

const response = await favicons(source, {
  path: "/icons",
  appName: "EverythingStar",
  appShortName: "EverythingStar",
  appDescription:
    "A free browser rhythm game: instruments, lyric typing and karaoke on one stage.",
  developerName: "HappyPaul55",
  background: "#0C0D0A",
  theme_color: "#0C0D0A",
  display: "standalone",
  orientation: "any",
  scope: "/",
  // The installed web app is the game-only page. The public site keeps
  // /play (with its header/footer) for search and the site itself.
  start_url: "/app",
  lang: "en-GB",
  // A maskable icon needs the brand inside the 80% safe zone; the favicons
  // package renders the padded source into `android-chrome-maskable-*`.
  manifestMaskable: maskable,
  icons: {
    android: true,
    appleIcon: true,
    appleStartup: false,
    favicons: true,
    windows: true,
    yandex: false,
  },
});

for (const image of response.images) {
  await fs.writeFile(path.join(outDir, image.name), image.contents);
}
let written = 0;
for (const file of response.files) {
  // `public/manifest.webmanifest` is hand-authored: it carries `id`,
  // `display_override`, shortcuts and link handling the generator does not model,
  // so its own manifest is deliberately not written.
  if (file.name === "manifest.webmanifest") continue;
  await fs.writeFile(path.join(outDir, file.name), file.contents);
  written += 1;
}

console.log(
  `Generated ${response.images.length} images and ${written} files in public/icons.`,
);
