import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MANIFEST_PATH,
  imageUrl,
  readManifest,
  recordVariant,
  variantFile,
  writeManifest,
  type Manifest,
} from "./manifest";

describe("the capture manifest", () => {
  test("names a file variant first, so a folder sorts by screen", () => {
    expect(variantFile("jukebox", "desktop")).toBe("desktop-jukebox.webp");
  });

  test("gives the document a path relative to itself", () => {
    const url = imageUrl(
      "/repo/docs/players/songs.md",
      "/repo",
      "docs/screenshots",
      "desktop-jukebox.webp",
    );
    expect(url).toBe("../screenshots/desktop-jukebox.webp");
  });

  test("records one variant at a time, replacing its own", () => {
    const root = mkdtempSync(join(tmpdir(), "docshots-"));
    recordVariant(root, "docs/screenshots", 82, "jukebox", {
      name: "desktop",
      file: "desktop-jukebox.webp",
      width: 1440,
      height: 900,
    });
    recordVariant(root, "docs/screenshots", 82, "jukebox", {
      name: "mobile",
      file: "mobile-jukebox.webp",
      width: 390,
      height: 844,
    });
    recordVariant(root, "docs/screenshots", 82, "jukebox", {
      name: "desktop",
      file: "desktop-jukebox.webp",
      width: 1440,
      height: 900,
    });

    expect(readManifest(root)?.shots.jukebox?.variants).toEqual([
      { name: "mobile", file: "mobile-jukebox.webp", width: 390, height: 844 },
      { name: "desktop", file: "desktop-jukebox.webp", width: 1440, height: 900 },
    ]);
  });

  test("round-trips through the ignored manifest", () => {
    const root = mkdtempSync(join(tmpdir(), "docshots-"));
    const manifest: Manifest = {
      version: 1,
      outDir: "docs/screenshots",
      quality: 82,
      shots: {
        jukebox: {
          variants: [
            { name: "desktop", file: "desktop-jukebox.webp", width: 1440, height: 900 },
          ],
        },
      },
    };
    writeManifest(root, manifest);
    expect(readManifest(root)).toEqual(manifest);
    expect(readFileSync(join(root, MANIFEST_PATH), "utf8")).toContain(
      '"desktop-jukebox.webp"',
    );
  });

  test("a tree with no manifest reads as null", () => {
    expect(readManifest(mkdtempSync(join(tmpdir(), "docshots-")))).toBeNull();
  });
});
