import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The two halves of a screenshot, held together.
 *
 * A page says `[description](shot:id)`; a test in `tests/e2e/docs` says
 * `docshot(test, "id")` and takes it. Neither imports the other, so this is the
 * check that the names still meet: a reference with no test is a picture nobody
 * takes, and a test with no reference is work nobody sees.
 */
const ROOT = join(import.meta.dir, "..", "..", "..");
const DOCS = join(ROOT, "docs");
const SPECS = join(ROOT, "tests", "e2e", "docs");

const REFERENCE = /\[([^\]]+)\]\(shot:([a-z][a-z0-9-]*)(?:\s+"[^"]*")?\)/g;
const CAPTURE = /docshot\(\s*test\s*,\s*"([a-z][a-z0-9-]*)"\s*(?:,\s*\{[\s\S]*?\})?\s*\)/g;

function docs(): { id: string; text: string }[] {
  return readdirSync(DOCS, { recursive: true, encoding: "utf8" })
    .map((file) => file.replace(/\\/g, "/"))
    .filter((file) => file.endsWith(".md"))
    .map((file) => ({
      id: file,
      // A fenced example is prose about the syntax, not a reference.
      text: readFileSync(join(DOCS, file), "utf8").replace(/```[\s\S]*?```/g, ""),
    }));
}

function captures(): string[] {
  if (readdirSync(SPECS).length === 0) throw new Error(`${SPECS} is empty`);
  return readdirSync(SPECS)
    .filter((file) => file.endsWith(".spec.ts"))
    .flatMap((file) =>
      Array.from(readFileSync(join(SPECS, file), "utf8").matchAll(CAPTURE), (m) => m[1]!),
    );
}

describe("documentation shots", () => {
  test("every reference has a capture", () => {
    const have = new Set(captures());
    const missing: string[] = [];
    for (const doc of docs()) {
      for (const match of doc.text.matchAll(REFERENCE)) {
        if (!have.has(match[2]!)) missing.push(`${doc.id}: shot:${match[2]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  test("every capture is shown by a page", () => {
    const referenced = new Set(
      docs().flatMap((doc) =>
        Array.from(doc.text.matchAll(REFERENCE), (m) => m[2]!),
      ),
    );
    expect(captures().filter((id) => !referenced.has(id))).toEqual([]);
  });

  test("a reference carries its alt text", () => {
    const empty = docs().flatMap((doc) =>
      Array.from(doc.text.matchAll(REFERENCE), (m) =>
        m[1]!.trim() === "" ? `${doc.id}: shot:${m[2]} has no description` : null,
      ).filter(Boolean),
    );
    expect(empty).toEqual([]);
  });
});
