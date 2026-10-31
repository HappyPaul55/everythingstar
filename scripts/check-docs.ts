/**
 * The documentation gate, run after `bun run build`.
 *
 * The docs are Markdown in `docs/` read twice — by GitHub and by this site — so
 * the things worth checking after a build are the ones the collection and the
 * schema cannot see:
 *
 * - every document has a page at the URL the site promises it (`/docs/...`, or a
 *   notice at the site root), and the hub is `/docs`;
 * - each page is a **paper page**: the site's header and footer, the skip target,
 *   a canonical of its own and a breadcrumb trail;
 * - it ships **no island** — documentation is prose and the site's shell carries
 *   no JavaScript, so a `component-url` here would be a page that hydrates;
 * - every page is in the sitemap (all documentation is indexable);
 * - the **installed game** does not carry the documentation. The offline shell
 *   precaches the game's entries and its notice; a docs page in `sw.js` would be
 *   documentation shipped with the game, which is the one thing it must not do.
 *   `privacy.html` is the exception and is asserted the other way: the game's own
 *   notice must still open offline.
 *
 * The source's own rules — frontmatter, a unique `order`, every relative link and
 * image — are `src/lib/docs/content.test.ts`, which runs in `bun test`.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import docshots from "../docshots.config";
import { DOCS_ROOT, docHref } from "../src/lib/docs/paths";

const ROOT = process.cwd();
const DIST = join(ROOT, "dist");
const SITE = "https://everythingstar.happypaul55.com";
const SHOT_URL = `/${docshots.outDir.replace(/^public\//, "")}/`;
const SHOT_DIR = join(DIST, docshots.outDir.replace(/^public\//, ""));
const failures: string[] = [];

function check(label: string, ok: boolean, detail = ""): void {
  if (ok) {
    console.log(`  ✓ ${label}`);
    return;
  }
  failures.push(detail ? `${label}: ${detail}` : label);
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
}

function read(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/** Every document in `docs/`, by id (`players/songs`), the hub included. */
function docIds(): string[] {
  return readdirSync(DOCS_ROOT, { recursive: true, encoding: "utf8" })
    .map((file) => file.replace(/\\/g, "/"))
    .filter((file) => file.endsWith(".md"))
    .map((file) => file.slice(0, -".md".length))
    .sort();
}

const ids = docIds();
check("the documentation has documents", ids.length > 0, `${ids.length} found`);
check("the hub exists (docs/README.md)", ids.includes("README"));

const built = ids.map((id) => {
  const path = docHref(id);
  const file = join(DIST, path === "/" ? "index.html" : `${path}.html`);
  return { id, path, file };
});

const sitemap = read(join(DIST, "sitemap-0.xml")) ?? "";
const sitemapPaths = new Set(
  Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => new URL(match[1]!).pathname),
);

const sw = read(join(DIST, "sw.js")) ?? "";

/** The file a site path is built at. */
function fileFor(path: string): string {
  const clean = path.replace(/\/$/, "");
  return join(DIST, clean === "" ? "index.html" : `${clean}.html`);
}

console.log("\ndocumentation pages");

const shotFiles = new Set<string>();

for (const page of built) {
  const html = read(page.file);
  check(`${page.path} is built`, html !== null);
  if (!html) continue;

  for (const match of html.matchAll(new RegExp(`${SHOT_URL}([a-z0-9-]+\\.webp)`, "g"))) {
    shotFiles.add(match[1]!);
  }

  check(
    `${page.path} is a paper page`,
    html.includes('id="site-header"') && html.includes('id="main"') && html.includes("<footer"),
  );
  check(
    `${page.path} has its own canonical`,
    html.includes(`<link rel="canonical" href="${SITE}${page.path}">`),
  );
  // A page with no ancestors (the hub, a notice) has no trail to draw.
  if (page.id !== "README" && !page.id.startsWith("other/")) {
    check(`${page.path} has a breadcrumb trail`, html.includes("comment breadcrumbs"));
  }
  check(`${page.path} ships no island`, !html.includes("astro-island"));
  check(`${page.path} carries no component URL`, !html.includes("component-url="));
  // A shot reference with no image is a placeholder; a production build throws
  // before it can write one, so this catches a page built some other way.
  // The class name is quoted so the stylesheet's own `.doc-shot--missing` rule,
  // which is inlined into every page, is not mistaken for the placeholder.
  const placeholder = html.match(/.{0,160}class="doc-shot doc-shot--missing".{0,160}/s);
  check(`${page.path} has every capture`, !placeholder, placeholder?.[0] ?? "");
  check(`${page.path} is in the sitemap`, sitemapPaths.has(page.path));
  // The notices are the only documentation the installed game carries: its own
  // privacy notice must open with no network. Everything else is site-only.
  if (!page.id.startsWith("other/")) {
    check(
      `${page.path} is not in the offline shell`,
      !sw.includes(`"${page.path}.html"`) && !sw.includes(`"${page.path}"`),
    );
  }

  // Every internal anchor in this page must land on an id the target page
  // renders. A cross-page `#section` is the one link the Markdown check cannot
  // see, because the slug is Astro's and only the built HTML has it.
  for (const match of html.matchAll(/href="(\/[^"]*#[^"]+)"/g)) {
    const target = match[1]!;
    const [path = "", hash = ""] = target.split("#");
    const targetHtml = read(fileFor(path || page.path));
    check(
      `${page.path} links ${target}`,
      targetHtml !== null && targetHtml.includes(`id="${hash}"`),
      targetHtml === null ? "the target page is not built" : `no id="${hash}" on that page`,
    );
  }
}

console.log("\ndocumentation screenshots");

check(
  "the pages name at least one screenshot",
  shotFiles.size > 0,
  "every shot reference was a placeholder",
);
for (const file of [...shotFiles].sort()) {
  check(
    `${SHOT_URL}${file} is in the build`,
    existsSync(join(SHOT_DIR, file)),
    "the e2e capture did not produce this file",
  );
}

console.log("\nthe game's own notice");

check(
  "the privacy notice is still a page",
  existsSync(join(DIST, "privacy.html")),
  "dist/privacy.html is the notice the installed game opens offline",
);
check(
  "the notice is still precached by the game",
  sw.includes('"/privacy.html"'),
  "an offline install must still have the privacy notice",
);

if (failures.length > 0) {
  console.error(`\n${failures.length} documentation check(s) failed:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`\ndocumentation: ${built.length} pages, all built and none in the game shell.`);
