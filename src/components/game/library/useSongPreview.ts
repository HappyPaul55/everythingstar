import { useEffect, useRef, useState } from "react";
import type { Song } from "../../../lib/game/song";
import { useAudio } from "../audio/StageAudio";
import { resolvePreview, type FoundPreview } from "./preview";

/**
 * Play the song a jukebox row has chosen.
 *
 * A list of a few hundred titles is a list of names, and a name does not remind
 * anybody what a song sounds like — so choosing one **plays something**: the chart folder's
 * preview clip where it has one, otherwise the master from the song's own preview
 * cue (`previewFor`). The mixer gives it the music channel, the clip repeats until
 * another row is chosen or the jukebox is left, and a song with no preview leaves
 * the jukebox silent rather than putting the menu bed behind it.
 *
 * `request` is the choice, not only the song: choosing the same row again restarts
 * its preview rather than doing nothing. A local clip is read into an object URL —
 * a `folder://` path means nothing to an `<audio>` — and the previous one is revoked
 * once the new preview has it, so moving through a collection does not keep a
 * folder's worth of audio alive.
 *
 * A `.sng` package is fetched as a whole, because the jukebox may not have had to
 * read it before: its `preview.*`, its master and its cover are all members of one
 * file. That fetch goes through the one-visit package cache, so opening the band
 * takes the same bytes rather than downloading them again. The cover is handed back
 * so the now-playing panel can show what the list could not know without
 * downloading every package.
 *
 * A preview that cannot be read is **no preview**: the resolver answers null rather
 * than rejecting, and this hook then stops the mixer and lets go of the files the
 * previous row left on screen. A blank tile is a row nobody can audition; the last
 * song's cover and sound still playing under another title is a lie.
 */
export interface PreviewView {
  /** The song the art belongs to, so a slow fetch cannot paint the wrong row. */
  songId: string | null;
  /** The package's own cover, when it had one. */
  art: string | null;
}

const NO_PREVIEW: PreviewView = { songId: null, art: null };

export function useSongPreview(song: Song | null, request: number): PreviewView {
  const { preview } = useAudio();
  const objectUrl = useRef<string | null>(null);
  const artUrl = useRef<string | null>(null);
  const [view, setView] = useState<PreviewView>(NO_PREVIEW);
  const releaseAudio = () => {
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    }
  };
  const releaseArt = () => {
    if (artUrl.current) {
      URL.revokeObjectURL(artUrl.current);
      artUrl.current = null;
    }
  };

  /** Nothing is playing and nothing of another song is shown. */
  const clear = () => {
    preview(null);
    releaseAudio();
    releaseArt();
    setView(NO_PREVIEW);
  };

  useEffect(() => {
    let alive = true;
    if (!song) {
      clear();
      return;
    }
    const abort = new AbortController();
    void (async () => {
      // `resolvePreview` never rejects: a document that is not one, a package that
      // will not open or a refused object URL all come back as no preview, so the
      // panel clears instead of leaving the previous song's art and sound behind.
      // The abort a row change causes is still caught here: the browser reports it
      // as a rejection from its own fetch, and it must not become an unhandled one.
      const found = await resolvePreview(song, abort.signal).catch(() => null);
      if (!alive) {
        // The row was left while its files were being read. This request never
        // reached the panel, so its object URLs are its own to let go of; anything
        // already installed belongs to the live preview and is left alone.
        releaseFound(found);
        return;
      }
      if (!found) {
        clear();
        return;
      }
      preview({ url: found.url, startMs: found.startMs });
      releaseAudio();
      objectUrl.current = found.object ? found.url : null;
      releaseArt();
      artUrl.current = found.artObject && found.art ? found.art : null;
      setView({ songId: song.id, art: artUrl.current });
    })();
    return () => {
      alive = false;
      abort.abort();
    };
  }, [song, request, preview]);

  // Leaving the jukebox is not a reason to leave a preview playing over the band
  // screen — or to keep the file it read in memory.
  useEffect(
    () => () => {
      preview(null);
      releaseAudio();
      releaseArt();
    },
    [preview],
  );

  return view;
}

/** Let go of the files a preview that never reached the panel was read into. */
function releaseFound(found: FoundPreview | null): void {
  if (!found) return;
  if (found.object) URL.revokeObjectURL(found.url);
  if (found.artObject && found.art) URL.revokeObjectURL(found.art);
}
