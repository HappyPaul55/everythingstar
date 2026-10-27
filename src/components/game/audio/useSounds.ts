import { useCallback, useEffect, useState } from "react";
import { readSounds, typesOf, type Sound } from "../../../lib/game/audio/sounds";
import { absoluteUrl, cachedJson } from "../library/store";

/**
 * The sound manifest, fetched.
 *
 * Read **fresh every time**, with the cached copy as the fallback when the network
 * cannot answer. It is kilobytes, it is ours rather than a player's playlist, and it
 * is the file that changes every time a sound lands — so a cached copy of it is a
 * game that has stopped listening. `reload` is the same read, by hand.
 */
export interface Sounds {
  /** What there is a file for. */
  sounds: Sound[];
  /** The types those files can play, sorted — the roles the game can actually ask for. */
  types: string[];
  /** Listed with no file yet: what is still to buy or record. */
  missing: string[];
  problems: string[];
  loading: boolean;
  /** Read it again — for a file dropped in while the game was running. */
  reload: () => void;
}

/** Where the manifest lives: beside the sounds it lists. */
export const DEFAULT_SOUNDS = "/audio/sounds.json";

const NOTHING: Omit<Sounds, "reload"> = {
  sounds: [],
  types: [],
  missing: [],
  problems: [],
  loading: true,
};

export function useSounds(manifestUrl: string, enabled = true): Sounds {
  const [read, setRead] = useState<Omit<Sounds, "reload">>(NOTHING);
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    // A silent visit (the homepage's attract window) has no mixer to feed, so it
    // does not read the manifest at all. That is the difference between a preview
    // and a game: kilobytes are still kilobytes on somebody's phone.
    if (!enabled) {
      setRead({ ...NOTHING, loading: false });
      return;
    }
    let alive = true;
    void (async () => {
      const url = absoluteUrl(manifestUrl) ?? manifestUrl;
      const body = await cachedJson(url, "sounds", true);
      if (!alive) return;
      if (body === null) {
        setRead({
          sounds: [],
          types: [],
          missing: [],
          problems: [`${manifestUrl} could not be read`],
          loading: false,
        });
        return;
      }
      const read_ = readSounds(body, url);
      setRead({ ...read_, types: typesOf(read_.sounds), loading: false });
    })();
    return () => {
      alive = false;
    };
  }, [manifestUrl, attempt, enabled]);

  if (!enabled) return { ...NOTHING, loading: false, reload };
  return { ...read, reload };
}
