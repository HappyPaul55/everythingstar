interface Props {
  label: string;
  onBack: () => void;
}

/** The same way out, in the same place, on every full-page screen. */
export function ScreenBackButton({ label, onBack }: Props) {
  return (
    <button
      type="button"
      className="band-btn screen__back"
      data-sound="back"
      onClick={onBack}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <path d="M12.5 4.5 7 10l5.5 5.5M7.5 10H17" />
      </svg>
      {label}
    </button>
  );
}
