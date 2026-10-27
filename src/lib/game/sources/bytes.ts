/**
 * Reading bytes and text without trusting them.
 *
 * A source file is somebody else's, and half of these formats are binary. This is
 * the small set of primitives the translators share, so each one says its own
 * rules rather than re-deriving what a big-endian `int16` is. Every read past the
 * end answers zero rather than throwing: a truncated file is an ordinary file, and
 * a translator that reads past its end should notice from what it got, not from an
 * exception.
 */

/** A cursor over a byte array, big-endian (which is what MIDI and most of these use). */
export class ByteReader {
  private readonly bytes: Uint8Array;
  private readonly view: DataView;
  offset = 0;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get length(): number {
    return this.bytes.length;
  }

  get remaining(): number {
    return Math.max(0, this.bytes.length - this.offset);
  }

  eof(): boolean {
    return this.offset >= this.bytes.length;
  }

  u8(): number {
    if (this.offset >= this.bytes.length) return 0;
    return this.bytes[this.offset++] ?? 0;
  }

  i8(): number {
    const value = this.u8();
    return value >= 128 ? value - 256 : value;
  }

  u16(): number {
    if (this.offset + 2 > this.bytes.length) return 0;
    const value = this.view.getUint16(this.offset);
    this.offset += 2;
    return value;
  }

  i16(): number {
    if (this.offset + 2 > this.bytes.length) return 0;
    const value = this.view.getInt16(this.offset);
    this.offset += 2;
    return value;
  }

  u32(): number {
    if (this.offset + 4 > this.bytes.length) return 0;
    const value = this.view.getUint32(this.offset);
    this.offset += 4;
    return value;
  }

  peek(n = 0): number {
    return this.bytes[this.offset + n] ?? 0;
  }

  read(n: number): Uint8Array {
    const end = Math.min(this.bytes.length, this.offset + n);
    const slice = this.bytes.subarray(this.offset, end);
    this.offset = end;
    return slice;
  }

  skip(n: number): void {
    this.offset = Math.min(this.bytes.length, this.offset + Math.max(0, n));
  }

  /** `n` bytes as Latin-1, which is how these files write track names and events. */
  latin1(n: number): string {
    const slice = this.read(n);
    let out = "";
    for (const byte of slice) out += String.fromCharCode(byte);
    return out;
  }
}

/**
 * Bytes as text.
 *
 * Three encodings, in the order they can be told apart, because a chart collection
 * is a decade of tools sharing files:
 *
 * - **UTF-16**, when a byte-order mark says so, or when the bytes do — a `song.ini`
 *   written on Windows is often this, and reading it as UTF-8 gives a title with a
 *   space between every letter, or nothing at all.
 * - **UTF-8**, when it decodes cleanly.
 * - **The Windows code page** otherwise: a chart from an old tool is very often
 *   CP-1252, and a strict decoder would return `Mot?rhead`, which looks like a
 *   correct name until somebody reads it.
 */
export function decodeText(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return dropBom(new TextDecoder("utf-16le").decode(bytes.subarray(2)));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return dropBom(new TextDecoder("utf-16be").decode(bytes.subarray(2)));
  }
  // No mark, but a NUL where text should be is UTF-16 and nothing else.
  const head = bytes.subarray(0, Math.min(bytes.length, 64));
  const nul = head.indexOf(0);
  if (head.length >= 4 && nul >= 0) {
    const decoder = new TextDecoder(nul % 2 === 0 ? "utf-16be" : "utf-16le");
    return dropBom(decoder.decode(bytes));
  }
  // A NUL is the usual tell, but a CJK title leaves the first 64 bytes with none at
  // all, so where the zero bytes fall across a longer sample is the other one.
  const utf16 = utf16Guess(bytes);
  if (utf16) return dropBom(new TextDecoder(utf16).decode(bytes));
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (!utf8.includes("\uFFFD")) return dropBom(utf8);
  return dropBom(new TextDecoder("windows-1252").decode(bytes));
}

/** How much of a byte-order-less file the UTF-16 guess looks at. */
const UTF16_SAMPLE = 512;

/** What one parity of a UTF-16 sample looks like: mostly zeros, or almost none. */
const UTF16_ZERO_RATE = 0.3;
const UTF16_CLEAN_RATE = 0.02;

/**
 * Which UTF-16 a byte-order-less array is, from where its zero bytes fall.
 *
 * UTF-16 writes every ASCII character as a low byte and a zero high byte, so the
 * zeros sit on one parity — odd for little-endian, even for big-endian. A file of CJK
 * text has fewer zeros, but the ASCII keys and punctuation around it still put them on
 * one side. **A clear difference is the tell**: one parity mostly zero and the other
 * nearly none. A UTF-8 or CP-1252 text has no zero bytes at all, so this can only fire
 * on a file that is already full of them, and anything less clear is left to the
 * decoders that follow.
 */
function utf16Guess(bytes: Uint8Array): "utf-16le" | "utf-16be" | null {
  if (bytes.length < 8) return null;
  const sample = Math.min(bytes.length, UTF16_SAMPLE);
  let evenZeros = 0;
  let oddZeros = 0;
  for (let at = 0; at < sample; at += 1) {
    if (bytes[at] !== 0) continue;
    if (at % 2 === 0) evenZeros += 1;
    else oddZeros += 1;
  }
  const evenRate = evenZeros / Math.ceil(sample / 2);
  const oddRate = oddZeros / Math.floor(sample / 2);
  if (oddRate >= UTF16_ZERO_RATE && evenRate <= UTF16_CLEAN_RATE) return "utf-16le";
  if (evenRate >= UTF16_ZERO_RATE && oddRate <= UTF16_CLEAN_RATE) return "utf-16be";
  return null;
}

function dropBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Do these bytes start with this ASCII tag? (`MThd`, `PK`, …) */
export function startsWithAscii(bytes: Uint8Array, tag: string): boolean {
  if (bytes.length < tag.length) return false;
  for (let i = 0; i < tag.length; i += 1) {
    if (bytes[i] !== tag.charCodeAt(i)) return false;
  }
  return true;
}
