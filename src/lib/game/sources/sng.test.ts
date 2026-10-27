import { describe, expect, test } from "bun:test";
import { chartProblems } from "../track";
import {
  findEntry,
  parseSngSource,
  readSngEntry,
  readSngEntryFromFile,
  readSngHeader,
  readSngHeaderFromFile,
  sngEntryName,
  sngEntryUrl,
  sngFiles,
} from "./sng";

const encoder = new TextEncoder();

/** A deliberately non-zero mask, so a test that forgets to unmask cannot pass. */
const MASK = new Uint8Array([0x13, 0x9a, 0x2c, 0x44, 0xf1, 0x08, 0xa7, 0x5d, 0xe2, 0x71, 0x3b, 0xc6, 0x90, 0x1d, 0x6e, 0xbb]);

const CHART = [
  "[Song]",
  "{",
  "  Name = Package Song",
  "  Artist = The Packager",
  "  Resolution = 480",
  '  MusicStream = "music.bin"',
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

interface Fixture {
  bytes: Uint8Array<ArrayBuffer>;
  entries: Record<string, Uint8Array>;
}

/** Build a real `.sng` header, file index and masked data. */
function buildSng(
  metadata: Record<string, string>,
  files: Record<string, Uint8Array>,
  mask = MASK,
): Fixture {
  const names = Object.keys(files);
  const metadataPairs: number[] = [];
  pushU64(metadataPairs, 0);
  pushU64(metadataPairs, Object.keys(metadata).length);
  for (const [key, value] of Object.entries(metadata)) {
    const keyBytes = encoder.encode(key);
    const valueBytes = encoder.encode(value);
    pushI32(metadataPairs, keyBytes.length);
    metadataPairs.push(...keyBytes);
    pushI32(metadataPairs, valueBytes.length);
    metadataPairs.push(...valueBytes);
  }
  // Replace the placeholder with the section's body length (the count and pairs,
  // not the length field itself).
  writeU64(metadataPairs, 0, metadataPairs.length - 8);

  const entrySize = (name: string) => 1 + encoder.encode(name).length + 8 + 8;
  const fileMetaLen = names.reduce((total, name) => total + entrySize(name), 0) + 8;
  const headerLen =
    26 + metadataPairs.length + 8 + fileMetaLen + 8;

  // The file data is concatenated in the order the index names it.
  let at = headerLen;
  const indexes = new Map<string, { index: number; length: number }>();
  const dataBytes: number[] = [];
  for (const name of names) {
    const plain = files[name]!;
    indexes.set(name, { index: at, length: plain.length });
    dataBytes.push(...maskBytes(plain, mask));
    at += plain.length;
  }

  const fileMeta: number[] = [];
  pushU64(fileMeta, fileMetaLen);
  pushU64(fileMeta, names.length);
  for (const name of names) {
    const nameBytes = encoder.encode(name);
    const found = indexes.get(name)!;
    fileMeta.push(nameBytes.length);
    fileMeta.push(...nameBytes);
    pushU64(fileMeta, found.length);
    pushU64(fileMeta, found.index);
  }

  const out: number[] = [];
  out.push(...encoder.encode("SNGPKG"));
  pushU32(out, 1);
  out.push(...mask);
  out.push(...metadataPairs);
  out.push(...fileMeta);
  pushU64(out, dataBytes.length);
  out.push(...dataBytes);

  const bytes = new Uint8Array(out);
  const entries: Record<string, Uint8Array> = {};
  for (const name of names) entries[name] = files[name]!;
  return { bytes, entries };
}

function maskBytes(bytes: Uint8Array, mask: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) {
    out[index] = bytes[index]! ^ (mask[index % 16]! ^ (index & 0xff));
  }
  return out;
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

function fixture(): Fixture {
  return buildSng(
    {
      name: "Package Song",
      artist: "The Packager",
      album: "The Album",
      year: "2003",
      song_length: "216181",
      preview_start_time: "30000",
    },
    {
      "notes.chart": encoder.encode(CHART),
      "music.bin": new Uint8Array([1, 2, 3, 4, 5]),
      "album.jpg": new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
      "preview.opus": new Uint8Array([0x4f, 0x67, 0x67, 0x53]),
    },
  );
}

describe("readSngHeader", () => {
  test("reads the metadata and the file index", () => {
    const { bytes } = fixture();
    const read = readSngHeader(bytes);
    expect(read.problems).toEqual([]);
    expect(read.header?.version).toBe(1);
    expect(read.header?.metadata.name).toBe("Package Song");
    expect(read.header?.metadata.preview_start_time).toBe("30000");
    expect(read.header?.files.map((entry) => entry.name)).toEqual([
      "notes.chart",
      "music.bin",
      "album.jpg",
      "preview.opus",
    ]);
    expect(read.header?.dataLength).toBe(bytes.length - (read.header?.dataStart ?? 0));
  });

  test("unmasks each file from its own position", () => {
    const { bytes, entries } = fixture();
    const read = readSngHeader(bytes);
    const chart = read.header!.files.find((entry) => entry.name === "notes.chart")!;
    const extracted = readSngEntry(read.header!, bytes, chart)!;
    expect(new TextDecoder().decode(extracted)).toBe(CHART);
    expect(extracted).toEqual(entries["notes.chart"]!);
  });

  test("a file outside the data section is refused and named", () => {
    const { bytes } = fixture();
    // Point the trailing data length at nothing; every entry now claims bytes the
    // package says are not there.
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const header = readSngHeader(bytes).header!;
    const dataLengthAt = header.dataStart - 8;
    view.setBigUint64(dataLengthAt, 0n, true);
    const read = readSngHeader(bytes);
    expect(read.header?.files).toEqual([]);
    expect(read.problems.some((problem) => problem.includes("outside the package"))).toBe(true);
  });

  test("refuses something that is not a package", () => {
    expect(readSngHeader(new Uint8Array([1, 2, 3])).header).toBeNull();
    expect(readSngHeader(encoder.encode("not a package at all, just text")).header).toBeNull();
  });
});

describe("readSngHeaderFromFile", () => {
  test("reads the header from a Blob without needing the whole file", async () => {
    const { bytes } = fixture();
    const read = await readSngHeaderFromFile(new Blob([bytes]));
    expect(read.problems).toEqual([]);
    expect(read.header?.metadata.name).toBe("Package Song");

    const chart = read.header!.files.find((entry) => entry.name === "notes.chart")!;
    const extracted = await readSngEntryFromFile(new Blob([bytes]), read.header!, chart);
    expect(new TextDecoder().decode(extracted!)).toBe(CHART);
  });
});

describe("sngFiles", () => {
  test("finds the chart, the audio, the cover and the preview by their names", () => {
    const { bytes } = buildSng(
      { name: "Test Song" },
      {
        "notes.mid": new Uint8Array([0x4d, 0x54, 0x68, 0x64]),
        "guitar.opus": new Uint8Array([1]),
        "album.jpg": new Uint8Array([2]),
        "preview.ogg": new Uint8Array([3]),
      },
    );
    const files = sngFiles(readSngHeader(bytes).header!);
    expect(files.chart?.name).toBe("notes.mid");
    expect(files.audio.lead_guitar?.name).toBe("guitar.opus");
    expect(files.art?.name).toBe("album.jpg");
    expect(files.preview?.name).toBe("preview.ogg");
  });

  test("matches a conventional name inside a package folder", () => {
    const { bytes } = buildSng(
      { name: "Nested" },
      {
        "charts/notes.chart": encoder.encode(CHART),
        "audio/guitar.opus": new Uint8Array([1]),
        "art/album.jpg": new Uint8Array([2]),
      },
    );
    const header = readSngHeader(bytes).header!;
    expect(findEntry(header.files, ["notes.chart"])?.name).toBe("charts/notes.chart");
    expect(sngFiles(header).audio.lead_guitar?.name).toBe("audio/guitar.opus");
  });

  test("matches a capitalised member by its lowercased basename", () => {
    // `Audio/Guitar.opus` has to answer to `guitar.opus` just as `audio/guitar.opus`
    // does: both indexes are lowercased, or one case finds what the other misses.
    const { bytes } = buildSng(
      { name: "Caps" },
      {
        "charts/notes.chart": encoder.encode(CHART),
        "Audio/Guitar.opus": new Uint8Array([1]),
      },
    );
    const header = readSngHeader(bytes).header!;
    expect(findEntry(header.files, ["guitar.opus"])?.name).toBe("Audio/Guitar.opus");
    expect(sngFiles(header).audio.lead_guitar?.name).toBe("Audio/Guitar.opus");
  });
});

describe("parseSngSource", () => {
  test("reads the package as a source, with its metadata and embedded files", async () => {
    const { bytes } = fixture();
    const header = readSngHeader(bytes).header!;
    const chart = sngFiles(header).chart!;
    const chartBytes = readSngEntry(header, bytes, chart)!;
    const source = await parseSngSource({
      header,
      chart,
      chartBytes,
      urlFor: (entry) => `pkg://${entry.name}`,
      id: "package-song",
    });

    expect(source).not.toBeNull();
    expect(source!.meta.title).toBe("Package Song");
    expect(source!.meta.artist).toBe("The Packager");
    expect(source!.meta.album).toBe("The Album");
    expect(source!.meta.durationMs).toBe(216181);
    expect(source!.meta.previewStartMs).toBe(30000);
    expect(source!.meta.art).toBe("pkg://album.jpg");
    expect(source!.lanes).toHaveLength(1);
    expect(chartProblems(source!.lanes[0]!)).toEqual([]);
    expect(source!.audio.preview).toBe("pkg://preview.opus");
    // `MusicStream = "music.bin"` is not one of the conventional names, so this is
    // the package index turning it into the entry it is.
    expect(source!.audio.stems[0]?.url).toBe("pkg://music.bin");
  });

  test("a package with no chart is not a source", async () => {
    const { bytes } = buildSng(
      { name: "Audio Only" },
      { "song.ogg": new Uint8Array([1, 2, 3]) },
    );
    const header = readSngHeader(bytes).header!;
    expect(await parseSngSource({
      header,
      chart: { name: "song.ogg", length: 3, index: header.dataStart },
      chartBytes: new Uint8Array([1, 2, 3]),
      urlFor: (entry) => entry.name,
    })).toBeNull();
  });
});

describe("package entry URLs", () => {
  test("round-trip the entry name through a local package URL", () => {
    const url = sngEntryUrl("folder://library/Artist%20-%20Song.song.sng", "art/album.jpg");
    expect(url).toBe("folder://library/Artist%20-%20Song.song.sng?entry=art%2Falbum.jpg");
    expect(sngEntryName(url)).toBe("art/album.jpg");
  });
});
