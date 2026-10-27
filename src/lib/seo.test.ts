import { describe, expect, test } from "bun:test";
import { translator } from "../i18n";
import {
  canonicalUrl,
  collapse,
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  normalisePath,
  pageTitle,
  TITLE_SOFT_LIMIT,
} from "./seo";

const t = translator("en");
const SITE = {
  name: "EverythingStar",
  url: "https://everythingstar.happypaul55.com",
};

/**
 * The legal page's title and description are frontmatter rather than dictionary
 * entries, because the notice is content. Read it the way a reader would — as
 * text — so the test needs no build and no Astro loader.
 */
function frontmatter(markdown: string): Record<string, string> {
  const block = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
  const fields: Record<string, string> = {};
  for (const line of block.split(/\r?\n/)) {
    const found = line.match(/^([\w-]+):\s*(.*)$/);
    if (found?.[1]) fields[found[1]] = found[2]!.trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return fields;
}

const privacy = frontmatter(
  await Bun.file(new URL("../content/legal/privacy.md", import.meta.url)).text(),
);

/** The four pages' metadata, assembled exactly as their pages assemble it. */
const PAGES = [
  {
    name: "home",
    title: t("seo.titleHome", { name: SITE.name }),
    description: t("seo.descriptionHome"),
  },
  {
    name: "play",
    title: t("seo.titlePlay", { name: SITE.name }),
    description: t("seo.descriptionPlay"),
  },
  {
    name: "privacy",
    title: pageTitle(privacy.title ?? "", SITE.name),
    description: privacy.description ?? "",
  },
  {
    name: "404",
    title: pageTitle(t("notFound.title"), SITE.name),
    description: t("seo.descriptionNotFound"),
  },
];

describe("normalisePath", () => {
  test("the root keeps its one slash", () => {
    expect(normalisePath("/")).toBe("/");
    expect(normalisePath("")).toBe("/");
  });

  test("a page path is rooted and has no trailing slash", () => {
    expect(normalisePath("play")).toBe("/play");
    expect(normalisePath("/play/")).toBe("/play");
    expect(normalisePath("play///")).toBe("/play");
  });

  test("a build-time `.html` is not part of the URL", () => {
    expect(normalisePath("/play.html")).toBe("/play");
    expect(normalisePath("/index.html")).toBe("/");
  });

  test("a query or hash never reaches the canonical", () => {
    expect(normalisePath("/play?dev=1")).toBe("/play");
    expect(normalisePath("/privacy#cookies")).toBe("/privacy");
  });
});

describe("canonicalUrl", () => {
  test("every page gets one absolute URL", () => {
    expect(canonicalUrl(SITE.url, "/")).toBe(`${SITE.url}/`);
    expect(canonicalUrl(SITE.url, "/index.html")).toBe(`${SITE.url}/`);
    expect(canonicalUrl(SITE.url, "/play")).toBe(`${SITE.url}/play`);
    expect(canonicalUrl(`${SITE.url}/`, "/privacy/")).toBe(`${SITE.url}/privacy`);
    expect(canonicalUrl(SITE.url, "/404")).toBe(`${SITE.url}/404`);
  });
});

describe("pageTitle", () => {
  test("suffixes the brand once", () => {
    expect(pageTitle("Privacy Policy", SITE.name)).toBe("Privacy Policy — EverythingStar");
  });

  test("does not repeat a brand the page already names", () => {
    expect(pageTitle("EverythingStar — browser rhythm game", SITE.name)).toBe(
      "EverythingStar — browser rhythm game",
    );
  });

  test("a nameless page is the brand, not a dangling dash", () => {
    expect(pageTitle("  ", SITE.name)).toBe(SITE.name);
    expect(pageTitle("Privacy Policy", "")).toBe("Privacy Policy");
  });

  test("collapses the whitespace a template left behind", () => {
    expect(collapse(" a\n  b ")).toBe("a b");
    expect(pageTitle(" Page\n name ", SITE.name)).toBe("Page name — EverythingStar");
  });
});

describe("the four pages' metadata", () => {
  test("every title is unique, names the game and fits a result", () => {
    const titles = PAGES.map((page) => page.title);
    expect(new Set(titles).size).toBe(titles.length);

    for (const page of PAGES) {
      expect(page.title, page.name).toContain(SITE.name);
      expect(page.title.length, page.name).toBeGreaterThan(0);
      expect(page.title.length, page.name).toBeLessThanOrEqual(TITLE_SOFT_LIMIT);
      // A dictionary placeholder that never got filled is not a title.
      expect(page.title, page.name).not.toMatch(/\{[^}]+\}/);
    }
  });

  test("every description is unique, current and the right length", () => {
    const descriptions = PAGES.map((page) => page.description);
    expect(new Set(descriptions).size).toBe(descriptions.length);

    for (const page of PAGES) {
      expect(page.description.length, page.name).toBeGreaterThanOrEqual(DESCRIPTION_MIN);
      expect(page.description.length, page.name).toBeLessThanOrEqual(DESCRIPTION_MAX);
      expect(page.description, page.name).not.toMatch(/\{[^}]+\}/);
    }
  });

  test("the home page does not reuse the site's own description", () => {
    const home = PAGES.find((page) => page.name === "home")!;
    expect(home.description).not.toBe(t("site.description"));
  });

  test("the home title leads with the brand and names the genre", () => {
    const home = PAGES.find((page) => page.name === "home")!;
    expect(home.title.startsWith(SITE.name)).toBe(true);
    expect(home.title).toContain("browser rhythm game");
  });
});
