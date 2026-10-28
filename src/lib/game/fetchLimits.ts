/**
 * The ceilings on what this game will fetch, in one place.
 *
 * They are pure numbers rather than part of the browser's library seam because
 * more than one reader needs them: the library's own bounded fetch, and the
 * playlist checker a provider runs from the command line (`scripts/check-playlist.ts`).
 * A provider's document is refused at the same size in both, so a playlist that
 * the checker accepts is one the game will actually read.
 */

/**
 * The largest **document** — a playlist, a song, a chart, the sound manifest — this
 * game will read: 8 MB.
 *
 * A dense chart for a five-minute song is a few hundred kilobytes, and even a
 * pathological one with every chord written out is well under a megabyte, so 8 MB
 * is roughly an order of magnitude of headroom. It is deliberately far below a
 * video or an audio file: those are streamed by the browser as media, never read
 * here, and a URL that returns megabytes of them is not a library document.
 */
export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

/**
 * The largest **package** — a `.sng` — this game will fetch: 128 MB.
 *
 * A song shipped with stems is tens of megabytes, so this has to be much larger
 * than a document. It is still a ceiling: past it the browser's tab is doing a
 * download nobody asked to watch, and the package's own header caps
 * (`MAX_HEADER_BYTES` in `sources/sng.ts`) are a separate, much tighter rule for
 * what is inside it.
 */
export const MAX_PACKAGE_BYTES = 128 * 1024 * 1024;

/**
 * How long a request may sit with **nothing happening**: 30 seconds.
 *
 * This is an **idle** deadline, not a cap on how long a download may take. A large
 * package on a slow line is left alone; a server that accepts the connection and
 * then says nothing — no headers, or a body that stops part-way — is dropped.
 */
export const IDLE_TIMEOUT_MS = 30_000;
