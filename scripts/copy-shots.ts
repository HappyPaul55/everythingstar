/**
 * Put the browser suite's documentation captures into the built site.
 *
 * The build runs first and writes the `<img>` tags for every promised variant.
 * The e2e shards then take the pictures into `public/docs/test-output/`, and this
 * is the one step that joins the two: copy the WebPs into `dist/` at the URL the
 * page already names, before `check:docs` proves every reference has a file.
 *
 * CI downloads the build and the shards' capture artifacts before this runs. A
 * local `bun run build` already has the captures in `public/`, so this is only
 * needed for the split build/test pipeline.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import docshots from "../docshots.config";

const source = join(process.cwd(), docshots.outDir);
const target = join(process.cwd(), "dist", docshots.outDir.replace(/^public\//, ""));

if (!existsSync(source)) {
  console.error(`copy-shots: no captures at ${docshots.outDir}; run the e2e suite first`);
  process.exit(1);
}

mkdirSync(target, { recursive: true });
let copied = 0;
for (const file of readdirSync(source)) {
  if (!file.endsWith(".webp")) continue;
  copyFileSync(join(source, file), join(target, file));
  copied += 1;
}

if (copied === 0) {
  console.error(`copy-shots: ${docshots.outDir} holds no WebP captures`);
  process.exit(1);
}

console.log(`copy-shots: ${copied} capture(s) into dist/${docshots.outDir.replace(/^public\//, "")}`);
