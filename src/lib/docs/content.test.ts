import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DOCS_ROOT, docSectionOf } from "./paths";

/**
 * The documentation's own rules, checked where the schema cannot see them.
 *
 * `astro check` proves a document has the four frontmatter fields. This proves
 * the things that would quietly break a reader: two pages claiming the same slot
 * in a sidebar, a relative link GitHub can follow and the site cannot, an image
 * that is not there, a page outside the four sections, or a body that repeats the
 * title the layout already prints.
 */

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

interface Doc {
  id: string;
  path: string;
  text: string;
  body: string;
  fields: Record<string, string>;
}

function frontmatter(text: string): { fields: Record<string, string>; body: string } {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const block = match?.[1] ?? "";
  const fields: Record<string, string> = {};
  for (const line of block.split(/\r?\n/)) {
    const found = line.match(/^([\w-]+):\s*(.*)$/);
    if (!found?.[1]) continue;
    fields[found[1]] = found[2]!.trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return { fields, body: text.slice(match?.[0].length ?? 0) };
}

const docs: Doc[] = readdirSync(DOCS_ROOT, { recursive: true, encoding: "utf8" })
  .map((file) => file.replace(/\\/g, "/"))
  .filter((file) => file.endsWith(".md"))
  .sort()
  .map((file) => {
    const path = resolve(DOCS_ROOT, file);
    const text = readFileSync(path, "utf8");
    const { fields, body } = frontmatter(text);
    return { id: file.slice(0, -".md".length), path, text, body, fields };
  });

describe("the documentation files", () => {
  test("there are pages, and the hub is one of them", () => {
    expect(docs.length).toBeGreaterThan(0);
    expect(docs.some((doc) => doc.id === "README")).toBe(true);
  });

  test("every page says what it is, when it was true and where it sits", () => {
    const problems: string[] = [];
    for (const doc of docs) {
      for (const key of ["title", "description", "updated", "order"]) {
        if (!doc.fields[key]) problems.push(`${doc.id}: missing ${key}`);
      }
      if (doc.fields.title && /[.]$/.test(doc.fields.title)) {
        problems.push(`${doc.id}: title ends with a full stop`);
      }
      if (doc.fields.updated && !/^\d{4}-\d{2}-\d{2}$/.test(doc.fields.updated)) {
        problems.push(`${doc.id}: updated is not YYYY-MM-DD`);
      }
      if (doc.fields.order && !/^\d+$/.test(doc.fields.order)) {
        problems.push(`${doc.id}: order is not a whole number`);
      }
    }
    expect(problems).toEqual([]);
  });

  test("every page is the hub or in one of the four sections", () => {
    const stray = docs
      .filter((doc) => doc.id !== "README" && docSectionOf(doc.id) === null)
      .map((doc) => doc.id);
    expect(stray).toEqual([]);
  });

  test("no two pages share a slot in a section's sidebar", () => {
    const seen = new Map<string, string[]>();
    for (const doc of docs) {
      const section = docSectionOf(doc.id);
      if (!section) continue;
      const key = `${section}:${doc.fields.order}`;
      seen.set(key, [...(seen.get(key) ?? []), doc.id]);
    }
    const clashes = [...seen.entries()].filter(([, ids]) => ids.length > 1);
    expect(clashes).toEqual([]);
  });

  test("two pages do not claim the same search description", () => {
    const seen = new Map<string, string[]>();
    for (const doc of docs) {
      const description = doc.fields.description ?? "";
      seen.set(description, [...(seen.get(description) ?? []), doc.id]);
    }
    expect([...seen.entries()].filter(([, ids]) => ids.length > 1)).toEqual([]);
  });

  test("the title is not repeated as an h1 in the body", () => {
    const repeated = docs
      .map((doc) => ({
        id: doc.id,
        // A `#` at the start of a line is a heading only outside a fenced block;
        // a shell comment in a code sample is not a second title.
        body: doc.body.replace(/```[\s\S]*?```/g, ""),
      }))
      .filter((doc) => /^# /m.test(doc.body))
      .map((doc) => doc.id);
    expect(repeated).toEqual([]);
  });
});

describe("the credits page", () => {
  test("names every credit the sound manifest carries", async () => {
    const manifest = (await Bun.file(
      new URL("../../../public/audio/sounds.json", import.meta.url),
    ).json()) as { sounds: { credit?: string | null }[] };
    const credits = docs.find((doc) => doc.id === "other/credits");
    expect(credits).toBeDefined();
    const missing = [
      ...new Set(
        manifest.sounds
          .map((sound) => sound.credit)
          .filter((credit): credit is string => Boolean(credit)),
      ),
    ].filter((credit) => !credits!.text.includes(credit));
    // The in-game credits are read out of this manifest; the web page repeats the
    // strings so a new pack cannot arrive with its licence unrecorded.
    expect(missing).toEqual([]);
  });
});

describe("the documentation's links", () => {  /** Markdown outside the fences and inline code, where a link is only prose. */
  function linksOf(doc: Doc): { url: string; image: boolean }[] {
    const body = doc.body.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
    return Array.from(
      body.matchAll(/(!?)\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g),
      (match) => ({ image: match[1] === "!", url: match[2]! }),
    );
  }

  test("every relative link points at a page the site builds", () => {
    const problems: string[] = [];
    for (const doc of docs) {
      for (const { url, image } of linksOf(doc)) {
        if (image) continue;
        if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(url)) continue;
        const target = url.split(/[?#]/, 1)[0] ?? "";
        if (!target) continue;
        if (!target.endsWith(".md")) {
          problems.push(`${doc.id}: ${url} — a relative link must be a .md page or a full URL`);
          continue;
        }
        const resolved = resolve(dirname(doc.path), target);
        if (!existsSync(resolved)) {
          problems.push(`${doc.id}: ${url} — no such file`);
          continue;
        }
        const fromDocs = relative(ROOT, resolved).replace(/\\/g, "/");
        if (!fromDocs.startsWith("docs/")) {
          problems.push(`${doc.id}: ${url} — link a file outside docs/ by its full URL`);
          continue;
        }
        const id = fromDocs.slice("docs/".length).replace(/\.md$/, "");
        if (id !== "README" && docSectionOf(id) === null) {
          problems.push(`${doc.id}: ${url} — ${id} is not a page the site builds`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  test("every relative image is there", () => {
    const problems: string[] = [];
    for (const doc of docs) {
      for (const { url, image } of linksOf(doc)) {
        if (!image) continue;
        if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(url)) continue;
        const target = (url.split(/[?#]/, 1)[0] ?? "").replace(/\\/g, "/");
        if (!existsSync(resolve(dirname(doc.path), target))) {
          problems.push(`${doc.id}: ${url} — no such image`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
