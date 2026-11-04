/**
 * After a static build, make the HTML safe for a CSP without `'unsafe-inline'`:
 *
 * 1. Rewrite every inline `style="..."` attribute into a class rule in a single
 *    `<style>` block at the end of `<head>`. Shiki (the documentation's syntax
 *    highlighter) is the only source of these today: it colours each token with
 *    an inline style, which a strict `style-src` blocks.
 * 2. Add CSP hashes for the inline `<script>` and `<style>` elements that remain
 *    (Astro's island runtime and the PWA listeners). The deployed `_headers`
 *    then allows exactly those blocks without `'unsafe-inline'`.
 *
 * Runs after `public/_headers` is copied into `dist/`.
 */

import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const sha256 = (value) =>
  `'sha256-${createHash("sha256").update(value).digest("base64")}'`;

/** A short, stable class name for one declaration string. */
const className = (value) =>
  `csp-s-${createHash("sha1").update(value).digest("hex").slice(0, 10)}`;

async function htmlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await htmlFiles(path)));
    else if (entry.name.endsWith(".html")) files.push(path);
  }
  return files;
}

/**
 * Move every `style` attribute on a tag into a class and return the CSS those
 * classes need. Definitions are collected in first-seen order, so the output is
 * stable from build to build.
 */
function externaliseStyleAttributes(html) {
  const declarations = new Map();

  const rewritten = html.replace(
    /<([a-zA-Z][^>]*?)\sstyle="([^"]*)"([^>]*)>/g,
    (_whole, before, declaration, after) => {
      const value = declaration.trim();
      if (!value) return `<${before}${after}>`;
      const name = className(value);
      if (!declarations.has(name)) declarations.set(name, value);
      if (/\sclass="[^"]*"/.test(before)) {
        return `<${before.replace(
          /(\sclass=")([^"]*)(")/,
          `$1$2 ${name}$3`,
        )}${after}>`;
      }
      return `<${before} class="${name}"${after}>`;
    },
  );

  if (declarations.size === 0) return { html, css: "" };
  const css = [...declarations]
    .map(([name, value]) => `.${name}{${value}}`)
    .join("");
  return {
    html: rewritten.replace(/<\/head>/i, `<style>${css}</style></head>`),
    css,
  };
}

export default function cspHashes() {
  return {
    name: "csp-hashes",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        const dist = dir.pathname.replace(/^\/([A-Za-z]:)/, "$1");
        const scripts = new Set();
        const styles = new Set();

        for (const file of await htmlFiles(dist)) {
          const source = await readFile(file, "utf8");
          const { html, css } = externaliseStyleAttributes(source);
          if (css) await writeFile(file, html);

          for (const match of html.matchAll(
            /<(script|style)\b([^>]*)>([\s\S]*?)<\/\1>/gi,
          )) {
            const tag = match[1].toLowerCase();
            const attrs = match[2];
            const body = match[3];
            if (!body.trim()) continue;
            if (tag === "script") {
              if (/\bsrc\s*=/i.test(attrs)) continue;
              if (/application\/ld\+json/i.test(attrs)) continue;
              scripts.add(sha256(body));
            } else {
              styles.add(sha256(body));
            }
          }
        }

        if (scripts.size === 0 && styles.size === 0) return;

        const headersPath = join(dist, "_headers");
        let headers;
        try {
          headers = await readFile(headersPath, "utf8");
        } catch {
          return;
        }

        headers = headers.replace(
          /^(\s*Content-Security-Policy:\s*)(.*)$/gm,
          (_line, prefix, value) => {
            const parts = value
              .split(";")
              .map((part) => part.trim())
              .filter(Boolean)
              .map((part) => {
                if (part.startsWith("script-src") && scripts.size) {
                  return `${part} ${[...scripts].join(" ")}`;
                }
                if (part.startsWith("style-src") && styles.size) {
                  return `${part} ${[...styles].join(" ")}`;
                }
                return part;
              });
            return prefix + parts.join("; ");
          },
        );

        await writeFile(headersPath, headers);
      },
    },
  };
}
