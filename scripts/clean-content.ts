/**
 * Remove Astro's content caches before a build.
 *
 * The cache stores the compiled Markdown, and a documentation page's compiled
 * form depends on whether its capture exists. The dev server compiles while the
 * images may not exist yet — the capture run is about to make them — and a cached
 * placeholder would otherwise be what `astro build` copies into `dist/`.
 */
import { clearContentCache } from "../src/lib/docshots/cache";

clearContentCache();
