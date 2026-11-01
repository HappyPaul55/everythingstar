/**
 * Announce the game's first download in the document.
 *
 * Astro emits the island's `component-url` and the renderer as runtime imports;
 * the rest of the graph is then discovered import by import, three round trips
 * deep on the built page. Every static import is known at build time, so write it
 * as `<link rel="modulepreload">` before the entry script runs. The files the page
 * already names (`src`, `component-url`, `renderer-url`) are left alone.
 *
 * Run after `astro build` and before `build-sw.ts`, for the game pages only.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { graphUrl, initialGraph, namedEntries } from "./initial-graph";

const DIST = join(process.cwd(), "dist");
const PAGES = ["play.html", "app.html", "open.html", "embed.html"];

for (const page of PAGES) {
  const path = join(DIST, page);
  if (!existsSync(path)) continue;
  const html = readFileSync(path, "utf8");
  const named = new Set(namedEntries(html));
  const urls = initialGraph(DIST, path)
    .map((file) => graphUrl(DIST, file))
    .filter((url) => !named.has(url));
  // Idempotent: a second run replaces the preloads it wrote rather than stacking.
  const clean = html.replace(/[ \t]*<link[^>]*rel="modulepreload"[^>]*>\r?\n?/g, "");
  const links = urls
    .map((url) => `<link rel="modulepreload" href="${url}">`)
    .join("\n");
  if (!clean.includes("</head>")) {
    throw new Error(`${page} has no </head> to preload the graph in`);
  }
  writeFileSync(path, clean.replace("</head>", `${links}\n</head>`));
  console.log(`preload: ${page} names ${urls.length} module(s)`);
}
