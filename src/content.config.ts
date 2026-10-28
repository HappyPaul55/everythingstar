import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { file, glob } from "astro/loaders";

const site = defineCollection({
  loader: file("src/content/site/settings.json"),
  schema: z.object({
    name: z.string(),
    shortName: z.string(),
    tagline: z.string(),
    description: z.string(),
    url: z.url(),
    author: z.string(),
    authorUrl: z.url(),
    repo: z.url(),
    license: z.string(),
    licenseUrl: z.url(),
  }),
});

/**
 * The documentation, written once in `docs/` (the repository root) and read
 * twice: by GitHub, and by the site's `/docs` section.
 *
 * The folder is the section — `players/`, `charters/`, `developers/`, `other/` —
 * and `order` is the place inside it. `README.md` is the hub. `updated` is
 * required because a reference page that does not say when it was true is a page
 * nobody can trust; the layout prints it.
 */
const docs = defineCollection({
  loader: glob({
    pattern: "**/*.md",
    base: "./docs",
    // Keep the path as the id (`players/instruments`), which is what
    // `src/lib/docs/paths.ts` turns into a route. The default slugifier would
    // lowercase `README` and drop the nesting's meaning.
    generateId: ({ entry }) => entry.replace(/\.md$/, ""),
  }),
  schema: z.object({
    title: z.string().min(1),
    description: z.string().min(40).max(200),
    updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    order: z.number().int().min(0),
  }),
});

export const collections = { site, docs };
