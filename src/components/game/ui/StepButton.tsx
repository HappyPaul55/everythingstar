/**
 * One direction of a stepper: a small square control with a sign on it.
 *
 * The lag stepper in Options and the pause's quick panel are the same control, so
 * they are one component: a blocked end is `aria-disabled` rather than `disabled`,
 * because the press is the very thing that has to say "not further" — a disabled
 * button fires nothing at all.
 */
interface Props {
  direction: -1 | 1;
  /** Its accessible name, which says what the direction does. */
  label: string;
  blocked: boolean;
  /** Put a screen's default focus here. */
  defaultFocus?: boolean;
  onStep: (direction: -1 | 1) => void;
}

export function StepButton({
  direction,
  label,
  blocked,
  defaultFocus = false,
  onStep,
}: Props) {
  return (
    <button
      type="button"
      className="option__step"
      aria-label={label}
      aria-disabled={blocked}
      data-nav-default={defaultFocus ? "true" : undefined}
      data-sound={blocked ? "refuse" : "select"}
      onClick={() => {
        if (!blocked) onStep(direction);
      }}
    >
      {direction === -1 ? "−" : "+"}
    </button>
  );
}
