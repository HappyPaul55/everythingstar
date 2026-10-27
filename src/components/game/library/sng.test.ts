import { describe, expect, test } from "bun:test";
import { readSngHeader } from "../../../lib/game/sources/sng";
import { sngObjectUrl } from "./sng";

const encoder = new TextEncoder();

/** A mask with no zero byte, so a copy that skipped the unmasking cannot pass. */
const MASK = new Uint8Array([
  0x13, 0x9a, 0x2c, 0x44, 0xf1, 0x08, 0xa7, 0x5d, 0xe2, 0x71, 0x3b, 0xc6, 0x90, 0x1d, 0x6e,
  0xbb,
]);

/** Build a real `.sng` with the metadata table, file index and masked data. */
function buildSng(files: [string, Uint8Array][]): Uint8Array {
  const metadata: [string, string][] = [["name", "A Package"]];
  const metadataBody: number[] = [];
  pushU64(metadataBody, 0);
  pushU64(metadataBody, metadata.length);
  for (const [key, value] of metadata) {
    const keyBytes = encoder.encode(key);
    const valueBytes = encoder.encode(value);
    pushI32(metadataBody, keyBytes.length);
    metadataBody.push(...keyBytes);
    pushI32(metadataBody, valueBytes.length);
    metadataBody.push(...valueBytes);
  }
  writeU64(metadataBody, 0, metadataBody.length - 8);

  const fileMetaLen = files.reduce(
    (total, [name]) => total + 1 + encoder.encode(name).length + 16,
    8,
  );
  const headerLen = 26 + metadataBody.length + 8 + fileMetaLen + 8;
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
    // The mask is applied with the byte's position **inside this file**.
    for (let index = 0; index < plain.length; index += 1) {
      data.push(plain[index]! ^ (MASK[index % 16]! ^ (index & 0xff)));
    }
  }

  const out: number[] = [];
  out.push(...encoder.encode("SNGPKG"));
  pushU32(out, 1);
  out.push(...MASK);
  out.push(...metadataBody, ...fileMeta);
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

describe("sngObjectUrl", () => {
  test("an object URL holds exactly the member's bytes, with its type", async () => {
    // The member is neither first in the package nor the only one after it, and it
    // runs past the mask's 16 bytes: a URL that carried the package around it, or
    // an unmasked copy, would not equal these bytes.
    const member = new Uint8Array(64);
    for (let index = 0; index < member.length; index += 1) {
      member[index] = (index * 7 + 3) & 0xff;
    }
    const packageBytes = buildSng([
      ["notes.chart", encoder.encode("[Song]\n{\n  Name = A Package\n}\n")],
      ["preview.opus", member],
      ["album.jpg", new Uint8Array([0xff, 0xd8, 0xff, 0xd9])],
    ]);
    const header = readSngHeader(packageBytes).header;
    expect(header).not.toBeNull();
    const entry = header!.files.find((file) => file.name === "preview.opus")!;
    expect(entry.index).toBeGreaterThan(0);

    const url = sngObjectUrl(packageBytes, header!, entry);
    expect(url).not.toBeNull();
    try {
      const response = await fetch(url!);
      expect(response.headers.get("content-type")).toBe("audio/ogg");
      expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([...member]);
    } finally {
      URL.revokeObjectURL(url!);
    }
  });
});
