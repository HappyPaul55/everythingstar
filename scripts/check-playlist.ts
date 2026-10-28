/**
 * `bun run playlist:check <url>` — hold a provider's playlist to the reader the game
 * uses.
 *
 * The same two rules the browser keeps are kept here: the address must pass the
 * URL policy (`fetchableUrl`), and the body is **bounded** at the document cap with
 * an idle deadline, so a host that lies about its length or stops mid-body fails
 * as a sentence rather than as a hang. The reading and the report are pure and in
 * `src/lib/game/playlistCheck.ts`; this file only fetches, prints and sets the exit
 * code.
 *
 * Exit status is 0 for a playlist the game would list, and 1 for anything else —
 * a refused address, a failed fetch, a document that is not a playlist, or one the
 * reader had to skip something in. `--json` prints the same record for a build step.
 */

import {
  IDLE_TIMEOUT_MS,
  MAX_DOCUMENT_BYTES,
} from "../src/lib/game/fetchLimits";
import { checkPlaylist, formatPlaylistCheck } from "../src/lib/game/playlistCheck";
import { fetchableUrl } from "../src/lib/game/url";

/** The failure a provider reads: one sentence, then the command's own usage. */
class CheckError extends Error {}

function fail(message: string): never {
  throw new CheckError(message);
}

/**
 * One document, read the way the library reads it.
 *
 * `fetchBounded` in the browser adds the redirect check, the declared length and
 * the streamed cap. The address policy has already been applied here, and a
 * redirect's own address is checked before the body is read; what is left is the
 * cap on the body itself, chunk by chunk, with the idle deadline reset by every
 * chunk that does arrive.
 */
async function readDocument(url: string): Promise<Uint8Array> {
  const controller = new AbortController();
  let idle: ReturnType<typeof setTimeout> | null = null;
  const stillThere = () => {
    if (idle !== null) clearTimeout(idle);
    idle = setTimeout(() => controller.abort(), IDLE_TIMEOUT_MS);
  };

  try {
    stillThere();
    const response = await fetch(url, {
      credentials: "omit",
      signal: controller.signal,
    });
    stillThere();
    // The browser follows a redirect, so the address that answered is the one to
    // judge: a playlist must not land on a scheme this game would not have fetched.
    if (response.url && !fetchableUrl(response.url)) {
      await response.body?.cancel();
      fail(`This document redirected to ${response.url}, which is not http:// or https://.`);
    }
    if (!response.ok) {
      await response.body?.cancel();
      fail(`${response.status} ${response.statusText}`);
    }
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_DOCUMENT_BYTES) {
      await response.body?.cancel();
      fail(`The document is larger than ${MAX_DOCUMENT_BYTES} bytes, so the game will not read it.`);
    }
    const reader = response.body?.getReader();
    if (!reader) return new Uint8Array(await response.arrayBuffer());

    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      stillThere();
      total += value.byteLength;
      if (total > MAX_DOCUMENT_BYTES) {
        await reader.cancel();
        controller.abort();
        fail(
          `The document is larger than ${MAX_DOCUMENT_BYTES} bytes, so the game will not read it.`,
        );
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let at = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, at);
      at += chunk.byteLength;
    }
    return bytes;
  } catch (error) {
    if (error instanceof CheckError) throw error;
    if (controller.signal.aborted) {
      throw new CheckError(
        `The document stopped arriving for ${IDLE_TIMEOUT_MS / 1000} seconds, so it was not read.`,
      );
    }
    throw new CheckError(error instanceof Error ? error.message : String(error));
  } finally {
    if (idle !== null) clearTimeout(idle);
  }
}

async function main(args: string[]): Promise<number> {
  const json = args.includes("--json");
  const raw = args.find((arg) => !arg.startsWith("--"));
  if (!raw) {
    console.error("Usage: bun run playlist:check <playlist-url> [--json]");
    return 2;
  }

  const url = fetchableUrl(raw);
  if (!url) {
    console.error("That is not a URL the game will fetch: it must be an absolute https:// or http:// address with no credentials.");
    return 1;
  }

  let body: unknown;
  try {
    const bytes = await readDocument(url);
    body = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const check = checkPlaylist(body, url);
  console.log(formatPlaylistCheck(check, json));
  return check.ok ? 0 : 1;
}

// `import.meta.main` is Bun's: running the file is the script, importing it is not.
// The exit code is set rather than exited with, so the printed report is not cut
// short by a process that leaves before stdout has flushed.
if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2));
}
