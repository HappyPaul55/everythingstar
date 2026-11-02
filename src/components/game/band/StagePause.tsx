import { useT } from "../../../i18n/react";

/**
 * The way out of a run when there is no Escape key.
 *
 * A phone has no pause button of its own, and a touch player can otherwise only
 * leave a song by finishing it — no restart, no practice, no way back to the
 * jukebox. It sits in the stage's corner beside the fullscreen chip, on the
 * devices whose pointer is a finger (`useCoarsePointer`), so a desktop stays as
 * it was: Escape and a pad's Start are already there.
 */
export function StagePause({ onPause }: { onPause: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      className="stage-pause chip-btn min-h-[2.75rem] rounded-t-none border-t-0 [&:hover]:chip-btn-on [&[data-nav-focus]]:chip-btn-on [:root:not([data-game-input=pointer])_&:focus-visible]:chip-btn-on"
      onClick={onPause}
      data-sound="select"
      aria-label={t("screen.pause")}
    >
      {t("screen.pause")}
    </button>
  );
}
