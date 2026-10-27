import { describe, expect, test } from "bun:test";
import {
  IMPORT_CAP_BYTES,
  IMPORT_HEADROOM_BYTES,
  folderId,
  importBase,
  importBudget,
  importPaths,
  importRoot,
  importSize,
  isImportable,
  prepareImport,
  splitImportPath,
  type ImportFileLike,
} from "./localImport";

/** A file as a directory input or a drop hands it over. */
function file(name: string, size = 100, webkitRelativePath = ""): ImportFileLike {
  return { name, size, webkitRelativePath };
}

describe("importRoot", () => {
  test("a directory selection is named after its first segment", () => {
    const root = importRoot([
      file("notes.chart", 100, "My Songs/Band - One/notes.chart"),
      file("song.ogg", 200, "My Songs/Band - One/song.ogg"),
    ]);
    expect(root?.name).toBe("My Songs");
    // The picker's id, then what the selection holds: the name is the label, the
    // digest is what keeps two copies of the same label apart.
    expect(root?.id.startsWith(`${folderId("My Songs")}-`)).toBe(true);
    expect(root?.id.endsWith("z")).toBe(true);
    // The id is the slug of the name, then its hash.
    expect(root?.id.startsWith("my-songs-")).toBe(true);
  });

  test("a single .sng is named after the package, without its extension", () => {
    expect(importRoot([file("Test Song.sng", 500)])?.name).toBe("Test Song");
  });

  test("a flat selection of several files has a plain name", () => {
    expect(
      importRoot([file("notes.chart"), file("song.ogg")])?.name,
    ).toBe("Imported songs");
  });

  test("nothing importable has no root at all", () => {
    expect(importRoot([])).toBeNull();
    expect(importRoot([file("changelog.md")])).toBeNull();
    expect(importRoot([file("notes.chart", 1, "../notes.chart")])).toBeNull();
  });

  test("the same name is the same id, and another name is not", () => {
    expect(folderId("Song Library")).toBe(folderId("Song Library"));
    expect(folderId("Song Library")).not.toBe(folderId("Song Library 2"));
  });

  test("two flat selections with the same name and different files are two imports", () => {
    // Both are "Imported songs". A name alone would make the second import the
    // first one, and copying song B's files would delete song A's copy.
    const one = importRoot([file("notes.chart"), file("song.ogg")]);
    const two = importRoot([file("notes.chart"), file("album.png")]);
    expect(one?.name).toBe("Imported songs");
    expect(two?.name).toBe("Imported songs");
    expect(one?.id).not.toBe(two?.id);
    // And a selection that only adds a file is a different import as well.
    expect(
      importRoot([file("notes.chart"), file("song.ogg"), file("album.png")])?.id,
    ).not.toBe(one?.id);
  });

  test("the same selection is the same id, whatever order it arrives in", () => {
    const one = importRoot([file("notes.chart", 1), file("song.ogg", 1)]);
    const two = importRoot([file("song.ogg", 1), file("notes.chart", 1)]);
    expect(one?.id).toBe(two?.id);
  });

  test("a generation belongs to the import it was copied from", () => {
    const root = importRoot([file("notes.chart", 1, "Band/notes.chart")]);
    if (!root) throw new Error("a selection is importable");
    expect(importBase(root.id)).toBe(root.id);
    expect(importBase(`${root.id}-2`)).toBe(root.id);
    expect(importBase(`${root.id}-12`)).toBe(root.id);
    // A different tree is not this import, however its numbers fall.
    const other = importRoot([file("song.ogg", 1, "Band/song.ogg")]);
    expect(importBase(other?.id ?? "")).not.toBe(root.id);
  });
});

describe("importPaths", () => {
  test("strips the chosen directory and keeps the tree beneath it", () => {
    const paths = importPaths([
      file("notes.chart", 1, "My Songs/One/notes.chart"),
      file("art.png", 1, "My Songs/One/art.png"),
      file("notes.mid", 1, "My Songs/Two/notes.mid"),
    ]);
    expect(paths.map((entry) => entry.path)).toEqual([
      "One/notes.chart",
      "One/art.png",
      "Two/notes.mid",
    ]);
  });

  test("a package keeps its own file name at the root", () => {
    expect(importPaths([file("Test Song.sng")]).map((entry) => entry.path)).toEqual([
      "Test Song.sng",
    ]);
  });

  test("files the scanner cannot read, and paths that climb out, are left out", () => {
    const paths = importPaths([
      file("notes.chart"),
      file("changelog.md"),
      file("song.ini", 1, "Pack/../song.ini"),
      file("cover.JPG"),
    ]);
    expect(paths.map((entry) => entry.path)).toEqual(["notes.chart", "cover.JPG"]);
  });

  test("an accepted extension is a suffix, not a substring", () => {
    expect(isImportable("song.ogg")).toBe(true);
    expect(isImportable("song.OGG")).toBe(true);
    expect(isImportable("song.ogg.txt")).toBe(true);
    expect(isImportable("songogg")).toBe(false);
  });
});

describe("prepareImport", () => {
  const nested = [
    file("notes.chart", 40, "My Songs/One/notes.chart"),
    file("song.ogg", 200, "My Songs/One/song.ogg"),
    file("album.png", 10, "My Songs/Two/album.png"),
    file("changelog.md", 999, "My Songs/Two/changelog.md"),
  ];

  test("one resolution matches the separate functions for a nested selection", () => {
    const prepared = prepareImport(nested);
    if (!prepared) throw new Error("a nested selection is importable");
    expect(prepared.root).toEqual(importRoot(nested)!);
    expect(prepared.root.name).toBe("My Songs");
    expect(prepared.entries).toEqual(importPaths(nested));
    expect(prepared.entries.map((entry) => entry.path)).toEqual([
      "One/notes.chart",
      "One/song.ogg",
      "Two/album.png",
    ]);
    expect(prepared.size).toBe(importSize(importPaths(nested)));
    // Only what will be copied counts: the changelog is not in the batch.
    expect(prepared.size).toBe(250);
  });

  test("a selection it cannot import is still null", () => {
    expect(prepareImport([])).toBeNull();
    expect(prepareImport([file("changelog.md")])).toBeNull();
    expect(prepareImport([file("notes.chart", 1, "../notes.chart")])).toBeNull();
  });
});

describe("importSize and importBudget", () => {
  const entries = importPaths([file("notes.chart", 10), file("song.ogg", 90)]);

  test("adds what will be copied", () => {
    expect(importSize(entries)).toBe(100);
    expect(importSize([])).toBe(0);
  });

  test("a batch at the cap is allowed and one byte over is not", () => {
    expect(importBudget(IMPORT_CAP_BYTES, { capBytes: IMPORT_CAP_BYTES })).toEqual({
      ok: true,
    });
    expect(importBudget(IMPORT_CAP_BYTES + 1, { capBytes: IMPORT_CAP_BYTES })).toEqual({
      ok: false,
      reason: "too-large",
    });
  });

  test("a nearly full origin keeps the headroom back", () => {
    const available = 1000 * 1024 * 1024;
    const capBytes = 2000 * 1024 * 1024;
    expect(
      importBudget(available - IMPORT_HEADROOM_BYTES, { availableBytes: available, capBytes }),
    ).toEqual({ ok: true });
    expect(
      importBudget(available - IMPORT_HEADROOM_BYTES + 1, {
        availableBytes: available,
        capBytes,
      }),
    ).toEqual({ ok: false, reason: "no-space" });
  });

  test("an estimate the browser cannot give leaves only the cap", () => {
    expect(importBudget(IMPORT_CAP_BYTES, { availableBytes: null })).toEqual({ ok: true });
    expect(importBudget(0, { availableBytes: 0 })).toEqual({
      ok: false,
      reason: "no-space",
    });
  });
});

describe("splitImportPath", () => {
  test("splits directories from the file that is written", () => {
    expect(splitImportPath("One/art/album.png")).toEqual({
      directories: ["One", "art"],
      name: "album.png",
    });
    expect(splitImportPath("notes.chart")).toEqual({ directories: [], name: "notes.chart" });
  });

  test("refuses a path with nowhere safe to write", () => {
    expect(splitImportPath("")).toBeNull();
    expect(splitImportPath("../outside.sng")).toBeNull();
    expect(splitImportPath("One/../../outside.sng")).toBeNull();
    expect(splitImportPath("One/")).toBeNull();
  });
});
