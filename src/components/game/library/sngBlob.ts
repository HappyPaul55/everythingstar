/**
 * A Blob over a package member's bytes, and no copy of the buffer around them.
 *
 * An unmasked member is already its own `Uint8Array`, and a Blob copies an array
 * view by the view's own byte range, so the slice this replaced was only cost — a
 * second copy of a stem that may be tens of megabytes. The cast is the type
 * system's: `unmask` always builds a fresh `Uint8Array`, so its buffer is the
 * `ArrayBuffer` `BlobPart` asks for.
 *
 * It lives apart from `library/sng.ts` so a folder read can turn a member into an
 * object URL without statically importing the package reader.
 */
export function sngBlob(bytes: Uint8Array, type: string): Blob {
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type });
}
