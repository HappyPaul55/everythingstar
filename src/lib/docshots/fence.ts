/**
 * Reading a documentation capture out of a Markdown fence.
 *
 * The authoring rule is a normal fenced code block whose info string starts with
 * `ts` (so GitHub highlights it) and carries `id`, `alt` and optionally
 * `caption`/`viewports` as metadata. Nothing about this is Astro-specific: the
 * same function is the core another project's renderer would use.
 */

export interface FenceShot {
  /** The document's id, e.g. `players/songs`. */
  doc: string;
  id: string;
  alt: string;
  caption?: string;
  /** Variant names from the config; undefined means every variant. */
  viewports?: string[];
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

      shots.push({
        doc,
        id: meta.id,
        alt: meta.alt,
        ...(meta.caption ? { caption: meta.caption } : {}),
        ...(viewports && viewports.length > 0 ? { viewports } : {}),
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
