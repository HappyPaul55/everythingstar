/// <reference types="bun" />
/**
 * Print the built guide to a PDF: the whole player and charter documentation,
 * plus the notices, in one file with a cover, a contents page, page numbers and
 * a heading outline.
 *
 * `bun run guide:pdf` — after `bun run build`, because it prints the **built**
 * `/guide` page and the captures the build and the capture run leave in
 * `dist/docs/test-output/`. It writes `release/guide.pdf` by default, never
 * `dist/`: the captures make the file far larger than Cloudflare's 25 MiB
 * per-static-asset cap, so it is a GitHub Release asset rather than a deploy.
 *
 * Chromium does the printing — it is the same browser the captures use, so the
 * PDF is the site's own typography and images. The step then sets the metadata
 * Chromium leaves out (author, subject, keywords, language, XMP) and displays the
 * heading outline on opening, which is what `outline: true` wrote.
 *
 * The guide page has one <details> per screenshot variant and opens the desktop
 * one. Only the open disclosure is printed: a phone frame beside a desk frame
 * leaves most of an A4 page empty, so the book carries the desk capture and the
 * page keeps the phone picture as a disclosure. */
import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { PDFDocument, PDFName } from "pdf-lib";
import { translate } from "../src/i18n";
import { DEFAULT_LOCALE } from "../src/i18n/locales";
import { readVersion } from "./version";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = join(ROOT, "dist");
const GUIDE = join(DIST, "guide.html");
const TITLE = "EverythingStar — The Guide";
const AUTHOR = "HappyPaul55";
const SITE = "https://everythingstar.happypaul55.com";

const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8",
  webp: "image/webp",
  woff2: "font/woff2",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  json: "application/json",
  webmanifest: "application/manifest+json",
  svg: "image/svg+xml",
  png: "image/png",
  ico: "image/x-icon",
};

function fail(message: string): never {
  console.error(`\n${message}`);
  process.exit(1);
}

function format(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
    : `${(bytes / 1024).toFixed(0)} KiB`;
}

function flag(name: string): string | undefined {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
}

if (!existsSync(GUIDE)) {
  fail("dist/guide.html is missing. Run `bun run build` first (it also needs the captures).");
}

const out = resolve(ROOT, flag("--out") ?? "release/guide.pdf");
const version = readVersion();
const built = new Date();

/** A static file server for `dist/`, so the print never needs a dev server. */
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(request) {
    const url = new URL(request.url);
    let path = decodeURIComponent(url.pathname);
    if (path.includes("..")) return new Response("not found", { status: 404 });
    if (path.endsWith("/")) path += "index.html";
    if (!path.split("/").pop()?.includes(".")) path += ".html";
    const file = Bun.file(join(DIST, path));
    return file.exists().then((there) => {
      if (!there) return new Response(`not found: ${path}`, { status: 404 });
      const ext = path.slice(path.lastIndexOf(".") + 1);
      return new Response(file, {
        headers: { "content-type": MIME[ext] ?? "application/octet-stream" },
      });
    });
  },
});

const browser = await chromium.launch();
const started = Date.now();

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(180_000);

  const url = `http://127.0.0.1:${server.port}/guide`;
  const response = await page.goto(url, { waitUntil: "networkidle", timeout: 180_000 });
  if (!response || !response.ok()) {
    fail(`The guide page did not load: ${response?.status() ?? "no response"} (${url}).`);
  }

  await page.evaluate(() => document.fonts.ready);

  // Everything the book needs, done in the page it is printing: each chapter's
  // heading ids made unique, and every link between documents pointed at the
  // chapter it became. A reader of the PDF never needs the site to follow a
  // cross-reference. The screenshot disclosures are left as they are: the open
  // one is the desktop capture, and it is the one that prints.
  const stats = await page.evaluate((siteHost: string) => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-doc-id]"));
    const byRoute = new Map<string, string>();

    for (const section of sections) {
      const route = section.dataset.docHref;
      if (route) byRoute.set(route, section.id);
      for (const element of Array.from(section.querySelectorAll<HTMLElement>("[id]"))) {
        element.id = `${section.id}--${element.id}`;
      }
    }

    let links = 0;
    let internal = 0;
    let external = 0;
    let unlinked = 0;
    for (const anchor of Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
      links += 1;
      const href = anchor.getAttribute("href") ?? "";
      if (href.startsWith("#")) {
        const section = anchor.closest<HTMLElement>("[data-doc-id]");
        if (section) {
          const candidate = `${section.id}--${href.slice(1)}`;
          if (document.getElementById(candidate)) anchor.setAttribute("href", `#${candidate}`);
        }
        continue;
      }
      const target = new URL(href, location.href);
      if (target.hostname !== location.hostname && target.hostname !== siteHost) {
        external += 1;
        continue;
      }
      if (target.pathname === "/docs" || target.pathname === "/docs/") {
        anchor.setAttribute("href", "#guide-contents");
        internal += 1;
        continue;
      }
      const chapter = byRoute.get(target.pathname);
      if (!chapter) {
        unlinked += 1;
        continue;
      }
      const hash = target.hash.slice(1);
      const deep = hash ? `${chapter}--${hash}` : "";
      anchor.setAttribute(
        "href",
        deep && document.getElementById(deep) ? `#${deep}` : `#${chapter}`,
      );
      internal += 1;
    }

    return { sections: sections.length, links, internal, external, unlinked };
  }, new URL(SITE).hostname);

  if (stats.sections === 0) fail("The guide has no chapters; dist/guide.html is not the guide page.");

  // A missing capture is the one thing that would put a broken picture in the
  // release, and the placeholder is what a dev build draws instead. Only the
  // images that will print count: the closed disclosure is the phone picture,
  // and it is kept for the web page.
  const missing = await page.evaluate(() =>
    Array.from(document.images)
      .filter((image) => {
        const details = image.closest("details");
        return !details || details.open;
      })
      .filter((image) => !image.complete || image.naturalWidth === 0)
      .map((image) => image.currentSrc || image.src),
  );
  if (missing.length > 0) {
    fail(
      `The guide names ${missing.length} image${missing.length === 1 ? "" : "s"} that did not load:\n` +
        missing.slice(0, 5).map((src) => `  - ${src}`).join("\n") +
        (missing.length > 5 ? `\n  … and ${missing.length - 5} more` : ""),
    );
  }
  const placeholders = await page.locator(".doc-shot--missing").count();
  if (placeholders > 0) {
    fail(`The guide carries ${placeholders} missing-screenshot placeholder(s). Run \`bun run docs:shots\`.`);
  }

  await page.evaluate(
    () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  );

  const printed = await page.pdf({
    preferCSSPageSize: true,
    printBackground: true,
    tagged: true,
    outline: true,
    displayHeaderFooter: true,
    margin: { top: "0", bottom: "0", left: "0", right: "0" },
    headerTemplate: `<div style="width:100%;padding:0 16mm;font-family:Helvetica,Arial,sans-serif;font-size:7pt;color:#555;display:flex;justify-content:space-between;">
      <span>${TITLE}</span><span>${version}</span>
    </div>`,
    footerTemplate: `<div style="width:100%;padding:0 16mm;font-family:Helvetica,Arial,sans-serif;font-size:7pt;color:#555;display:flex;justify-content:space-between;">
      <span>${SITE.replace(/^https?:\/\//, "")}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
    </div>`,
  });

  const pdf = await PDFDocument.load(printed);
  pdf.setTitle(TITLE, { showInWindowTitleBar: true });
  pdf.setAuthor(AUTHOR);
  pdf.setSubject(translate(DEFAULT_LOCALE, "guide.description"));
  pdf.setKeywords([
    "EverythingStar",
    "rhythm game",
    "guide",
    "documentation",
    "guitar",
    "bass",
    "keys",
    "drums",
    "typing",
    "karaoke",
    "charts",
  ]);
  pdf.setCreator(`${TITLE} (${version})`);
  pdf.setProducer(`EverythingStar guide build ${version}`);
  pdf.setLanguage("en-GB");
  pdf.setCreationDate(built);
  pdf.setModificationDate(built);
  // Open with the heading outline showing, and let a viewer use the title from
  // the document rather than the file name.
  pdf.catalog.set(PDFName.of("PageMode"), PDFName.of("UseOutlines"));
  pdf.catalog.set(
    PDFName.of("Metadata"),
    pdf.context.stream(
      xmp({ title: TITLE, author: AUTHOR, version, built }),
      { Type: "Metadata", Subtype: "XML" },
    ),
  );

  const bytes = await pdf.save({ useObjectStreams: false });
  if (pdf.getPageCount() === 0) fail("The printed guide has no pages.");
  mkdirSync(dirname(out), { recursive: true });
  await Bun.write(out, bytes);

  const size = statSync(out).size;
  const pages = pdf.getPageCount();
  const seconds = Math.round((Date.now() - started) / 1000);
  console.log(`guide: ${relative(ROOT, out)}`);
  console.log(
    `  ${pages} pages, ${format(size)}, ${stats.sections} chapters, ` +
      `${stats.internal} internal link(s), ${stats.external} external, ${seconds}s`,
  );
  if (stats.unlinked > 0) {
    console.log(`  ${stats.unlinked} same-site link(s) kept as URLs (they are not chapters)`);
  }
} finally {
  await browser.close();
  server.stop(true);
}

/** An XMP packet for the fields Chromium and pdf-lib do not write together. */
function xmp(input: { title: string; author: string; version: string; built: Date }): string {
  const iso = input.built.toISOString().replace(/\.\d{3}Z$/, "Z");
  const escape = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const subject = translate(DEFAULT_LOCALE, "guide.description");
  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escape(input.title)}</rdf:li></rdf:Alt></dc:title>
   <dc:creator><rdf:Seq><rdf:li>${escape(input.author)}</rdf:li></rdf:Seq></dc:creator>
   <dc:description><rdf:Alt><rdf:li xml:lang="x-default">${escape(subject)}</rdf:li></rdf:Alt></dc:description>
   <dc:language><rdf:Bag><rdf:li>en-GB</rdf:li></rdf:Bag></dc:language>
   <dc:subject><rdf:Bag><rdf:li>EverythingStar</rdf:li><rdf:li>rhythm game</rdf:li><rdf:li>guide</rdf:li></rdf:Bag></dc:subject>
   <xmp:CreatorTool>${escape(input.title)} (${escape(input.version)})</xmp:CreatorTool>
   <xmp:CreateDate>${iso}</xmp:CreateDate>
   <xmp:ModifyDate>${iso}</xmp:ModifyDate>
   <pdf:Producer>EverythingStar guide build ${escape(input.version)}</pdf:Producer>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}
