import { useEffect, useRef } from "react";
import { pushDialog, removeDialog } from "./modalStack";
import { focusablesIn, focusStageTarget } from "./nav";

/**
 * The behaviour every game modal shares: native `<dialog>`, a focus trap, a way
 * back out with Escape, and focus returned to the control that opened it.
 *
 * The element owns modality — `showModal()` makes the rest of the document inert
 * and keeps Tab inside — so the game does not hand-roll a focus trap. This hook
 * adds the two things `<dialog>` leaves to us: what to focus on the way in, and
 * what to focus on the way out.
 *
 * A close that comes from the pad's B button goes through the owner's own
 * `onClose`, exactly as Escape and the backdrop do, so a dialog that refuses to go
 * — an import still copying — refuses the pad too. The `close` event is what tells
 * the React screen to unmount. A close that comes from the screen itself unmounts
 * the dialog, so the cleanup must not call back again.
 */
export interface ModalOptions {
  /** Does clicking the backdrop close it? A pause is not dismissed by a miss-click. */
  dismissible?: boolean;
  /** A selector for the control to focus on open; the dialog itself otherwise. */
  initialFocus?: string;
}

export function useModal(
  onClose: () => void,
  options: ModalOptions = {},
): {
  dialog: React.RefObject<HTMLDialogElement | null>;
  onCancel: () => void;
  onClose: () => void;
  onClick: (event: React.MouseEvent<HTMLDialogElement>) => void;
} {
  const dialog = useRef<HTMLDialogElement | null>(null);
  const closing = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  const openerHadNav = useRef(false);
  const close = useRef(onClose);
  const dismissible = options.dismissible ?? true;
  const initialFocus = options.initialFocus;

  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    closing.current = false;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openerHadNav.current = opener.current?.hasAttribute("data-nav-focus") ?? false;
    if (!element.open) element.showModal();
    // The one place a game dialog announces itself as open. Everything that asks
    // "which dialog is on top?" — the pad's cursor, B, the Escape guard — reads
    // this list rather than the DOM's first-open-dialog order, which cannot tell a
    // Practice dialog from the pause underneath it. The closer is the owner's, so
    // the pad's B asks the same gate Escape and the backdrop ask.
    pushDialog(element, () => close.current());
    // A close can come from the pad's B as well as from the screen unmounting;
    // either way it is no longer modal, so it leaves the stack.
    const forget = () => removeDialog(element);
    element.addEventListener("close", forget);

    const frame = requestAnimationFrame(() => {
      const target =
        (initialFocus ? element.querySelector<HTMLElement>(initialFocus) : null) ??
        element.querySelector<HTMLElement>("[data-dialog-focus]") ??
        focusablesIn(element)[0] ??
        element;
      // The first control is where a pad's cursor lands too; the marker keeps its
      // ring visible when the dialog was opened from a pad rather than the mouse.
      focusStageTarget(target, { silent: true });
    });

    // A row that forgets itself removes the button that had focus. A modal cannot
    // let focus fall to the document behind it, so bring it back to the dialog.
    const recover = (event: FocusEvent) => {
      if (closing.current || event.relatedTarget !== null) return;
      requestAnimationFrame(() => {
        if (element.open && !element.contains(document.activeElement)) {
          focusStageTarget(focusablesIn(element)[0] ?? element, { silent: true });
        }
      });
    };
    element.addEventListener("focusout", recover);

    return () => {
      element.removeEventListener("focusout", recover);
      element.removeEventListener("close", forget);
      cancelAnimationFrame(frame);
      closing.current = true;
      removeDialog(element);
      if (element.open) element.close();
      if (opener.current?.isConnected) {
        if (openerHadNav.current) focusStageTarget(opener.current, { silent: true });
        else opener.current.focus({ preventScroll: true });
      }
    };
  }, [initialFocus]);

  return {
    dialog,
    onCancel: () => {
      close.current();
    },
    onClose: () => {
      // The cleanup closes the dialog as it unmounts; that is not a second close.
      if (!closing.current) close.current();
    },
    onClick: (event) => {
      if (!dismissible) return;
      if (event.target === event.currentTarget) close.current();
    },
  };
}
