/**
 * Does this URL name a `.sng` package rather than our JSON song document?
 *
 * Its own tiny module because the question is asked from four places — the jukebox's
 * preview, the band's load, a folder's record and a download — and none of them
 * should download the package reader to ask it. `library/sng.ts` is the reader's
 * browser half and stays behind a dynamic import.
 */
export function isSngUrl(url: string): boolean {
  try {
    return new URL(url).pathname.toLowerCase().endsWith(".sng");
  } catch {
    return /\.sng(?:[?#]|$)/i.test(url);
  }
}
