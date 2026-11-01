import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import docshots from "../../../docshots.config";

/**
 * The README's pictures are the documentation's captures, not files in the repo.
 *
 * A screenshot is a Playwright test and `[description](shot:id)` in a docs page;
 * GitHub cannot run that rewrite, so the README links the **deployed** copies the
 * e2e shards produce. Nothing under `docs/screenshots/` is committed — the old
 * system left three README images pointing at files that did not exist, which is
 * what this keeps from happening again.
 */
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const README = readFileSync(join(ROOT, "README.md"), "utf8");
const CAPTURE =
  /https:\/\/everythingstar\.happypaul55\.com\/docs\/test-output\/([a-z0-9-]+)\.webp/g;

/** The ids the capture specs declare, from their `doc` annotations. */
function capturedIds(): Set<string> {
  const dir = join(ROOT, "tests/e2e/docs");
  const ids = new Set<string>();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".spec.ts")) continue;
    const text = readFileSync(join(dir, file), "utf8");
    for (const match of text.matchAll(/description:\s*"([a-z0-9-]+)"/g)) {
      ids.add(match[1]!);
    }
  }
  return ids;
}

describe("the README's screenshots", () => {
  const names = [...README.matchAll(CAPTURE)].map((match) => match[1]!);
  const variants = new Set(Object.keys(docshots.variants));

  test("it links the captures rather than a folder nobody generates", () => {
    expect(README).not.toContain("docs/screenshots/");
    expect(names.length).toBeGreaterThan(0);
  });

  test("every image names a shot a test takes, in a configured shape", () => {
    const ids = capturedIds();
    for (const name of names) {
      const at = name.lastIndexOf("-");
      expect(at).toBeGreaterThan(0);
      const id = name.slice(0, at);
      const variant = name.slice(at + 1);
      expect(variants.has(variant)).toBe(true);
      expect(ids.has(id)).toBe(true);
    }
  });
});
