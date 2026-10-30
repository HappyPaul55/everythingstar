/**
 * Remove Astro's content cache before a build.
 *
 * The cache stores the compiled Markdown, and a documentation page's compiled
 * form names its captures. The dev server compiles while the images may not
 * exist yet — the capture run is about to make them — and a cached placeholder
 * would otherwise be what `astro build` copies into `dist/`. Starting the build
 * from an empty cache makes it compile against the images that are now on disk.
 */
import { rmSync } from "node:fs";

rmSync(".astro", { recursive: true, force: true });
