/**
 * A one-of-N choice, as a row of small buttons — what a setup screen steps
 * through.
 *
 * It is **dev scaffolding**: `BandControls` is its only user, for the count of
 * players on a keyboard. The product's own choices are the options page's
 * sliders and the band screen's tiles, so this arrives with `?dev=1` like the
 * panel around it.
 */
interface Props {
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
}

export function Stepper({ label, value, max, onChange }: Props) {
  return (
    <div className="band-step" role="group" aria-label={label}>
      <span className="band-step__label">{label}</span>
      {Array.from({ length: max + 1 }, (_, option) => (
        <button
          key={option}
          type="button"
          className={option === value ? "band-step__option is-active" : "band-step__option"}
          aria-pressed={option === value}
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
