/**
 * Byte-range arithmetic for the offline service worker.
 *
 * Kept separate from the worker itself so the awkward cases — an open end, a
 * suffix range, a range past the file, a header that is not a range at all — are
 * unit-tested without a service worker. The app repository has the same arithmetic
 * in `native/sw-range.ts`: two builds, two workers, one contract.
 */

export interface ByteRange {
  /** First byte, inclusive. */
  start: number;
  /** Last byte, inclusive. */
  end: number;
}

/** `unsatisfiable` is an RFC 7233 416, not "serve the whole file". */
export type RangeResult = ByteRange | null | "unsatisfiable";

/**
 * Parse a single `Range: bytes=…` header against a known file size.
 *
 * Multiple ranges are deliberately not supported: media elements ask for one, and
 * a multipart/byteranges response would be far more code than a download needs.
 * An unparseable header is treated as no range, which is the safe answer for a
 * cache that already holds the whole body.
 */
export function parseRange(
  header: string | null | undefined,
  total: number,
): RangeResult {
  if (!header) return null;
  if (!Number.isFinite(total) || total < 0) return "unsatisfiable";

  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match) return null;

  const startText = match[1] ?? "";
  const endText = match[2] ?? "";
  if (startText === "" && endText === "") return "unsatisfiable";

  let start: number;
  let end: number;

  if (startText === "") {
    // `bytes=-500`: the last 500 bytes.
    const suffix = Number(endText);
    if (!Number.isFinite(suffix) || suffix <= 0) return "unsatisfiable";
    start = Math.max(0, total - suffix);
    end = total - 1;
  } else {
    start = Number(startText);
    end = endText === "" ? total - 1 : Number(endText);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  }

  if (start < 0 || start >= total || end < start) return "unsatisfiable";
  return { start, end: Math.min(end, total - 1) };
}

/** The number of bytes a response body should contain. */
export function rangeLength(range: ByteRange): number {
  return range.end - range.start + 1;
}

/** A `Content-Range` header for one range, or for a 416. */
export function contentRange(range: ByteRange | null, total: number): string {
  return range
    ? `bytes ${range.start}-${range.end}/${total}`
    : `bytes */${total}`;
}
