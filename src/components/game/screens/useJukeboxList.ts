import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import type { SongGroup } from "../../../lib/game/jukebox";
import {
  WINDOW_OVERSCAN,
  anchorTop,
  buildJukeboxLayout,
  itemAtOffset,
  jukeboxWindow,
  letterAtOffset,
  letterOffset,
  rowFrom,
  scrollTopForItem,
  type JukeboxHeights,
  type JukeboxLayout,
  type JukeboxSection,
  type JukeboxWindow,
} from "../../../lib/game/jukeboxWindow";
import type { Song } from "../../../lib/game/song";
import { focusStageTarget } from "../ui/nav";

/**
 * How long a measurement that found no height waits before asking again.
 *
 * A row can be mounted before its height is readable — a font still settling,
 * or a simply unlucky frame. The observer normally catches up, but if it does
 * not, the list would keep its 24-row preview for ever and the arrows, Tab and
 * the letter index would all be inert.
 */
const MEASURE_RETRY_MS = 200;

/**
 * The jukebox list's DOM orchestration: measuring, windowing, scrolling and focus.
 *
 * The list is one long column of a few hundred rows, and only the rows around the
 * viewport are mounted (`src/lib/game/jukeboxWindow.ts` is the arithmetic). This
 * hook is the other half: it measures one heading and one row off the real
 * stylesheet, keeps the window in step with the scroller, holds the scroll
 * position by identity when the library changes under it, and moves focus through
 * a list the browser can only see part of.
 *
 * It owns the **scroller element** and nothing else in the screen: the toolbar,
 * the search, the preview and the rows themselves stay with `Songs`. Everything
 * it needs arrives as an argument, and everything a screen renders comes back.
 *
 * Two placements are the game's own rather than the player's: a first arrival and
 * a returning screen seating the chosen song. Both are **silent** (they go through
 * `focusStageTarget(..., { silent: true })`) and neither selects or previews a
 * song — that rule is why the placement flag is held here, beside the focus it
 * qualifies, rather than in the screen.
 */
export interface JukeboxListInput {
  /** The filtered groups, in the order they are drawn. */
  shown: SongGroup[];
  /** The words in the search field: a change to them starts the list at the top. */
  query: string;
  /** The chosen song, whose row a returning screen is seated on. */
  chosen: Song | null;
  /** Whether the screen has built the list yet (it defers grouping by a frame). */
  ready: boolean;
  /**
   * The attract demo is choosing rows. It scrolls the chosen row into view each
   * time the choice changes, without moving focus and without starting a preview:
   * the demo is the one choosing, not a player.
   */
  follow?: boolean;
}

export interface JukeboxList {
  /** The scrolling box: its own scroll position is the window's input. */
  scroller: RefObject<HTMLDivElement | null>;
  /** The measured heading and row, or null before they can be read. */
  heights: JukeboxHeights | null;
  /** What to mount, or null until the heading and row have been measured. */
  range: JukeboxWindow | null;
  /** The window's sections, or the first frame of rows before it can be built. */
  sections: JukeboxSection[];
  /** The letter the list is showing, so the index can say where you are. */
  current: string | null;
  /** Jump to a letter by its layout offset. */
  jump: (letter: string) => void;
  /** Read the scroller's position into the window, once per move. */
  onScroll: () => void;
  /** ArrowUp/ArrowDown and Tab, moving between rows the browser cannot all see. */
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  /** The player has taken the search field: do not move them to the list. */
  markTyped: () => void;
}

export function useJukeboxList({
  shown,
  query,
  chosen,
  ready,
  follow = false,
}: JukeboxListInput): JukeboxList {
  const scroller = useRef<HTMLDivElement | null>(null);
  /**
   * The window's geometry.
   *
   * A heading and a row are **measured**, one of each, rather than hard-coded:
   * their heights are the stylesheet's and they change at `80rem` and `40rem`.
   * A `ResizeObserver` remeasures the scroller and the mounted items, so a
   * breakpoint, a font arriving or a zoom settles back into the same arithmetic
   * instead of drifting from the CSS.
   */
  const [heights, setHeights] = useState<JukeboxHeights | null>(null);
  const [scroll, setScroll] = useState({ top: 0, viewport: 0 });
  /**
   * A row an arrow or Tab has just moved to. It is mounted even when it is far
   * outside the window, which is how focus crosses a window boundary.
   */
  const [focusAt, setFocusAt] = useState<number | null>(null);
  /**
   * The next placement `focusAt` asks for is the **game's** own — a returning
   * screen seating the chosen song — so it must not select or preview it.
   */
  const silentPlacement = useRef(false);
  const layoutRef = useRef<JukeboxLayout | null>(null);
  const scrollRef = useRef(scroll);
  const shownRef = useRef<SongGroup[]>([]);
  /** The filter the list was last built for; a change to it is a new list. */
  const filterRef = useRef(query);
  const observer = useRef<ResizeObserver | null>(null);
  const observed = useRef(new Set<Element>());
  /**
   * Whether the first arrival has already been seated. A player who has typed or
   * moved is left where they are, and a library refresh does not move them again.
   */
  const autoFocused = useRef(false);

  /** Read the scroller's own scroll position into state, once per move. */
  const commitScroll = useCallback((box: HTMLDivElement) => {
    const next = { top: box.scrollTop, viewport: box.clientHeight };
    scrollRef.current = next;
    setScroll((prev) =>
      prev.top === next.top && prev.viewport === next.viewport ? prev : next,
    );
  }, []);

  /** One heading and one row are all the list's geometry needs. */
  const measure = useCallback(() => {
    const box = scroller.current;
    if (!box) return;
    const viewport = box.clientHeight;
    setScroll((prev) => (prev.viewport === viewport ? prev : { ...prev, viewport }));
    const header = box.querySelector<HTMLElement>(".song-group__letter");
    const row = box.querySelector<HTMLElement>(".song-row");
    const next = {
      header: header?.getBoundingClientRect().height ?? 0,
      row: row?.getBoundingClientRect().height ?? 0,
    };
    if (next.header <= 0 || next.row <= 0) return;
    setHeights((prev) =>
      prev &&
      Math.abs(prev.header - next.header) < 0.01 &&
      Math.abs(prev.row - next.row) < 0.01
        ? prev
        : next,
    );
  }, []);

  const layout = useMemo(
    () => (heights ? buildJukeboxLayout(shown, heights) : null),
    [shown, heights],
  );
  const range = useMemo(
    () =>
      layout
        ? jukeboxWindow(
            layout,
            scroll.top,
            scroll.viewport,
            WINDOW_OVERSCAN,
            focusAt,
          )
        : null,
    [layout, scroll.top, scroll.viewport, focusAt],
  );
  /** A first frame of rows, before the one heading and row have been measured. */
  const previewSections = useMemo(() => {
    if (range || shown.length === 0) return [];
    const sections: JukeboxSection[] = [];
    let budget = 24;
    for (let index = 0; index < shown.length && budget > 0; index += 1) {
      const take = Math.min(shown[index].entries.length, budget);
      sections.push({ group: index, from: 0, to: take, skip: 0 });
      budget -= take;
    }
    return sections;
  }, [range, shown]);

  /** Register every mounted heading and row with the observer, and forget the gone. */
  const observeItems = useCallback(() => {
    const box = scroller.current;
    const ro = observer.current;
    if (!box || !ro) return;
    for (const node of box.querySelectorAll(".song-group__letter, .song-row")) {
      if (!observed.current.has(node)) {
        ro.observe(node);
        observed.current.add(node);
      }
    }
    for (const node of observed.current) {
      if (!node.isConnected) {
        ro.unobserve(node);
        observed.current.delete(node);
      }
    }
  }, []);

  /**
   * Watch the scroller and every mounted item. The observer is what measures:
   * `measure()` reads two rectangles, and calling it after every commit meant
   * reading layout on every scroll frame, because `commitScroll` commits one.
   */
  useEffect(() => {
    if (!ready) return;
    const ro = new ResizeObserver(() => measure());
    observer.current = ro;
    const box = scroller.current;
    if (box) {
      ro.observe(box);
      observed.current.add(box);
      observeItems();
    }
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      observed.current.clear();
      observer.current = null;
      window.removeEventListener("resize", measure);
    };
  }, [ready, measure, observeItems]);

  /** The first measurement, once the list exists, so the window replaces the first rows. */
  useLayoutEffect(() => {
    if (ready) measure();
  }, [ready, measure]);

  /**
   * Keep asking until one heading and one row can be measured. The observer is
   * the ordinary path; this is the fallback for the frame it misses, and it is
   * a retry rather than a guessed height so the geometry stays the CSS's.
   */
  useEffect(() => {
    if (!ready || heights !== null || shown.length === 0) return;
    const timer = window.setInterval(measure, MEASURE_RETRY_MS);
    return () => window.clearInterval(timer);
  }, [ready, heights, shown, measure]);

  /** A new commit can mount new rows; the observer only has to be told about them. */
  useLayoutEffect(() => {
    if (!ready) return;
    observeItems();
  });

  /**
   * A new **filter** starts at the top. A list whose **library** changed under it
   * keeps what it was showing: the item at the top is found again by identity —
   * its song's id, or its letter — rather than by its flat index, because a
   * refresh can insert a song above it. A **remeasured** list is the same rule
   * with the same contents: heights change at a breakpoint or when a font
   * arrives, and the scroll position is in pixels, so without this the list would
   * silently show a different song after a resize.
   */
  useLayoutEffect(() => {
    const box = scroller.current;
    if (!box) return;
    const filterChanged = filterRef.current !== query;
    filterRef.current = query;
    const previous = layoutRef.current;
    if (filterChanged) {
      shownRef.current = shown;
      layoutRef.current = layout;
      if (box.scrollTop !== 0) box.scrollTop = 0;
      setFocusAt(null);
      commitScroll(box);
      return;
    }
    if (shownRef.current !== shown) {
      shownRef.current = shown;
      if (previous && layout && scrollRef.current.top > 0) {
        const top = anchorTop(previous, layout, scrollRef.current.top);
        if (Math.abs(box.scrollTop - top) > 0.5) box.scrollTop = top;
        commitScroll(box);
      }
      layoutRef.current = layout;
      return;
    }
    if (previous && layout && previous !== layout && scrollRef.current.top > 0) {
      const anchor = itemAtOffset(previous, scrollRef.current.top);
      const top =
        layout.offsets[Math.min(anchor, layout.items.length - 1)] ?? 0;
      if (Math.abs(box.scrollTop - top) > 0.5) box.scrollTop = top;
      commitScroll(box);
    }
    layoutRef.current = layout;
  }, [layout, shown, commitScroll, query]);

  /** Put focus on the row the arrows or Tab asked for, once it is mounted. */
  useLayoutEffect(() => {
    if (focusAt === null || !layout) return;
    const box = scroller.current;
    const item = layout.items[focusAt];
    if (!box || !item || item.kind !== "song") {
      setFocusAt(null);
      silentPlacement.current = false;
      return;
    }
    const entry = shown[item.group]?.entries[item.entry];
    if (!entry) {
      setFocusAt(null);
      silentPlacement.current = false;
      return;
    }
    const row = [
      ...box.querySelectorAll<HTMLElement>(".song-row"),
    ].find((node) => node.dataset.songId === entry.song.id);
    if (!row) return;
    setFocusAt(null);
    // A placement the game made (a returning screen seating the chosen song) is
    // not the player moving onto the row: it must not select or preview it.
    const silent = silentPlacement.current;
    silentPlacement.current = false;
    if (silent) focusStageTarget(row, { silent: true });
    else row.focus();
  }, [focusAt, layout, shown]);

  /**
   * Bring a row into view and mount it, then put focus on it.
   *
   * It is a plain function rather than a callback because the effects below read
   * the render's own `layout`, exactly as the two placements always have.
   */
  const showRow = (index: number) => {
    const box = scroller.current;
    if (!box || !layout) return;
    const top = scrollTopForItem(layout, index, box.clientHeight, box.scrollTop);
    if (Math.abs(top - box.scrollTop) > 0.5) box.scrollTop = top;
    commitScroll(box);
    setFocusAt(index);
  };

  /**
   * Put the player on the **chosen** song's row, or the first row when nothing is
   * chosen, once the list exists. It is a placement the game makes, so it is
   * silent — focusing a row must not select it or start its preview. A player who
   * has already typed or moved is left where they are, and a library refresh does
   * not move them again.
   */
  useEffect(() => {
    // The attract demo chooses rows itself and has no player to place. Focusing a
    // row would take focus in the homepage window, whose iframe is only a picture.
    if (follow) return;
    if (autoFocused.current || !layout || shown.length === 0 || query.trim() !== "") {
      return;
    }
    const active = document.activeElement;
    const waiting =
      active === document.body ||
      (active instanceof HTMLElement && active.id === "jukebox-search");
    if (!waiting) {
      autoFocused.current = true;
      return;
    }
    const frame = requestAnimationFrame(() => {
      const current = document.activeElement;
      const stillWaiting =
        current === document.body ||
        (current instanceof HTMLElement && current.id === "jukebox-search");
      autoFocused.current = true;
      if (!stillWaiting) return;
      const at = chosen ? layout.rows.get(chosen.id) : undefined;
      const first = layout.items.findIndex((item) => item.kind === "song");
      const index = at ?? (first >= 0 ? first : undefined);
      if (index === undefined) return;
      silentPlacement.current = true;
      showRow(index);
    });
    return () => cancelAnimationFrame(frame);
  }, [layout, shown, query, chosen, follow]);

  /**
   * The attract demo's selection, brought into view without focus.
   *
   * A row change during the demo is not a player moving: it must not select the
   * row again, start a preview, or move focus away from whatever the page is
   * showing. `commitScroll` is what mounts the rows around the new position.
   */
  useEffect(() => {
    if (!follow || !layout || !chosen || query.trim() !== "") return;
    const box = scroller.current;
    const at = layout.rows.get(chosen.id);
    if (!box || at === undefined) return;
    const top = scrollTopForItem(layout, at, box.clientHeight, box.scrollTop);
    if (Math.abs(top - box.scrollTop) > 0.5) box.scrollTop = top;
    commitScroll(box);
  }, [follow, layout, chosen, query, commitScroll]);

  /**
   * Up and down are a list's own keys. They move from song to song rather than
   * scrolling the document out from under the selected row; the row's focus
   * handler is what follows the selection.
   *
   * **Tab is intercepted too, and that is deliberate.** The browser's own order
   * only sees mounted rows, so a Tab from the last one would leave a list that
   * still has songs below it. Inside the list Tab takes the same step as an
   * arrow (skipping the letter headings); at the first or last row it is left
   * alone, where the next control really is — the toolbar above the list or the
   * controls after it. The letter index is out of the tab order
   * (`tabIndex={-1}`); the pad's own cursor and the mouse still reach it. The
   * result is the same order a fully mounted list gave, with a bounded DOM.
   */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!layout) return;
    const focused = document.activeElement;
    if (!(focused instanceof HTMLElement) || !focused.matches(".song-row")) return;
    const id = focused.dataset.songId;
    const at = id ? layout.rows.get(id) : undefined;
    if (at === undefined) return;
    const forward =
      event.key === "ArrowDown" || (event.key === "Tab" && !event.shiftKey);
    const backward =
      event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey);
    if (!forward && !backward) return;
    const target = rowFrom(layout, at, forward ? 1 : -1);
    // Tab at either end belongs to the browser: the search field above the list
    // or the controls after it are the right next stop.
    if (event.key === "Tab" && target === null) return;
    // Even at the first or last row an arrow belongs to the list: it must not
    // fall through and scroll the page.
    event.preventDefault();
    if (target !== null) showRow(target);
  };

  /**
   * Jump to a letter by its **layout** offset, not by a mounted node's
   * `offsetTop`: the section for a late letter may not be in the DOM at all, and
   * that is the whole point of the window. The heading lands at the top exactly
   * as it did when every section was mounted.
   */
  const jump = (letter: string) => {
    const box = scroller.current;
    if (!box || !layout) return;
    const top = letterOffset(layout, letter);
    if (top === null) return;
    // Scrolled by hand rather than `scrollIntoView`, so the panel around the list
    // stays where it is.
    box.scrollTop = top;
    commitScroll(box);
  };

  const onScroll = () => {
    const box = scroller.current;
    if (!box) return;
    commitScroll(box);
  };

  /** The player has taken the search field; the list must not be seated under them. */
  const markTyped = () => {
    autoFocused.current = true;
  };

  /** The letter the list is showing, so the index can say where you are. */
  const current = layout
    ? (letterAtOffset(layout, scroll.top) ?? shown[0]?.letter ?? null)
    : (shown[0]?.letter ?? null);

  return {
    scroller,
    heights,
    range,
    sections: range?.sections ?? previewSections,
    current,
    jump,
    onScroll,
    onKeyDown,
    markTyped,
  };
}
