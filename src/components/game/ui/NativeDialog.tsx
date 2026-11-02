import { useId, type ReactNode } from "react";
import { useT } from "../../../i18n/react";
import { useModal } from "./useModal";

/**
 * The dialog's own frame: full-viewport and centred, so the panel is a card over
 * the screen rather than a page. It is a native `<dialog>` in the top layer, so
 * the safe-area padding is the same gutter every screen keeps.
 */
const DIALOG = [
  "config config--native fixed inset-0 z-[27] m-0 flex h-dvh w-full max-h-none max-w-none items-center justify-center overflow-auto border-0 bg-transparent text-cream pointer-events-auto",
  "p-[max(clamp(0.6rem,2vmin,1.6rem),env(safe-area-inset-top,0px))_max(clamp(0.6rem,2vmin,1.6rem),env(safe-area-inset-right,0px))_max(clamp(0.6rem,2vmin,1.6rem),env(safe-area-inset-bottom,0px))_max(clamp(0.6rem,2vmin,1.6rem),env(safe-area-inset-left,0px))]",
  "[&::backdrop]:bg-[rgba(10,11,8,0.78)]",
].join(" ");

/** What the × in a dialog's corner is: the same 44px target the band's boxes use. */
const CLOSE =
  "slot__remove flex-none grid size-[2.75rem] cursor-pointer place-items-center rounded-inner border-0 bg-transparent p-0 text-[1.05rem] leading-none text-[rgba(250,250,244,0.5)] [&:hover]:text-accent [&[data-nav-focus]]:text-accent [:root:not([data-game-input=pointer])_&:focus-visible]:text-accent";

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  panelClassName?: string;
  /** Show the title row with its close control. A pause carries its own heading. */
  showHeader?: boolean;
  /** Does a backdrop click close it? */
  dismissible?: boolean;
  /** A selector for the control to focus on open; the dialog itself otherwise. */
  initialFocus?: string;
}

/** Shared native modal shell for the game's dialogs. */
export function NativeDialog({
  title,
  onClose,
  children,
  className,
  panelClassName,
  showHeader = true,
  dismissible = true,
  initialFocus,
}: Props) {
  const t = useT();
  const titleId = useId();
  const modal = useModal(onClose, { dismissible, initialFocus });

  const panelClass = ["config__panel", "dialog-panel", panelClassName]
    .filter(Boolean)
    .join(" ");

  return (
    <dialog
      ref={modal.dialog}
      className={[DIALOG, className].filter(Boolean).join(" ")}
      aria-labelledby={showHeader ? titleId : undefined}
      aria-label={showHeader ? undefined : title}
      tabIndex={-1}
      onCancel={(event) => {
        event.preventDefault();
        modal.onCancel();
      }}
      onClose={modal.onClose}
      onClick={modal.onClick}
    >
      <div className={panelClass}>
        {showHeader ? (
          <div className="config__head flex items-center gap-[0.4rem]">
            <h2
              className="config__who m-0 mr-auto font-mono text-[0.62rem] font-bold uppercase tracking-[0.1em] text-[rgba(250,250,244,0.75)]"
              id={titleId}
            >
              {title}
            </h2>
            <button
              type="button"
              className={CLOSE}
              aria-label={t("screen.close")}
              data-sound="back"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        ) : null}
        {children}
      </div>
    </dialog>
  );
}
