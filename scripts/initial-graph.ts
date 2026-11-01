/**
 * The JavaScript `/play` downloads before the island can mount.
 *
 * Astro writes an island as `component-url` + `renderer-url`, so those are the
 * entries beside the ordinary `<script type="module">` and `modulepreload` tags;
 * following the **static** imports from each one gives the first download. A
 * dynamic `import()` is deliberately not followed: it is the thing being kept out.
 *
 * Shared by the budget gate and the preload writer so the graph that is measured
 * is the graph that is announced to the browser.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

export function initialGraph(distDir: string, htmlPath: string): string[] {
  const html = readFileSync(htmlPath, "utf8");
  const entries = new Set<string>();
  const take = (url: string) => {
    if (url.startsWith("/_astro/")) entries.add(join(distDir, url.slice(1)));
  };
  for (const match of html.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g)) {
    take(match[1] ?? "");
  }
  for (const match of html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g)) {
    take(match[1] ?? "");
  }
  for (const match of html.matchAll(/(?:component-url|renderer-url)="([^"]+)"/g)) {
    take(match[1] ?? "");
  }

  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file) || !existsSync(file)) return;
    seen.add(file);
    const body = readFileSync(file, "utf8");
    for (const match of body.matchAll(/\bfrom\s*"([^"]+)"/g)) {
      const specifier = match[1] ?? "";
      if (specifier.startsWith(".")) visit(join(dirname(file), specifier));
    }
    // A **side-effect** import — `import "./parse.js"` — has no `from`, and a
    // minifier writes it as `import"./parse.js"`. It is part of the initial graph
    // all the same.
    for (const match of body.matchAll(/\bimport\s*"([^"]+)"/g)) {
      const specifier = match[1] ?? "";
      if (specifier.startsWith(".")) visit(join(dirname(file), specifier));
    }
  };
  for (const file of entries) visit(file);
  return [...seen].sort();
}

/** The root-absolute URL a built file is served at. */
export function graphUrl(distDir: string, file: string): string {
  return `/${relative(distDir, file).split(sep).join("/")}`;
}

/** The files a page's own markup already starts, before any import is followed. */
export function namedEntries(html: string): string[] {
  const named = new Set<string>();
  for (const match of html.matchAll(/(?:src|component-url|renderer-url)="(\/_astro\/[^"]+)"/g)) {
    if (match[1]) named.add(match[1]);
  }
  return [...named];
}
