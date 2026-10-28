import { expect, test } from "@playwright/test";
import { OG_IMAGE_VERSION } from "../../src/lib/seo";

/**
 * The head of every page, as a crawler and a social client read it.
 *
 * `src/lib/seo.test.ts` proves the copy: titles are unique and short enough to
 * show, descriptions say something and are unique. This is the other half — that
 * each page actually emits that metadata, once, with a canonical of its own and
 * a graph whose ids resolve.
 *
 * It reads the dev server's HTML with Playwright's request client rather than
 * loading the pages in a browser: the head is rendered on the server, and the
 * island adds nothing to it. That keeps the check about the document (and does
 * not make a metadata failure depend on the game's network). It also means the
 * spec runs in the same command as the rest of the browser suite without making
 * `bun test` wait for a build.
 *
 * The titles are matched by fragment on purpose: the copy belongs to the
 * dictionary test, and this spec should not fail twice for one wording change.
 * What is pinned here is the wiring — the brand, the play intent, the error page
 * saying it is an error, and which pages are indexable.
 *
 * The rest of the decision lives where it costs nothing: the sitemap is a build
 * artifact and `check:pwa.ts` holds it to the same list, and the game entries
 * (`/app`, `/embed`, `/open`) are read out of `dist/` by the same gate, which
 * checks their refusal and the absence of a canonical and a social card.
 */

const SITE = "https://everythingstar.happypaul55.com";
const OG_IMAGE = `${SITE}/og-image.png?v=${OG_IMAGE_VERSION}`;

interface ExpectedPage {
  path: string;
  canonical: string;
  titleHas: string[];
  indexable: boolean;
  status: number;
}

const PAGES: ExpectedPage[] = [
  {
    path: "/",
    canonical: `${SITE}/`,
    titleHas: ["EverythingStar", "browser rhythm game"],
    indexable: true,
    status: 200,
  },
  {
    path: "/play",
    canonical: `${SITE}/play`,
    titleHas: ["Play EverythingStar", "rhythm game"],
    indexable: true,
    status: 200,
  },
  {
    path: "/docs",
    canonical: `${SITE}/docs`,
    titleHas: ["Documentation", "EverythingStar"],
    indexable: true,
    status: 200,
  },
  {
    path: "/privacy",
    canonical: `${SITE}/privacy`,
    titleHas: ["Privacy Policy", "EverythingStar"],
    indexable: true,
    status: 200,
  },
  {
    path: "/404",
    canonical: `${SITE}/404`,
    titleHas: ["Page not found", "EverythingStar"],
    indexable: false,
    status: 404,
  },
];

const REQUIRED_OG = [
  "og:type",
  "og:site_name",
  "og:title",
  "og:description",
  "og:url",
  "og:locale",
  "og:image",
  "og:image:type",
  "og:image:width",
  "og:image:height",
  "og:image:secure_url",
  "og:image:alt",
];

const REQUIRED_TWITTER = [
  "twitter:card",
  "twitter:title",
  "twitter:description",
  "twitter:image",
  "twitter:image:alt",
];

/** The attributes of one tag. The head's values are plain — no escaped quotes. */
function attributes(source: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const match of source.matchAll(/([\w:-]+)="([^"]*)"/g)) {
    found[match[1]!] = match[2]!;
  }
  return found;
}

/** Every `<name …>` in the head, as attribute records. */
function tags(head: string, name: string): Record<string, string>[] {
  return Array.from(head.matchAll(new RegExp(`<${name}\\b([^>]*)>`, "gi")), (match) =>
    attributes(match[1]!),
  );
}

/** The attribute values of one meta, by either `name` or `property`. */
function metaValues(metas: Record<string, string>[], key: string): string[] {
  return metas
    .filter((meta) => meta.name === key || meta.property === key)
    .map((meta) => meta.content ?? "");
}

interface Entity {
  "@type": string;
  "@id"?: string;
  url?: string;
  name?: string;
  description?: string;
  image?: string;
  codeRepository?: string;
  license?: string;
  itemListElement?: { item?: string }[];
}

test("every page has one coherent set of head metadata", async ({ request }) => {
  const seenTitles = new Set<string>();
  const seenDescriptions = new Set<string>();

  for (const expected of PAGES) {
    const response = await request.get(expected.path);
    expect(response.status(), expected.path).toBe(expected.status);
    const html = await response.text();
    const head = html.slice(0, html.indexOf("</head>"));

    // One title, one description, one canonical: a duplicated tag is a conflict
    // a crawler has to guess at.
    expect(html.match(/<html[^>]*\slang="([^"]*)"/)?.[1], expected.path).toBe("en-GB");
    const titles = Array.from(head.matchAll(/<title>([\s\S]*?)<\/title>/g), (match) => match[1]!);
    expect(titles.length, expected.path).toBe(1);
    const title = titles[0]!;
    expect(title.length, expected.path).toBeGreaterThan(0);
    expect(title.length, expected.path).toBeLessThanOrEqual(60);
    for (const fragment of expected.titleHas) {
      expect(title, expected.path).toContain(fragment);
    }
    seenTitles.add(title);

    const metas = tags(head, "meta");
    const links = tags(head, "link");

    const descriptions = metaValues(metas, "description");
    expect(descriptions.length, expected.path).toBe(1);
    const description = descriptions[0]!;
    expect(description.length, expected.path).toBeGreaterThanOrEqual(120);
    expect(description.length, expected.path).toBeLessThanOrEqual(160);
    seenDescriptions.add(description);

    const canonicals = links.filter((link) => link.rel === "canonical").map((link) => link.href);
    expect(canonicals, expected.path).toEqual([expected.canonical]);

    // Indexability is a decision per page, and the sitemap filter in
    // astro.config.mjs follows it. `/404` is noindex. The game entries `/app`,
    // `/embed` and `/open` are actions and install points rather than pages to
    // find in a search, and their head is the game-only `GameLayout` rather than
    // this one; `check:pwa.ts` holds them and the sitemap to that.
    const robots = metaValues(metas, "robots");
    expect(robots.length, expected.path).toBe(1);
    expect(robots[0], expected.path).toContain(expected.indexable ? "index" : "noindex");
    if (expected.indexable) expect(robots[0], expected.path).not.toContain("noindex");

    // Open Graph: every required tag once, nothing empty, and the same URL the
    // canonical names.
    const ogKeys = metas
      .map((meta) => meta.property)
      .filter((key): key is string => key?.startsWith("og:") ?? false);
    expect(new Set(ogKeys).size, `${expected.path} has no duplicate og tag`).toBe(ogKeys.length);
    for (const key of REQUIRED_OG) {
      const values = metaValues(metas, key);
      expect(values.length, `${expected.path} ${key}`).toBe(1);
      expect(values[0], `${expected.path} ${key}`).not.toBe("");
    }
    expect(metaValues(metas, "og:type")[0], expected.path).toBe("website");
    expect(metaValues(metas, "og:site_name")[0], expected.path).toBe("EverythingStar");
    expect(metaValues(metas, "og:title")[0], expected.path).toBe(title);
    expect(metaValues(metas, "og:description")[0], expected.path).toBe(description);
    expect(metaValues(metas, "og:url")[0], expected.path).toBe(expected.canonical);
    expect(metaValues(metas, "og:locale")[0], expected.path).toBe("en_GB");
    expect(metaValues(metas, "og:image")[0], expected.path).toBe(OG_IMAGE);
    expect(metaValues(metas, "og:image:secure_url")[0], expected.path).toBe(OG_IMAGE);
    expect(metaValues(metas, "og:image:width")[0], expected.path).toBe("1200");
    expect(metaValues(metas, "og:image:height")[0], expected.path).toBe("630");
    expect(metaValues(metas, "og:image:type")[0], expected.path).toBe("image/png");

    // Twitter: the same card everywhere, and no invented account.
    const twitterKeys = metas
      .map((meta) => meta.name)
      .filter((key): key is string => key?.startsWith("twitter:") ?? false);
    expect(new Set(twitterKeys).size, `${expected.path} has no duplicate twitter tag`).toBe(
      twitterKeys.length,
    );
    for (const key of REQUIRED_TWITTER) {
      const values = metaValues(metas, key);
      expect(values.length, `${expected.path} ${key}`).toBe(1);
      expect(values[0], `${expected.path} ${key}`).not.toBe("");
    }
    expect(metaValues(metas, "twitter:card")[0], expected.path).toBe("summary_large_image");
    expect(metaValues(metas, "twitter:title")[0], expected.path).toBe(title);
    expect(metaValues(metas, "twitter:description")[0], expected.path).toBe(description);
    expect(metaValues(metas, "twitter:image")[0], expected.path).toBe(OG_IMAGE);
    expect(metaValues(metas, "twitter:site"), expected.path).toEqual([]);
    expect(metaValues(metas, "twitter:creator"), expected.path).toEqual([]);

    // JSON-LD: one graph, one of each id, and a WebPage only where the page is
    // offered to a crawler.
    const scripts = Array.from(
      head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),
      (match) => match[1]!,
    );
    expect(scripts.length, expected.path).toBe(1);
    const graph = JSON.parse(scripts[0]!) as {
      "@context": string;
      "@graph": Entity[];
    };
    expect(graph["@context"], expected.path).toBe("https://schema.org");
    const entities = graph["@graph"];
    const ids = entities.flatMap((entity) => (entity["@id"] ? [entity["@id"]] : []));
    expect(new Set(ids).size, `${expected.path} ids are unique`).toBe(ids.length);

    const types = entities.map((entity) => entity["@type"]);
    expect(types, expected.path).toEqual(
      expect.arrayContaining(["Person", "VideoGame", "WebSite"]),
    );
    if (expected.indexable) {
      expect(types, expected.path).toContain("WebPage");
      const webPage = entities.find((entity) => entity["@type"] === "WebPage")!;
      expect(webPage["@id"], expected.path).toBe(`${expected.canonical}#webpage`);
      expect(webPage.url, expected.path).toBe(expected.canonical);
      expect(webPage.name, expected.path).toBe(title);
      expect(webPage.description, expected.path).toBe(description);
    } else {
      expect(types, expected.path).not.toContain("WebPage");
    }

    // The notices and the docs are the pages with a trail, and its items are
    // real URLs.
    const crumbs = entities.find((entity) => entity["@type"] === "BreadcrumbList");
    if (expected.path === "/privacy" || expected.path === "/docs") {
      expect(crumbs, expected.path).toBeDefined();
      expect(crumbs!.itemListElement?.length, expected.path).toBeGreaterThan(0);
      for (const item of crumbs!.itemListElement ?? []) {
        expect(() => new URL(item.item ?? ""), expected.path).not.toThrow();
      }
    } else {
      expect(crumbs, expected.path).toBeUndefined();
    }

    // Every URL the graph names is absolute — no relative path can leak into
    // JSON-LD and resolve against whatever reads it.
    for (const entity of entities) {
      for (const key of ["@id", "url", "image", "codeRepository", "license"] as const) {
        const value = entity[key];
        if (typeof value !== "string") continue;
        expect(() => new URL(value), `${expected.path} ${key}`).not.toThrow();
      }
    }
  }

  // What makes a result identifiable is that no two pages say the same thing.
  expect(seenTitles.size, "titles are unique").toBe(PAGES.length);
  expect(seenDescriptions.size, "descriptions are unique").toBe(PAGES.length);
});
