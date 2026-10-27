import { createContext, useContext, type ReactNode } from "react";
import type { Track } from "../../../lib/game/track";
import type { SourceSongDoc } from "../../../lib/game/source";

/**
 * The track the stage is playing, the seed its simulated players use, and the
 * song document it came from.
 *
 * The track is what a run judges; the document is what the song *says* about its
 * audio — including each part's own `audioControl` rule, which is why the part
 * registry reads it here rather than carrying a second copy of the rule down
 * through every screen.
 */
interface SongValue {
  track: Track;
  seed: number;
  /** The song document, when it has arrived; a shell track has none. */
  doc: SourceSongDoc | null;
}

const SongContext = createContext<SongValue | null>(null);

export function SongProvider({
  track,
  seed,
  doc,
  children,
}: SongValue & { children: ReactNode }) {
  return (
    <SongContext.Provider value={{ track, seed, doc }}>{children}</SongContext.Provider>
  );
}

export function useSong(): SongValue {
  const value = useContext(SongContext);
  if (!value) throw new Error("useSong must be used inside a SongProvider.");
  return value;
}
