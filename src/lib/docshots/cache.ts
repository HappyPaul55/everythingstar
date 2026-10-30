import { rmSync } from "node:fs";
import { join } from "node:path";

/**
 * Remove every content cache Astro keeps.
 *
 * The content layer writes its store to `node_modules/.astro` (not only the
 * project's `.astro`), and the documentation plugin's output depends on whether a
 * capture exists: the dev server can compile a page while the images are still
 * being made and cache the placeholder, which a later build would then reuse.
 * Both directories go, so a build compiles against the captures on disk.
 */
export function clearContentCache(): void {
  rmSync(".astro", { recursive: true, force: true });
  rmSync(join("node_modules", ".astro"), { recursive: true, force: true });
}
