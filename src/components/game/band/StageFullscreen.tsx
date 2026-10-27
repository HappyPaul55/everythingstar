import { useT } from "../../../i18n/react";
import type { FullscreenState } from "./useFullscreen";

/**
 * The way into the whole screen — **product, not a dev tool**.
 *
 * The stage is meant to be played fullscreen, and the only other door to it is the
 * welcome's own button: a player who leaves fullscreen (Esc, a swipe, a second
 * monitor) has no way back without reloading. So this sits in the corner of the
 * stage like any other control.
 *
 * It shows **only when there is somewhere to go**: a browser that cannot do
 * fullscreen gets no button, and a screen already filled needs no invitation. That
 * also means it can never be mistaken for the way *out* — leaving is the browser's
 * own gesture, and a second button for it would be a button that lies about which
 * one you are looking at.
 */
export function StageFullscreen({ fullscreen }: { fullscreen: FullscreenState }) {
  const t = useT();
  if (!fullscreen.supported || fullscreen.active) return null;
  return (
    <button
      type="button"
      className="stage-fullscreen"
      onClick={fullscreen.enter}
      data-sound="select"
    >
      {t("band.fullscreen")}
    </button>
  );
}
