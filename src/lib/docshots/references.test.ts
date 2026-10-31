import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import docshots from "../../../docshots.config";

/**
 * The two halves of a screenshot, held together.
 *
 * A page says `[description](shot:id)`; a test in `tests/e2e/docs` says
 * `annotation: [{ type: "doc", description: "id" }]`. Neither imports the other,
 * so this is the check that the names still meet: a reference with no test is a
 * picture nobody takes, and a test with no reference is work nobody sees.
 */
const ROOT = join(import.meta.dir, "..", "..", "..");
const DOCS = join(ROOT, "docs");
const SPECS = join(ROOT, "tests", "e2e", "docs");

const REFERENCE = /\[([^\]]+)\]\(shot:([a-z][a-z0-9-]*)(?:\s+"[^"]*")?\)/g;
const CAPTURE = /type:\s*"doc",\s*description:\s*"([a-z][a-z0-9-]*)"/g;
const VIEWPORT = /type:\s*"doc-viewport",\s*description:\s*"([^"]+)"/;

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
  return readdirSync(SPECS)
    .filter((file) => file.endsWith(".spec.ts"))
    .flatMap((file) =>
      Array.from(readFileSync(join(SPECS, file), "utf8").matchAll(CAPTURE), (m) => m[1]!),
    );
}

/** The shots whose spec narrows the variants, by the variants it names. */
function narrowed(): Record<string, string[]> {
  const found: Record<string, string[]> = {};
  for (const file of readdirSync(SPECS).filter((name) => name.endsWith(".spec.ts"))) {
    const text = readFileSync(join(SPECS, file), "utf8");
    const id = new RegExp(CAPTURE.source).exec(text)?.[1];
    const viewports = text.match(VIEWPORT)?.[1];
    if (!id || !viewports) continue;
    found[id] = viewports.split(",").map((name) => name.trim()).sort();
  }
  return found;
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

  test("a narrowed shot is declared in docshots.config.ts", () => {
    const declared = Object.fromEntries(
      Object.entries(docshots.shots ?? {}).map(([id, variants]) => [
        id,
        [...variants].sort(),
      ]),
    );
    expect(narrowed()).toEqual(declared);
  });
});
