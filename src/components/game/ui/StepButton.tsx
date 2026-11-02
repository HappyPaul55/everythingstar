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
      className="option__step flex items-center justify-center size-8 font-mono text-[1rem] leading-none text-cream bg-[rgba(12,13,10,0.7)] border border-[rgba(250,250,244,0.28)] rounded-inner cursor-pointer not-aria-disabled:hover:border-yellow not-aria-disabled:focus-visible:border-yellow not-aria-disabled:data-[nav-focus]:border-yellow aria-disabled:text-[rgba(250,250,244,0.35)] aria-disabled:border-[rgba(250,250,244,0.14)]"
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
