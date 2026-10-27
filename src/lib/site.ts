import type { CollectionEntry } from "astro:content";

/**
 * The shape of the single `site/main` settings record, derived from the Zod
 * schema in `src/content.config.ts`. Astro components should type their
 * `settings` prop with this rather than `any`.
 */
export type SiteSettings = CollectionEntry<"site">["data"];
