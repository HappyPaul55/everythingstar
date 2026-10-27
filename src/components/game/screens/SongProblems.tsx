/**
 * What a load said was wrong, said where it can be read.
 *
 * A load can name several things at once — a file that would not arrive, and then the
 * chart a seat is missing because of it — and showing only the first hides the rest
 * behind fixing the first. One problem is still a sentence; more than one is a short
 * list, which is the readable way to say two different things.
 */
interface Props {
  problems: readonly string[];
  /** The caller's own surface: the band's warning, the loader's quiet hint. */
  className: string;
}

export function SongProblems({ problems, className }: Props) {
  if (problems.length === 0) return null;
  if (problems.length === 1) {
    return (
      <p className={className} role="status">
        {problems[0]}
      </p>
    );
  }
  return (
    <ul className={`${className} screen__problems`} role="status">
      {problems.map((problem, index) => (
        <li key={`${index}:${problem}`}>{problem}</li>
      ))}
    </ul>
  );
}
