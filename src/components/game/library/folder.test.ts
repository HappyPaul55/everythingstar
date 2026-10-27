import { describe, expect, test } from "bun:test";
import {
  applyFolders,
  closeFolder,
  folderAccess,
  folderFiles,
  folderNeedsRescan,
  folderRecords,
  FOLDER_SCAN_VERSION,
  importFiles,
  isLocalFolderLocked,
  localPreview,
  localPreviewClip,
  localObjectUrl,
  localSongFiles,
  readFolder,
  readLocalSource,
  readLocalSongFiles,
  repairFolderFiles,
  rescanFolder,
  restoreFolders,
} from "./folder";
import { folderId, importRoot } from "./localImport";
import { loadFolders, saveFolders } from "./store";
import { PREVIEW_NAMES } from "../../../lib/game/sources/files";

/**
 * A folder tree as a `FileSystemDirectoryHandle`, so the scanner can be tested
 * without a browser in the loop. Only the four members the scanner touches exist.
 */
type Tree = { [name: string]: Uint8Array | string | Tree };

function file(name: string, body: Uint8Array | string) {
  const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
  return {
    kind: "file" as const,
    name,
    size: bytes.length,
    async getFile() {
      return {
        size: bytes.length,
        async arrayBuffer() {
          return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        },
        slice(start: number, end: number) {
          const part = bytes.slice(start, end);
          return {
            async arrayBuffer() {
              return part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength);
            },
          };
        },
      };
    },
  };
}

function directory(name: string, tree: Tree): FileSystemDirectoryHandle {
  const isFile = (value: Uint8Array | string | Tree): value is Uint8Array | string =>
    value instanceof Uint8Array || typeof value === "string";
  return {
    kind: "directory" as const,
    name,
    async getFileHandle(entry: string) {
      const value = tree[entry];
      if (value === undefined || !isFile(value)) throw new Error("no such file");
      return file(entry, value);
    },
    async getDirectoryHandle(entry: string) {
      const value = tree[entry];
      if (value === undefined || isFile(value)) throw new Error("no such directory");
      return directory(entry, value);
    },
    async *values() {
      for (const [entry, value] of Object.entries(tree)) {
        yield isFile(value) ? file(entry, value) : directory(entry, value);
      }
    },
  } as unknown as FileSystemDirectoryHandle;
}

/** A handle whose listing fails, as a revoked permission or a removed disk would. */
function brokenDirectory(name: string): FileSystemDirectoryHandle {
  return {
    kind: "directory" as const,
    name,
    values() {
      return {
        [Symbol.asyncIterator]() {
          return this;
        },
        async next(): Promise<IteratorResult<never>> {
          throw new Error("permission revoked");
        },
      };
    },
  } as unknown as FileSystemDirectoryHandle;
}

/**
 * The smallest IndexedDB the folder store asks for: one record per key, in a map.
 *
 * The folder tests need to see what was **written**, not only what is in memory —
 * the sparse write that used to erase the remembered folders happened before any
 * map could show it. Only `get`, `put` and `transaction` exist, because that is all
 * `loadFolders`/`saveFolders` touch.
 */
function installIndexedDb(): { restore: () => void } {
  const records = new Map<string, unknown>();
  const original = (globalThis as { indexedDB?: unknown }).indexedDB;
  const database = {
    onversionchange: null as (() => void) | null,
    close() {
      // One connection for the test.
    },
    transaction(name: string) {
      const transaction: {
        oncomplete?: () => void;
        onerror?: () => void;
        onabort?: () => void;
        objectStore(store: string): unknown;
      } = { objectStore: () => objectStore };
      const keyOf = (key: string) => `${name}:${key}`;
      const settle = (fill: (request: FakeRequest) => void): FakeRequest => {
        const request: FakeRequest = {};
        queueMicrotask(() => {
          fill(request);
          request.onsuccess?.();
          transaction.oncomplete?.();
        });
        return request;
      };
      const objectStore = {
        get(key: string) {
          return settle((request) => {
            request.result = records.get(keyOf(key));
          });
        },
        put(value: unknown, key: string) {
          return settle((request) => {
            records.set(keyOf(key), value);
            request.result = key;
          });
        },
      };
      return transaction;
    },
  };
  (globalThis as { indexedDB?: unknown }).indexedDB = {
    open() {
      const request: FakeRequest = {};
      queueMicrotask(() => {
        request.result = database;
        request.onsuccess?.();
      });
      return request;
    },
  };
  return {
    restore() {
      // `store.ts` memoises a working connection for the life of the process, and a
      // test file shares that module. Letting go of it the way a real version change
      // does (the handler it installed clears the memo) keeps the fake from leaking
      // into any later test file's own storage.
      database.onversionchange?.();
      if (original === undefined) delete (globalThis as { indexedDB?: unknown }).indexedDB;
      else (globalThis as { indexedDB?: unknown }).indexedDB = original;
    },
  };
}

interface FakeRequest {
  result?: unknown;
  onsuccess?: () => void;
  onerror?: () => void;
}

/**
 * A mutable Origin Private File System, so an import can be written and read back.
 *
 * Only the members `importFiles` and `readFolder` touch exist, and writes go into
 * the same tree `values()` walks — which is what lets a test say "the old copy is
 * still there" after a second import fails.
 */
type OpfsNode =
  | { kind: "file"; name: string; bytes: Uint8Array }
  | { kind: "directory"; name: string; children: Map<string, OpfsNode> };

interface OpfsOptions {
  /** A write to this name fails, as a full quota or a revoked handle would. */
  failWrite?: (name: string) => boolean;
}

function opfsDirectory(name: string): OpfsNode & { kind: "directory" } {
  return { kind: "directory", name, children: new Map() };
}

function opfsFileHandle(
  node: Extract<OpfsNode, { kind: "file" }>,
  options: OpfsOptions,
): FileSystemFileHandle {
  return {
    kind: "file",
    name: node.name,
    async getFile() {
      const body = node.bytes;
      return {
        size: body.length,
        async arrayBuffer() {
          return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
        },
        slice(start: number, end: number) {
          const part = body.slice(start, end);
          return {
            async arrayBuffer() {
              return part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength);
            },
          };
        },
      };
    },
    async createWritable() {
      if (options.failWrite?.(node.name)) throw new Error("write failed");
      return {
        async write(value: { arrayBuffer(): Promise<ArrayBuffer> } | Uint8Array) {
          node.bytes =
            value instanceof Uint8Array
              ? value
              : new Uint8Array(await value.arrayBuffer());
        },
        async close() {
          // A real writable commits on close; this one already has the bytes.
        },
      };
    },
  } as unknown as FileSystemFileHandle;
}

function opfsDirectoryHandle(
  node: OpfsNode & { kind: "directory" },
  options: OpfsOptions,
): FileSystemDirectoryHandle {
  return {
    kind: "directory",
    name: node.name,
    async getFileHandle(name: string, config?: { create?: boolean }) {
      const found = node.children.get(name);
      if (found) {
        if (found.kind !== "file") throw new Error("not a file");
        return opfsFileHandle(found, options);
      }
      if (!config?.create) throw new Error("no such file");
      const created: OpfsNode = { kind: "file", name, bytes: new Uint8Array() };
      node.children.set(name, created);
      return opfsFileHandle(created as Extract<OpfsNode, { kind: "file" }>, options);
    },
    async getDirectoryHandle(name: string, config?: { create?: boolean }) {
      const found = node.children.get(name);
      if (found) {
        if (found.kind !== "directory") throw new Error("not a directory");
        return opfsDirectoryHandle(found, options);
      }
      if (!config?.create) throw new Error("no such directory");
      const created = opfsDirectory(name);
      node.children.set(name, created);
      return opfsDirectoryHandle(created, options);
    },
    async removeEntry(name: string) {
      node.children.delete(name);
    },
    async *values() {
      for (const child of node.children.values()) {
        yield child.kind === "file"
          ? opfsFileHandle(child, options)
          : opfsDirectoryHandle(child, options);
      }
    },
  } as unknown as FileSystemDirectoryHandle;
}

/** A file as the import inputs hand it over, with the path it was chosen under. */
function importFile(name: string, body: string, path: string): File {
  const bytes = new TextEncoder().encode(body);
  return {
    name,
    size: bytes.length,
    webkitRelativePath: path,
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  } as unknown as File;
}

const CHART = [
  "[Song]",
  "{",
  "  Name = A Song",
  "  Resolution = 480",
  "}",
  "[SyncTrack]",
  "{",
  "  0 = B 120000",
  "}",
  "[ExpertSingle]",
  "{",
  "  480 = N 0 0",
  "  960 = N 1 0",
  "}",
  "",
].join("\n");

const INI = "[song]\nname = A Song\nartist = Someone\nsong_length = 210000\n";

const ULTRA = [
  "#TITLE:The Song",
  "#ARTIST:The Artist",
  "#BPM:120",
  "#GAP:0",
  "#MP3:audio.mp3",
  ": 0 4 0  hello",
  ": 4 4 0  world",
  "- 8",
  "E",
].join("\n");

const PACKAGE_CHART = [
  "[Song]",
  "{",
  "  Name = Package Song",
  "  Artist = The Packager",
  "  Resolution = 480",
  '  MusicStream = "guitar.opus"',
  "}",
  "[SyncTrack]",
  "{",
  "  0 = B 120000",
  "}",
  "[ExpertSingle]",
  "{",
  "  960 = N 0 0",
  "}",
  "",
].join("\n");

/** A small real `.sng`: one chart, one stem, one cover and (usually) a preview clip. */
function sngPackage(withPreview = true): Uint8Array {
  const mask = new Uint8Array([0x13, 0x9a, 0x2c, 0x44, 0xf1, 0x08, 0xa7, 0x5d, 0xe2, 0x71, 0x3b, 0xc6, 0x90, 0x1d, 0x6e, 0xbb]);
  const encoder = new TextEncoder();
  const metadata: [string, string][] = [
    ["name", "Package Song"],
    ["artist", "The Packager"],
    ["album", "The Album"],
    ["year", "2003"],
    ["song_length", "216181"],
    ["preview_start_time", "30000"],
  ];
  const files: [string, Uint8Array][] = [
    ["notes.chart", encoder.encode(PACKAGE_CHART)],
    ["guitar.opus", new Uint8Array([1, 2, 3])],
    ["album.jpg", new Uint8Array([0xff, 0xd8, 0xff, 0xd9])],
    ...(withPreview
      ? ([["preview.opus", new Uint8Array([0x4f, 0x67, 0x67, 0x53])]] as [string, Uint8Array][])
      : []),
  ];

  const metaBody: number[] = [];
  pushU64(metaBody, 0);
  pushU64(metaBody, metadata.length);
  for (const [key, value] of metadata) {
    const keyBytes = encoder.encode(key);
    const valueBytes = encoder.encode(value);
    pushI32(metaBody, keyBytes.length);
    metaBody.push(...keyBytes);
    pushI32(metaBody, valueBytes.length);
    metaBody.push(...valueBytes);
  }
  writeU64(metaBody, 0, metaBody.length - 8);

  const fileMetaLen = files.reduce(
    (total, [name]) => total + 1 + encoder.encode(name).length + 16,
    8,
  );
  const headerLen = 26 + metaBody.length + 8 + fileMetaLen + 8;
  let at = headerLen;
  const fileMeta: number[] = [];
  pushU64(fileMeta, fileMetaLen);
  pushU64(fileMeta, files.length);
  const data: number[] = [];
  for (const [name, plain] of files) {
    const nameBytes = encoder.encode(name);
    fileMeta.push(nameBytes.length, ...nameBytes);
    pushU64(fileMeta, plain.length);
    pushU64(fileMeta, at);
    at += plain.length;
    for (let index = 0; index < plain.length; index += 1) {
      data.push(plain[index]! ^ (mask[index % 16]! ^ (index & 0xff)));
    }
  }

  const out: number[] = [];
  out.push(...encoder.encode("SNGPKG"));
  pushU32(out, 1);
  out.push(...mask);
  out.push(...metaBody, ...fileMeta);
  pushU64(out, data.length);
  out.push(...data);
  return new Uint8Array(out);
}

function pushU32(out: number[], value: number): void {
  out.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function pushI32(out: number[], value: number): void {
  pushU32(out, value >>> 0);
}

function pushU64(out: number[], value: number): void {
  let left = BigInt(value);
  for (let index = 0; index < 8; index += 1) {
    out.push(Number(left & 0xffn));
    left >>= 8n;
  }
}

function writeU64(bytes: number[], at: number, value: number): void {
  let left = BigInt(value);
  for (let index = 0; index < 8; index += 1) {
    bytes[at + index] = Number(left & 0xffn);
    left >>= 8n;
  }
}

describe("readFolder", () => {
  test("reads the songs under a folder, and does not read the folder itself as one", async () => {
    // The shape a chart collection has: a collection folder holding a
    // changelog beside the song folders. The changelog is not a song, and the walk
    // must keep going to find the songs underneath.
    const songs = await readFolder(
      directory("Song Library", {
        "changelog.txt": "Fixed HOPOs in the intro\nFixed preview start times\n",
        "Collection": {
          "Band - One": { "song.ini": INI, "notes.chart": CHART, "album.png": "png" },
          "Band - Two": { "song.ini": INI, "notes.chart": CHART },
        },
      }),
      "test",
    );
    expect(songs).toHaveLength(2);
    expect(songs.map((song) => song.title)).toEqual(["A Song", "A Song"]);
    expect(songs.every((song) => song.durationMs === 210000)).toBe(true);
    expect(songs.every((song) => song.offer.instruments.length > 0)).toBe(true);
  });

  test("a song folder is read even when it keeps a sub-folder of its own", async () => {
    const songs = await readFolder(
      directory("root", {
        "Song One": {
          "song.ini": INI,
          "notes.chart": CHART,
          "extras": { "lining.png": "png" },
        },
      }),
      "test",
    );
    expect(songs).toHaveLength(1);
    expect(songs[0].durationMs).toBe(210000);
  });

  test("records a jukebox clip beside a song, and never calls it a stem", async () => {
    const songs = await readFolder(
      directory("root", {
        "Band - One": {
          "song.ini": INI,
          "notes.chart": CHART,
          "song.ogg": "audio",
          "preview.ogg": "clip",
        },
      }),
      "clip-folder",
    );
    const files = localSongFiles(songs[0].doc);
    // The clip is found and kept apart from the audio that is mixed into the song.
    expect(files?.preview).toBe("preview.ogg");
    expect(files?.audio.master).toBe("song.ogg");
    expect(localPreview(songs[0].doc)).toEqual({
      url: `${files?.dirUrl}preview.ogg`,
      startMs: 0,
    });
  });

  test("a folder with no clip is asked once, not on every selection", async () => {
    const opened: string[] = [];
    const root = directory("root", {
      "song.ini": INI,
      "notes.chart": CHART,
      "song.ogg": "audio",
    });
    const read = root.getFileHandle.bind(root);
    Object.defineProperty(root, "getFileHandle", {
      value: async (entry: string) => {
        if (PREVIEW_NAMES.includes(entry)) opened.push(entry);
        return read(entry);
      },
    });
    const songs = await readFolder(root, "preview-once");
    expect(localSongFiles(songs[0].doc)?.preview).toBeNull();

    // The first ask checks every candidate name; the answer ("none") is remembered
    // for the visit, so choosing the song again opens nothing.
    expect(await localPreviewClip(songs[0].doc)).toBeNull();
    expect(opened).toEqual(PREVIEW_NAMES);
    expect(await localPreviewClip(songs[0].doc)).toBeNull();
    expect(opened).toEqual(PREVIEW_NAMES);
    closeFolder("preview-once");
  });

  test("a folder with no clip previews its master from the song's own cue", async () => {
    const songs = await readFolder(
      directory("root", {
        "Band - Two": { "song.ini": INI, "notes.chart": CHART, "song.ogg": "audio" },
      }),
      "master-folder",
    );
    const files = localSongFiles(songs[0].doc);
    expect(localPreview(songs[0].doc, 45000)).toEqual({
      url: `${files?.dirUrl}song.ogg`,
      startMs: 45000,
    });
  });

  test("a leaf folder holding only a lyric sheet is a song", async () => {
    const songs = await readFolder(
      directory("root", {
        "Nine Lives": { "song.lrc": "[00:01.00]turn the volume up\n[00:05.00]and play it loud\n" },
      }),
      "test",
    );
    expect(songs).toHaveLength(1);
    expect(songs[0].offer.voice?.chartType).toBe("lyrics");
  });

  test("a text file with no timed lines is not offered as a song", async () => {
    const songs = await readFolder(
      directory("root", {
        Notes: { "notes.txt": "just some notes\nand nothing timed\n" },
      }),
      "test",
    );
    expect(songs).toHaveLength(0);
  });

  test("a chart-format song keeps its id readable, not URL-encoded", async () => {
    const songs = await readFolder(
      directory("root", { "Alice in Chains - No Excuses": { "song.ini": INI, "notes.chart": CHART } }),
      "test",
    );
    expect(songs[0].id).toBe("alice-in-chains-no-excuses-notes-chart");
  });

  test("a song summary from an older scanner is rescanned once", async () => {
    const root = directory("root", {
      "Band - Song": {
        "license.txt": "This song is licensed for reuse.\n",
        "song.txt": ULTRA,
        "audio.mp3": "audio",
        "cover.jpg": "image",
      },
    });
    const fresh = await readFolder(root, "stale-scanner");
    closeFolder("stale-scanner");
    // What an older build stored: the chart and audio are there, but the summary
    // says the song has no voice, so the band screen offers no game mode.
    const stale = {
      ...fresh[0],
      offer: { instruments: [], voice: null },
    };
    await applyFolders([
      { id: "stale-scanner", name: "root", handle: root, songs: [stale], files: {} },
    ]);
    expect(folderNeedsRescan("stale-scanner")).toBe(true);

    const songs = await rescanFolder("stale-scanner");
    expect(folderNeedsRescan("stale-scanner")).toBe(false);
    expect(songs[0].title).toBe("The Song");
    expect(songs[0].offer.voice?.chartType).toBe("vocals");
    closeFolder("stale-scanner");
  });

  test("a stale file record still opens song.txt and audio.mp3", async () => {
    const root = directory("root", {
      "Band - Song": {
        "license.txt": "This song is licensed for reuse.\n",
        "song.txt": ULTRA,
        "audio.mp3": "audio",
        "cover.jpg": "image",
      },
    });
    const fresh = await readFolder(root, "stale-read");
    const doc = fresh[0].doc;
    const good = localSongFiles(doc)!;
    closeFolder("stale-read");
    // The record an older build wrote: the license as the chart, and no audio.
    await applyFolders([
      {
        id: "stale-read",
        name: "root",
        handle: root,
        songs: fresh,
        files: { [doc]: { ...good, chart: "license.txt", audio: {} } },
      },
    ]);

    const source = await readLocalSource(doc);
    expect(source?.meta.title).toBe("The Song");
    expect(source?.melody?.lines.length).toBeGreaterThan(0);
    expect(source?.audio.stems[0]?.url).toBe(`${good.dirUrl}audio.mp3`);
    closeFolder("stale-read");
  });

  test("an UltraStar folder chooses song.txt and audio.mp3, not the license or instrumental", async () => {
    // The shape of every folder in the Creative Commons collection: a license, an
    // instrumental chart, the vocal chart, and both audio files.
    const songs = await readFolder(
      directory("root", {
        "Band - Song": {
          "license.txt": "This song is licensed for reuse.\n",
          "instrumental.txt": ULTRA.replace("The Song", "The Song (Kar)"),
          "song.txt": ULTRA,
          "audio.mp3": "audio",
          "instrumental.mp3": "audio",
          "cover.jpg": "image",
        },
      }),
      "ultrastar",
    );

    expect(songs).toHaveLength(1);
    expect(songs[0].title).toBe("The Song");
    expect(songs[0].durationMs).toBeGreaterThan(0);
    const files = localSongFiles(songs[0].doc);
    expect(files?.chart).toBe("song.txt");
    expect(files?.audio.master).toBe("audio.mp3");
    expect(files?.art).toBe("cover.jpg");

    const source = await readLocalSource(songs[0].doc);
    expect(source?.meta.title).toBe("The Song");
    expect(source?.audio.stems[0].url).toBe(`${files?.dirUrl}audio.mp3`);
    closeFolder("ultrastar");
  });

  test("a folder with a Guitar Hero chart and a song.txt lists and plays the chart", async () => {
    const root = directory("root", {
      "Band - One": {
        "song.ini": INI,
        "notes.chart": CHART,
        "song.txt": ULTRA,
        "audio.mp3": "audio",
      },
    });
    const songs = await readFolder(root, "chart-and-sheet");
    expect(songs).toHaveLength(1);
    // Listed from the chart, named by its `song.ini`.
    expect(songs[0].title).toBe("A Song");
    const files = localSongFiles(songs[0].doc);
    expect(files?.chart).toBe("notes.chart");

    // Played from the same file: re-picking with `findSheet` alone would open the
    // UltraStar sheet here, which is a different song from the one on the jukebox.
    const source = await readLocalSource(songs[0].doc);
    expect(source?.meta.title).toBe("A Song");
    expect(source?.lanes.length).toBeGreaterThan(0);
    expect(source?.melody).toBeNull();
    closeFolder("chart-and-sheet");
  });
});

describe("folderFiles", () => {
  test("keeps the songs of one folder and leaves the others", async () => {
    await readFolder(
      directory("a", { One: { "song.ini": INI, "notes.chart": CHART } }),
      "test-a",
    );
    await readFolder(
      directory("b", { Two: { "song.ini": INI, "notes.chart": CHART } }),
      "test-b",
    );
    const files = folderFiles("test-a");
    expect(Object.keys(files)).toHaveLength(1);
    expect(Object.keys(files)[0].startsWith("folder://test-a/")).toBe(true);
    expect(Object.keys(folderFiles("test-b"))[0].startsWith("folder://test-b/")).toBe(true);
    closeFolder("test-a");
    closeFolder("test-b");
  });

  test("a written-down song reads back, and junk does not", () => {
    // Without this, a reloaded library lists songs nobody can play — the URL is there
    // but nothing knows what its chart was called.
    const files = { dirUrl: "folder://a/One/", chart: "notes.mid", audio: {}, art: null };
    expect(readLocalSongFiles(files)?.chart).toBe("notes.mid");
    expect(readLocalSongFiles({ ...files, package: true })?.package).toBe(true);
    expect(readLocalSongFiles({ dirUrl: "folder://a/One/" })).toBeNull();
    expect(readLocalSongFiles("nonsense")).toBeNull();
    expect(readLocalSongFiles(null)).toBeNull();
  });
});

describe("a .sng package in a folder", () => {
  test("is a song, with its chart, audio, cover and preview read from the package", async () => {
    const songs = await readFolder(
      directory("root", { "Test Song.sng": sngPackage() }),
      "sng-folder",
    );
    expect(songs).toHaveLength(1);
    const song = songs[0];
    expect(song.title).toBe("Package Song");
    expect(song.artist.name).toBe("The Packager");
    expect(song.durationMs).toBe(216181);
    expect(song.previewStartMs).toBe(30000);
    expect(song.offer.instruments).toEqual([
      { kind: "guitar", role: "lead", difficulties: ["expert"] },
    ]);
    expect(song.art).toContain("?entry=album.jpg");

    const files = localSongFiles(song.doc);
    expect(files?.package).toBe(true);
    expect(files?.chart).toBe("notes.chart");
    expect(files?.audio).toMatchObject({ lead_guitar: "guitar.opus" });
    expect(files?.art).toBe("album.jpg");
    expect(files?.preview).toBe("preview.opus");
    expect(localPreview(song.doc, song.previewStartMs)).toEqual({
      url: `${files?.dirUrl}Test%20Song.sng?entry=preview.opus`,
      startMs: 0,
    });

    const source = await readLocalSource(song.doc);
    expect(source?.meta.title).toBe("Package Song");
    expect(source?.lanes).toHaveLength(1);
    expect(source?.audio.stems.some((stem) => stem.url.includes("?entry=guitar.opus"))).toBe(true);
    expect(source?.meta.art).toContain("?entry=album.jpg");
  });

  test("a package with no preview clip previews its only audio", async () => {
    const songs = await readFolder(
      directory("root", { "One.sng": sngPackage(false) }),
      "sng-preview",
    );
    const files = localSongFiles(songs[0].doc)!;
    expect(localPreview(songs[0].doc, 30000)).toEqual({
      url: `${files.dirUrl}One.sng?entry=guitar.opus`,
      startMs: 30000,
    });
  });

  test("a package member is sliced out into an object URL", async () => {
    const songs = await readFolder(
      directory("root", { "One.sng": sngPackage() }),
      "sng-object",
    );
    const url = await localObjectUrl(`${songs[0].doc}?entry=album.jpg`);
    expect(url).not.toBeNull();
    const bytes = new Uint8Array(await (await fetch(url!)).arrayBuffer());
    expect([...bytes]).toEqual([0xff, 0xd8, 0xff, 0xd9]);
    URL.revokeObjectURL(url!);
  });

  test("a package beside a loose song does not hide the song", async () => {
    // A folder that holds one package **and** its own song.ini + notes.chart is two
    // songs, not one: the package branch used to return before the chart test.
    const songs = await readFolder(
      directory("root", {
        "Test Song.sng": sngPackage(),
        "song.ini": INI,
        "notes.chart": CHART,
        "song.ogg": "audio",
      }),
      "sng-and-loose",
    );
    expect(songs.map((song) => song.title)).toEqual(["Package Song", "A Song"]);
    expect(localSongFiles(songs[1].doc)?.chart).toBe("notes.chart");
    closeFolder("sng-and-loose");
  });

  test("a folder of packages is read even beside a changelog", async () => {
    const songs = await readFolder(
      directory("root", {
        "changelog.txt": "Fixed HOPOs in the intro\n",
        Pack: { "Test Song.sng": sngPackage() },
      }),
      "sng-collection",
    );
    expect(songs).toHaveLength(1);
    expect(songs[0].title).toBe("Package Song");
  });
});

describe("importFiles", () => {
  test("a failed re-import leaves the working copy alone, and a good one replaces it", async () => {
    const origin = opfsDirectory("origin");
    const imports = opfsDirectory("imports");
    origin.children.set("imports", imports);
    const original = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        storage: {
          getDirectory: async () =>
            opfsDirectoryHandle(origin, { failWrite: (name) => name === "broken.chart" }),
        },
      },
    });
    const song = [
      importFile("song.ini", INI, "Band/song.ini"),
      importFile("notes.chart", CHART, "Band/notes.chart"),
    ];
    // The id is the import's own: its name and a digest of what it holds.
    const base = importRoot(song)?.id ?? "";
    try {
      const first = await importFiles(song);
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(first.folder.id).toBe(base);
      expect(imports.children.has(base)).toBe(true);
      expect(
        folderRecords().some((record) => record.id === base && record.opfs === true),
      ).toBe(true);

      // A second selection with the same display name is a **different** import: it
      // must not replace the copy of the first one. Here it fails part-way through,
      // and the first copy is still exactly where it was.
      const other = [
        importFile("song.ini", INI, "Imported songs/song.ini"),
        importFile("broken.chart", CHART, "Imported songs/broken.chart"),
      ];
      const failed = await importFiles(other);
      expect(failed.ok).toBe(false);
      expect(imports.children.has(base)).toBe(true);
      expect(folderRecords().some((record) => record.id === base)).toBe(true);

      // The same import, whole this time: it is written beside the old generation,
      // then the old one goes, leaving one copy and one record.
      const second = await importFiles(song);
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(second.folder.id).toBe(`${base}-2`);
      expect(second.replaced).toEqual([base]);
      expect(imports.children.has(base)).toBe(false);
      expect(imports.children.has(`${base}-2`)).toBe(true);
      expect(
        folderRecords()
          .filter((record) => record.name === "Band")
          .map((record) => record.id),
      ).toEqual([`${base}-2`]);
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: original,
      });
      closeFolder(base);
      closeFolder(`${base}-2`);
    }
  });

  test("a same-named selection of other files is not replaced", async () => {
    const origin = opfsDirectory("origin");
    const imports = opfsDirectory("imports");
    origin.children.set("imports", imports);
    const original = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { storage: { getDirectory: async () => opfsDirectoryHandle(origin, {}) } },
    });
    // Two flat selections: both are called "Imported songs", and each holds a
    // different song. They are two sources, and neither deletes the other.
    const one = [importFile("notes.chart", CHART, ""), importFile("song.ini", INI, "")];
    const two = [importFile("notes.chart", CHART, ""), importFile("song.ogg", "audio", "")];
    const oneBase = importRoot(one)?.id ?? "";
    const twoBase = importRoot(two)?.id ?? "";
    try {
      const first = await importFiles(one);
      const second = await importFiles(two);
      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) return;
      expect(first.folder.name).toBe("Imported songs");
      expect(second.folder.name).toBe("Imported songs");
      expect(first.folder.id).toBe(oneBase);
      expect(second.folder.id).toBe(twoBase);
      expect(first.folder.id).not.toBe(second.folder.id);
      expect(imports.children.has(first.folder.id)).toBe(true);
      expect(imports.children.has(second.folder.id)).toBe(true);
      // Nothing was called a replacement of anything else.
      expect(second.replaced).toEqual([]);
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: original,
      });
      closeFolder(oneBase);
      closeFolder(twoBase);
    }
  });

  test("a generation left by a restore that was still reading is found in OPFS", async () => {
    const origin = opfsDirectory("origin");
    const imports = opfsDirectory("imports");
    origin.children.set("imports", imports);
    const original = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { storage: { getDirectory: async () => opfsDirectoryHandle(origin, {}) } },
    });
    const song = [
      importFile("song.ini", INI, "Band/song.ini"),
      importFile("notes.chart", CHART, "Band/notes.chart"),
    ];
    const base = importRoot(song)?.id ?? "";
    // What a restore left behind: an earlier generation of this import on disk that
    // no session map knows about, because this session never imported it.
    const stale = opfsDirectory(`${base}-7`);
    imports.children.set(stale.name, stale);
    try {
      const outcome = await importFiles(song);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      // The old generation is gone: found by looking at `imports/`, not by asking a
      // map that an import finishing during a restore would find empty.
      expect(outcome.replaced).toEqual([`${base}-7`]);
      expect(imports.children.has(`${base}-7`)).toBe(false);
      expect(imports.children.has(base)).toBe(true);
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: original,
      });
      closeFolder(base);
    }
  });

  test("a restored generation a live import has claimed is not resurrected", async () => {
    const origin = opfsDirectory("origin");
    const imports = opfsDirectory("imports");
    origin.children.set("imports", imports);
    const original = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { storage: { getDirectory: async () => opfsDirectoryHandle(origin, {}) } },
    });
    const song = [
      importFile("song.ini", INI, "Band/song.ini"),
      importFile("notes.chart", CHART, "Band/notes.chart"),
    ];
    const base = importRoot(song)?.id ?? "";
    try {
      // The live import wins the base and its predecessor is replaced.
      const first = await importFiles(song);
      const second = await importFiles(song);
      expect(first.ok && second.ok).toBe(true);
      if (!first.ok || !second.ok) return;
      expect(second.folder.id).toBe(`${base}-2`);

      // The restore still has the old record, and its directory is still there (a
      // restore caught in the middle of the replacement). It must not come back
      // beside the live row, whatever the map did or did not know.
      imports.children.set(base, opfsDirectory(base));
      const restored = await applyFolders([
        { id: base, name: "Band", songs: [], opfs: true },
      ]);
      expect(restored).toEqual([]);
      const ids = folderRecords().map((record) => record.id);
      expect(ids).not.toContain(base);
      expect(ids).toContain(`${base}-2`);
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: original,
      });
      closeFolder(base);
      closeFolder(`${base}-2`);
    }
  });

  test("an import never shadows a picked folder of the same name", async () => {
    const origin = opfsDirectory("origin");
    const imports = opfsDirectory("imports");
    origin.children.set("imports", imports);
    const original = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { storage: { getDirectory: async () => opfsDirectoryHandle(origin, {}) } },
    });
    const picked = folderId("Band");
    const song = [
      importFile("song.ini", INI, "Band/song.ini"),
      importFile("notes.chart", CHART, "Band/notes.chart"),
    ];
    const base = importRoot(song)?.id ?? "";
    try {
      // The player already has a folder of this name, picked off their disk.
      await applyFolders([
        {
          id: picked,
          name: "Band",
          handle: directory("Band", { "song.ini": INI, "notes.chart": CHART }),
          songs: [],
        },
      ]);

      const outcome = await importFiles(song);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      // The import's own key is not the picked folder's, which is what keeps the
      // two apart even when they carry the same display name.
      expect(outcome.folder.id).toBe(base);
      expect(outcome.replaced).toEqual([]);

      // The picked folder is not an import: its record and its handle stay, and the
      // import is a second source beside it rather than a replacement for it.
      const records = folderRecords().filter((record) => record.name === "Band");
      expect(records.map((record) => record.id).sort()).toEqual([picked, base].sort());
      expect(records.find((record) => record.id === picked)?.opfs).toBeUndefined();
      expect(records.find((record) => record.id === base)?.opfs).toBe(true);
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: original,
      });
      closeFolder(picked);
      closeFolder(base);
    }
  });
});

describe("applyFolders", () => {
  test("a restored folder's songs are playable again, not merely listed", async () => {
    const root = directory("Song Library", {
      Collection: { "Band - One": { "song.ini": INI, "notes.chart": CHART } },
    });
    const songs = await readFolder(root, "restored");
    const files = folderFiles("restored");
    expect(Object.keys(files)).toEqual([songs[0].doc]);

    // A fresh page: the library is written down, the reading maps are empty.
    closeFolder("restored");
    expect(localSongFiles(songs[0].doc)).toBeNull();

    // Written down the old way — the handle and the songs but not what each song was
    // read with — the folder lists fine and every one of its songs has no chart, which
    // is the "No chart for this instrument" a restored folder used to give.
    await applyFolders([{ id: "restored", name: "Song Library", handle: root, songs }]);
    expect(await readLocalSource(songs[0].doc)).toBeNull();

    // With the file names written down as well, the same folder plays.
    await applyFolders([{ id: "restored", name: "Song Library", handle: root, songs, files }]);
    expect(localSongFiles(songs[0].doc)?.chart).toBe("notes.chart");
    expect((await readLocalSource(songs[0].doc))?.meta.title).toBe("A Song");
    closeFolder("restored");
  });

  test("a record that names no audio is repaired, because it is a song that plays silence", async () => {
    // A record from a build that looked for the chart and not for the stems. The
    // chart reads, the screen fills — and every run is silent, which is the one
    // failure a player cannot diagnose from the outside.
    const root = directory("root", {
      One: { "song.ini": INI, "notes.chart": CHART, "guitar.ogg": "audio", "bass.ogg": "audio" },
    });
    const songs = await readFolder(root, "noaudio");
    const files = folderFiles("noaudio");
    const doc = songs[0].doc;
    const stale = { ...files, [doc]: { ...files[doc], audio: {}, checked: false } };
    closeFolder("noaudio");
    await applyFolders([{ id: "noaudio", name: "root", handle: root, songs, files: stale }]);
    expect(Object.keys(localSongFiles(doc)?.audio ?? {})).toHaveLength(0);

    expect(await repairFolderFiles("noaudio")).toBe(1);
    expect(localSongFiles(doc)?.audio).toMatchObject({
      lead_guitar: "guitar.ogg",
      bass: "bass.ogg",
    });
    // Repaired once, like any other record: a folder that is already whole is not walked.
    expect(await repairFolderFiles("noaudio")).toBe(0);
    closeFolder("noaudio");
  });

  test("a checked chart-only record is not listed again", async () => {
    // A song with no audio at all is a chart-only song, not a broken record: once the
    // folder has been listed, re-listing it on every restore changes nothing.
    const root = directory("root", { One: { "notes.chart": CHART } });
    const songs = await readFolder(root, "chart-only");
    const files = folderFiles("chart-only");
    const doc = songs[0].doc;
    closeFolder("chart-only");
    // A record from a build before `checked` existed: no audio and no note that the
    // folder was listed, so it is repaired once.
    await applyFolders([
      {
        id: "chart-only",
        name: "root",
        handle: root,
        songs,
        files: { [doc]: { ...files[doc], audio: {}, checked: false } },
      },
    ]);
    expect(await repairFolderFiles("chart-only")).toBe(1);
    expect(localSongFiles(doc)?.checked).toBe(true);
    // Checked, and still no audio: that is its final answer, so it is not walked.
    expect(await repairFolderFiles("chart-only")).toBe(0);
    closeFolder("chart-only");
  });

  test("a stale folder keeps its version when another folder is repaired", async () => {
    const currentRoot = directory("Current", {
      One: { "song.ini": INI, "notes.chart": CHART, "song.ogg": "audio" },
    });
    const staleRoot = directory("Stale", {
      Two: { "song.ini": INI, "notes.chart": CHART },
    });
    const songs = await readFolder(currentRoot, "version-current");
    const files = folderFiles("version-current");
    const staleSongs = await readFolder(staleRoot, "version-stale");
    closeFolder("version-current");
    closeFolder("version-stale");
    const doc = songs[0].doc;
    await applyFolders([
      {
        id: "version-current",
        name: "Current",
        handle: currentRoot,
        songs,
        files: { [doc]: { ...files[doc], audio: {}, checked: false } },
        version: FOLDER_SCAN_VERSION,
      },
      {
        id: "version-stale",
        name: "Stale",
        handle: staleRoot,
        songs: staleSongs,
        version: FOLDER_SCAN_VERSION - 1,
      },
    ]);
    expect(folderNeedsRescan("version-stale")).toBe(true);

    // Repairing the current folder persists every folder; the stale one must keep the
    // version it was stored with rather than being stamped current.
    expect(await repairFolderFiles("version-current")).toBe(1);
    const records = folderRecords();
    expect(records.find((record) => record.id === "version-current")?.version).toBe(
      FOLDER_SCAN_VERSION,
    );
    expect(records.find((record) => record.id === "version-stale")?.version).toBe(
      FOLDER_SCAN_VERSION - 1,
    );
    closeFolder("version-current");
    closeFolder("version-stale");
  });

  test("a folder that cannot be walked keeps its songs, and another still restores", async () => {
    const stored = await readFolder(
      directory("Stored", { One: { "song.ini": INI, "notes.chart": CHART } }),
      "walk-fail",
    );
    const files = folderFiles("walk-fail");
    const other = directory("Other", { Two: { "song.ini": INI, "notes.chart": CHART } });
    const otherSongs = await readFolder(other, "walk-ok");
    closeFolder("walk-fail");
    closeFolder("walk-ok");
    await applyFolders([
      {
        id: "walk-fail",
        name: "Stored",
        handle: brokenDirectory("Stored"),
        songs: stored,
        files,
        version: FOLDER_SCAN_VERSION - 1,
      },
      {
        id: "walk-ok",
        name: "Other",
        handle: other,
        songs: otherSongs,
        version: FOLDER_SCAN_VERSION - 1,
      },
    ]);

    // One bad folder is not a restore that fails: it comes back with what it had.
    expect(await rescanFolder("walk-fail")).toEqual(stored);
    // It is still stale, so a later Reconnect tries again.
    expect(folderNeedsRescan("walk-fail")).toBe(true);
    // The other folder still reads.
    expect(await rescanFolder("walk-ok")).toHaveLength(otherSongs.length);
    expect(folderNeedsRescan("walk-ok")).toBe(false);
    closeFolder("walk-fail");
    closeFolder("walk-ok");
  });

  test("a record from a build that kept no file names is repaired from the folder", async () => {
    // What an older build left behind: the handle and the songs, and nothing about what
    // each song was read with. The names are all one listing away, so the folder can be
    // made playable again rather than being a list of songs with no chart and no sound.
    const root = directory("root", {
      One: { "song.ini": INI, "notes.chart": CHART, "song.ogg": "audio", "album.png": "png" },
    });
    const songs = await readFolder(root, "legacy");
    closeFolder("legacy");
    await applyFolders([{ id: "legacy", name: "root", handle: root, songs }]);
    expect(await readLocalSource(songs[0].doc)).toBeNull();

    expect(await repairFolderFiles("legacy")).toBe(1);

    expect(localSongFiles(songs[0].doc)).toMatchObject({
      chart: "notes.chart",
      ini: "song.ini",
      art: "album.png",
      audio: { master: "song.ogg" },
    });
    expect((await readLocalSource(songs[0].doc))?.meta.title).toBe("A Song");
    // Repaired once: a folder that is already whole is not walked again.
    expect(await repairFolderFiles("legacy")).toBe(0);
    closeFolder("legacy");
  });

  test("a listing that fails is not written down as a song with no audio", async () => {
    // A record from a build that had not looked for stems, and a folder that cannot
    // be listed right now: a revoked permission or a disk that has gone. The failure
    // is a question that was not answered, not the answer "there are no stems".
    const root = directory("root", {
      One: { "song.ini": INI, "notes.chart": CHART, "song.ogg": "audio", "preview.ogg": "clip" },
    });
    const songs = await readFolder(root, "listing-fail");
    const files = folderFiles("listing-fail");
    const doc = songs[0].doc;
    closeFolder("listing-fail");
    const stale = { ...files, [doc]: { ...files[doc], audio: {}, checked: false } };
    // The root still hands over the song's directory; that directory will not list.
    const unreadable = directory("root", {
      One: { "song.ini": INI, "notes.chart": CHART, "song.ogg": "audio", "preview.ogg": "clip" },
    });
    Object.defineProperty(unreadable, "getDirectoryHandle", {
      configurable: true,
      value: async () => brokenDirectory("One"),
    });
    await applyFolders([
      { id: "listing-fail", name: "root", handle: unreadable, songs, files: stale },
    ]);

    expect(await repairFolderFiles("listing-fail")).toBe(0);
    // No record was written: nothing claims the folder was listed.
    expect(localSongFiles(doc)?.checked).not.toBe(true);
    expect(localSongFiles(doc)?.audio).toEqual({});

    // And the failure is not permanent: the next listing that happens repairs the
    // record, so the preview master and its clip are still there to find.
    await applyFolders([
      { id: "listing-fail", name: "root", handle: root, songs, files: stale },
    ]);
    expect(await repairFolderFiles("listing-fail")).toBe(1);
    expect(localSongFiles(doc)?.audio).toEqual({ master: "song.ogg" });
    expect(localSongFiles(doc)?.preview).toBe("preview.ogg");
    closeFolder("listing-fail");
  });

  test("a folder opened while the restore is reading does not truncate the list", async () => {
    const index = installIndexedDb();
    try {
      // What the last visit left: one folder, remembered.
      const kept = directory("Kept", { One: { "song.ini": INI, "notes.chart": CHART } });
      await saveFolders([{ id: "kept", name: "Kept", handle: kept, songs: [] }]);

      // A folder opened before `loadFolders()` answered. The reading map holds only
      // this one, so a write now would be a list of one — and the remembered folder
      // would be gone before the restore ever got to it.
      await readFolder(
        directory("Extra", { Two: { "song.ini": INI, "notes.chart": CHART } }),
        "extra",
      );
      await rescanFolder("extra");

      const restored = await restoreFolders();
      expect(restored.map((folder) => folder.id)).toContain("kept");

      // The write after the restore is the whole list, not the sparse one.
      const stored = await loadFolders();
      expect(stored.map((folder) => folder.id)).toContain("kept");
      expect(stored.map((folder) => folder.id)).toContain("extra");
    } finally {
      index.restore();
      closeFolder("extra");
      closeFolder("kept");
    }
  });

  test("an import whose OPFS copy is gone is dropped rather than retried", async () => {
    const origin = opfsDirectory("origin");
    const imports = opfsDirectory("imports");
    origin.children.set("imports", imports);
    const original = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { storage: { getDirectory: async () => opfsDirectoryHandle(origin, {}) } },
    });
    const index = installIndexedDb();
    try {
      // Storage as the last visit left it, naming an import whose bytes are not
      // there: the browser evicted the copy, or somebody cleared site data.
      await saveFolders([{ id: "evicted", name: "Imported songs", songs: [], opfs: true }]);

      const restored = await restoreFolders();
      expect(restored).toEqual([]);
      // The record is pruned, once, rather than looked for on every load for the
      // rest of the browser's life.
      expect((await loadFolders()).some((record) => record.id === "evicted")).toBe(false);
    } finally {
      index.restore();
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: original,
      });
      closeFolder("evicted");
    }
  });

  test("an OPFS import is reopened from its id and comes back granted, never locked", async () => {
    const root = directory("Imported", {
      One: { "song.ini": INI, "notes.chart": CHART },
    });
    // An OPFS handle that *would* ask is still an import: its access comes from
    // where it lives, not from a permission prompt.
    Object.defineProperty(root, "queryPermission", {
      configurable: true,
      value: async () => "prompt",
    });
    const imports = {
      async getDirectoryHandle(name: string) {
        if (name === "opfs-restored") return root;
        throw new Error("no such import");
      },
      async removeEntry() {
        // Deleting is covered by the browser; this test is about restoring.
      },
    };
    const origin = {
      async getDirectoryHandle(name: string) {
        if (name === "imports") return imports;
        throw new Error("no such directory");
      },
    };
    const original = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { storage: { getDirectory: async () => origin } },
    });
    try {
      // The record carries no handle: the directory is the source of truth, and
      // OPFS is this origin's own storage, so there is no permission to lose.
      const restored = await applyFolders([
        { id: "opfs-restored", name: "Imported", songs: [], opfs: true },
      ]);
      expect(restored).toHaveLength(1);
      expect(restored[0]).toMatchObject({ id: "opfs-restored", imported: true, access: "granted" });
      expect(await isLocalFolderLocked("folder://opfs-restored/One/notes.chart")).toBe(false);
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: original,
      });
      closeFolder("opfs-restored");
    }
  });
});

describe("folderAccess", () => {
  const handle = (permission?: () => Promise<string>) =>
    ({ name: "x", kind: "directory", ...(permission ? { queryPermission: permission } : {}) }) as unknown as FileSystemDirectoryHandle;

  test("a browser that cannot be asked is a browser that has not refused", async () => {
    expect(await folderAccess(handle())).toBe("granted");
  });

  test("says what the browser says", async () => {
    expect(await folderAccess(handle(async () => "prompt"))).toBe("prompt");
    expect(await folderAccess(handle(async () => "denied"))).toBe("denied");
  });

  test("a question that throws is not an answer", async () => {
    expect(
      await folderAccess(
        handle(async () => {
          throw new Error("no");
        }),
      ),
    ).toBe("unknown");
  });

  test("a folder the browser wants a press for is said as locked", async () => {
    await applyFolders([
      { id: "locked", name: "Song Library", handle: handle(async () => "prompt"), songs: [] },
      { id: "ready", name: "Song Library", handle: handle(async () => "granted"), songs: [] },
    ]);
    expect(await isLocalFolderLocked("folder://locked/One/notes.chart")).toBe(true);
    expect(await isLocalFolderLocked("folder://ready/One/notes.chart")).toBe(false);
    // A folder nobody has open is not locked: there is nothing to ask about.
    expect(await isLocalFolderLocked("folder://gone/One/notes.chart")).toBe(false);
  });
});
