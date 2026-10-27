// One-off helper: download the latin-subset woff2 files from Google Fonts.
// Run with: bun scripts/fetch-fonts.mjs
import { promises as fs } from "node:fs";
import path from "node:path";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

const outDir = path.join(process.cwd(), "public", "fonts");

async function fetchCss(family) {
  const url = `https://fonts.googleapis.com/css2?family=${family}&display=swap`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`CSS ${family}: ${res.status}`);
  return res.text();
}

function blocks(css) {
  return css
    .split("@font-face")
    .slice(1)
    .map((block) => {
      const url = block.match(/url\((https:\/\/[^)]+\.woff2)\)/)?.[1];
      const weight = block.match(/font-weight:\s*([^;]+);/)?.[1]?.trim() ?? "400";
      const range = block.match(/unicode-range:\s*([^;]+);/)?.[1]?.trim() ?? "";
      return { url, weight, range };
    })
    .filter((b) => b.url);
}

const isLatin = (range) => range.startsWith("U+0000-00FF");

async function save(url, name) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(path.join(outDir, name), buf);
  console.log(`saved ${name} (${buf.length} bytes)`);
}

await fs.mkdir(outDir, { recursive: true });

// Permanent Marker — single weight, display headings and tag labels
const marker = blocks(await fetchCss("Permanent+Marker"));
const markerLatin = marker.find((b) => isLatin(b.range)) ?? marker[0];
await save(markerLatin.url, "permanent-marker-latin.woff2");

// Space Grotesk — variable weight 300..700, body
const grotesk = blocks(await fetchCss("Space+Grotesk:wght@300..700"));
const groteskLatin = grotesk.find((b) => isLatin(b.range)) ?? grotesk[0];
await save(groteskLatin.url, "space-grotesk-latin.woff2");

// Space Mono — 400 and 700, utility
const mono = blocks(await fetchCss("Space+Mono:wght@400;700"));
for (const weight of ["400", "700"]) {
  const match = mono.find((b) => isLatin(b.range) && b.weight === weight);
  if (match) await save(match.url, `space-mono-latin-${weight}.woff2`);
}

console.log("done");
