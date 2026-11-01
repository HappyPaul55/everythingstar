import { useEffect, useRef, useState } from "react";
import { useT } from "../../../i18n/react";
import type { Song } from "../../../lib/game/song";
import type { Screen } from "../../../lib/game/screens";
import { activeRoot, defaultFocus, focusStageTarget } from "./nav";

/**
 * The screen a player lands on, said twice: once to the screen reader in a live
 * region, and once by putting focus on the control that screen starts with.
 *
 * A single island that swaps screens has no page load to announce itself. Without
 * this, moving from the menu to the jukebox leaves focus on a button that no
 * longer exists, and the browser's answer is `<body>` — silent to a screen reader
 * and a long way from the first control for a keyboard or a pad.
 */
interface Props {
  screen: Screen;
  song: Song | null;
}

export function ScreenFocus({ screen, song }: Props) {
  const t = useT();
  const [announcement, setAnnouncement] = useState("");
  // The song changes while the same screen is up (picking a row in the jukebox,
  // for one). That updates what is being described, but it must not steal focus
  // from the row the player just pressed. `previous` is what makes a branch a
  // round trip: coming back from Options lands on Options, not on Quick Play.
  const lastScreen = useRef<Screen | null>(null);
  // The label is read at the moment the screen changes. A song picked in the
  // jukebox is announced by the row that has focus, not by re-announcing the
  // screen title over it; the band and the results name their song because they
  // are new screens.
  const songRef = useRef(song);
  songRef.current = song;

  useEffect(() => {
    setAnnouncement(screenLabel(screen, songRef.current, t));
  }, [screen, t]);

  useEffect(() => {
    if (lastScreen.current === screen) return;
    const previous = lastScreen.current;
    // Wait one frame: a paused screen is a native dialog, and `showModal()` runs
    // in its own effect. Focusing before it opens would land behind it.
    const frame = requestAnimationFrame(() => {
      // The screen is handled **here**, not before the frame. A second change in
      // the same frame cancels this placement, and a canceled placement must
      // leave the screen unhandled so the next effect can try again.
      lastScreen.current = screen;
      const root = activeRoot(screen);
      if (!root) return;
      let target = defaultFocus(root);
      if (screen === "menu" && (previous === "options" || previous === "credits")) {
        target = root.querySelector<HTMLElement>(`[data-nav-id="${previous}"]`) ?? target;
      }
      // Coming back from a run or the band is returning to a song already chosen;
      // first arriving from the menu is arriving at the top of the list.
      const returningToSongs =
        previous === "band" ||
        previous === "results" ||
        previous === "loading" ||
        previous === "countdown" ||
        previous === "playing" ||
        previous === "paused";
      if (screen === "songs" && returningToSongs) {
        target = root.querySelector<HTMLElement>(".song-row.is-active") ?? target;
      }
      if (!target && root.hasAttribute("data-nav-default")) target = root;
      if (target) focusStageTarget(target, { silent: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [screen]);

  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {announcement}
    </div>
  );
}

function screenLabel(screen: Screen, song: Song | null, t: ReturnType<typeof useT>): string {
  switch (screen) {
    case "welcome":
      return t("screen.welcomeTitle");
    case "menu":
      return t("screen.menuTitle");
    case "options":
      return t("screen.options");
    case "credits":
      return t("screen.credits");
    case "songs":
      return t("screen.songsTitle");
    case "band":
      return song ? `${t("screen.bandTitle")} — ${song.title}` : t("screen.bandTitle");
    case "loading":
      return t("screen.loading");
    case "countdown":
      return t("screen.ready");
    case "playing":
      return song
        ? `${t("screen.playingNow")}: ${song.title}`
        : t("screen.playingNow");
    case "paused":
      return t("screen.paused");
    case "results":
      return song ? `${t("screen.results")} — ${song.title}` : t("screen.results");
  }
}
