import { useId, type ReactNode } from "react";
import { useT } from "../../../i18n/react";
import { useModal } from "./useModal";

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

  const panelClass = ["config__panel", panelClassName].filter(Boolean).join(" ");

  return (
    <dialog
      ref={modal.dialog}
      className={["config", "config--native", className].filter(Boolean).join(" ")}
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
          <div className="config__head">
            <h2 className="config__who" id={titleId}>
              {title}
            </h2>
            <button
              type="button"
              className="slot__remove"
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
