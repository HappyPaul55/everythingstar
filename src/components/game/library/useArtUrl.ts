import { useCallback, useEffect, useRef, useState } from "react";
import { isLocalUrl, localObjectUrl } from "./folder";

/**
 * A piece of art as something the browser can actually load.
 *
 * A playlist points at a picture by URL, and the browser fetches it. A song read from
 * a folder points at one by `folder://…`, which an `<img>` cannot fetch at all — so
 * the file is read and handed to the element as an **object URL** instead. The hook
 * owns that URL and lets it go when the element does.
 *
 * There are two ways in, because a collection is two thousand covers:
 *
 * - `useArtUrl` resolves at once, for the one picture a screen is built around (a
 *   run's backdrop, the now-playing panel).
 * - `useArtThumb` waits until the art is **near the viewport**, for a list. Two
 *   thousand rows each reading a file the moment they mount is a burst of work for
 *   pictures nobody has scrolled to; the browser's own `loading="lazy"` is not enough,
 *   because the file has to be read before there is anything to load.
 */
export function useArtUrl(src: string | null): string | null {
  return useObjectUrl(src, true);
}

export function useArtThumb(src: string | null): {
  url: string | null;
  /** Attach to the element the art goes in — it is what is watched. */
  ref: (node: Element | null) => void;
} {
  const [visible, setVisible] = useState(false);
  const url = useObjectUrl(src, visible);
  const observer = useRef<IntersectionObserver | null>(null);

  const ref = useCallback(
    (node: Element | null) => {
      observer.current?.disconnect();
      if (node === null || visible) return;
      // No observer to be had means every cover resolves, which is what the browser
      // would have done anyway.
      if (typeof IntersectionObserver === "undefined") {
        setVisible(true);
        return;
      }
      observer.current = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            setVisible(true);
            observer.current?.disconnect();
          }
        },
        { rootMargin: "400px" },
      );
      observer.current.observe(node);
    },
    [visible],
  );

  useEffect(() => () => observer.current?.disconnect(), []);
  return { url, ref };
}

/** The state a cover is drawn from: which `src` it belongs to, and what to load. */
interface ArtState {
  src: string | null;
  url: string | null;
}

/** What a `src` can be drawn with before anything is read: itself, or nothing. */
export function artUrlFor(src: string | null): string | null {
  return src === null || isLocalUrl(src) ? null : src;
}

/**
 * What a cover shows for a `src`, given the last one that was resolved.
 *
 * Keying on the `src` is the whole rule: a new song's cover must show its own
 * placeholder at once, not the previous song's picture for a render. A local cover
 * resolves to nothing until its file is read; a URL is its own answer.
 */
export function artStateFor(state: ArtState, src: string | null): string | null {
  return state.src === src ? state.url : artUrlFor(src);
}

/** The shared body: a URL for a picture, however it is reached. */
function useObjectUrl(src: string | null, ready: boolean): string | null {
  const [state, setState] = useState<ArtState>(() => ({ src, url: artUrlFor(src) }));
  const resolved = artStateFor(state, src);

  useEffect(() => {
    // Nothing here needs a state write when the render already has the answer, so a
    // URL cover costs no extra pass.
    const settle = (url: string | null) =>
      setState((current) =>
        current.src === src && current.url === url ? current : { src, url },
      );

    if (src === null || !isLocalUrl(src)) {
      settle(artUrlFor(src));
      return;
    }
    if (!ready) {
      settle(null);
      return;
    }
    let alive = true;
    let made: string | null = null;
    void (async () => {
      const url = await localObjectUrl(src);
      if (!alive) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      made = url;
      settle(url);
    })();
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [src, ready]);

  return resolved;
}
