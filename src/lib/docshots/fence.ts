/**
 * Reading a documentation capture out of a Markdown fence.
 *
 * The authoring rule is a normal fenced code block whose info string starts with
 * `ts` (so GitHub highlights it) and carries `id`, `alt` and optionally
 * `caption`/`viewports` as metadata. Nothing about this is Astro-specific: the
 * same function is the core another project's renderer would use.
 */
import type { ShotCrop } from "./manifest";

export interface FenceShot {
  /** The document's id, e.g. `players/songs`. */
  doc: string;
  id: string;
  alt: string;
  caption?: string;
  /** Variant names from the config; undefined means every variant. */
  viewports?: string[];
  /** Per-variant crops, e.g. a phone shot that keeps the bottom half. */
  crop?: Record<string, ShotCrop>;
  /** The test body, verbatim. */
  body: string;
  /** 1-based line of the opening fence, for an error a human can act on. */
  line: number;
}

export interface FenceResult {
  shots: FenceShot[];
  problems: string[];
}

const LANG = new Set(["ts", "typescript"]);
const ID = /^[a-z][a-z0-9-]*$/;

/**
 * `mobile:bottom 50%, desktop:bottom 70%` → crops by variant.
 *
 * Only the bottom edge exists: a highway falls from the top, so the part worth
 * keeping is the foot of the frame. A variant with no crop keeps the viewport.
 */
function parseCrops(value: string): {
  crops?: Record<string, ShotCrop>;
  problem?: string;
} {
  const crops: Record<string, ShotCrop> = {};
  for (const entry of value.split(",")) {
    const match = /^\s*([a-z][a-z0-9-]*):bottom\s+(\d{1,3})%\s*$/.exec(entry);
    if (!match) {
      return { problem: `crop "${entry.trim()}" must look like mobile:bottom 50%` };
    }
    const percent = Number(match[2]);
    if (percent < 5 || percent > 100) {
      return { problem: `crop "${entry.trim()}" must keep between 5% and 100%` };
    }
    crops[match[1]!] = { edge: "bottom", percent };
  }
  if (Object.keys(crops).length === 0) return { problem: 'crop="" names no variant' };
  return { crops };
}

/** `id="jukebox" alt="…" viewports=desktop,mobile` → a record. */
export function parseFenceMeta(meta: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const match of meta.matchAll(/([A-Za-z][\w-]*)=(?:"([^"]*)"|([^\s"]+))/g)) {
    found[match[1]!] = match[2] ?? match[3] ?? "";
  }
  return found;
}

/**
 * Every capture in one document.
 *
 * A fence without an `id` is an ordinary code block and is left alone; a fence
 * with one is a capture, and is validated rather than skipped, so a typo is a
 * failure instead of a page that quietly loses its picture.
 */
export function fenceShots(markdown: string, doc: string): FenceResult {
  const shots: FenceShot[] = [];
  const problems: string[] = [];
  const lines = markdown.split("\n");
  let open: { marker: string; info: string; line: number } | null = null;
  let body: string[] = [];

  const fail = (line: number, message: string) => problems.push(`${doc}:${line}: ${message}`);

  for (const [index, line] of lines.entries()) {
    const number = index + 1;
    if (!open) {
      const fence = /^(`{3,})(.*)$/.exec(line);
      if (!fence) continue;
      open = { marker: fence[1]!, info: fence[2]!.trim(), line: number };
      body = [];
      continue;
    }

    if (line.trimEnd() === open.marker) {
      const { info, line: at } = open;
      open = null;
      const [lang = "", ...rest] = info.split(/\s+/);
      const meta = parseFenceMeta(rest.join(" "));
      if (!meta.id) continue;

      if (!LANG.has(lang)) {
        fail(at, `a capture must open with \`\`\`ts (or typescript), not "${lang}"`);
        continue;
      }
      if (!ID.test(meta.id)) {
        fail(at, `id "${meta.id}" must be lower-case words joined by -`);
        continue;
      }
      if (!meta.alt || meta.alt.trim().length < 20) {
        fail(at, `"${meta.id}" needs alt="…": the description a screen reader hears`);
        continue;
      }

      const source = body.join("\n");
      const tests = [...source.matchAll(/\btest((?:\.\w+)?)\s*\(/g)];
      if (tests.length !== 1) {
        fail(at, `"${meta.id}" must hold exactly one test(), found ${tests.length}`);
      }
      for (const [, modifier] of tests) {
        if (modifier && modifier !== "") {
          fail(at, `"${meta.id}" must not use test${modifier}(): one capture, one plain test`);
        }
      }
      if (!/\bfrom\s+["']\.\/support["']/.test(source)) {
        fail(at, `"${meta.id}" must import test and its helpers from "./support"`);
      }
      if (/\btest\.afterEach\s*\(/.test(source)) {
        fail(at, `"${meta.id}" must not register hooks: the capture owns the screenshot`);
      }

      const viewports = meta.viewports
        ?.split(",")
        .map((name) => name.trim())
        .filter(Boolean);
      if (meta.viewports !== undefined && (!viewports || viewports.length === 0)) {
        fail(at, `"${meta.id}" has an empty viewports=""`);
      }

      let crop: Record<string, ShotCrop> | undefined;
      if (meta.crop !== undefined) {
        const parsed = parseCrops(meta.crop);
        if (parsed.problem) fail(at, `"${meta.id}" ${parsed.problem}`);
        else crop = parsed.crops;
      }

      shots.push({
        doc,
        id: meta.id,
        alt: meta.alt,
        ...(meta.caption ? { caption: meta.caption } : {}),
        ...(viewports && viewports.length > 0 ? { viewports } : {}),
        ...(crop ? { crop } : {}),
        body: source,
        line: at,
      });
      continue;
    }

    body.push(line);
  }

  if (open) fail(open.line, "this fence is never closed");
  return { shots, problems };
}
