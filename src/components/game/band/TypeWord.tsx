import { typedChars } from "../../../lib/game/typing";
import type { TypingLevel } from "../../../lib/game/typing";
import type { WordProgress } from "./useTyping";

/**
 * One word, as the player sees it — in whichever view the melody is using.
 *
 * A typist's reading rides on the words themselves: the characters typed are
 * marked, the next one is the caret, and the rest wait. That is what keeps the
 * melody to one view instead of needing a second region for typing.
 */
interface Props {
  text: string;
  level: TypingLevel;
  /** What the typist has made of this word, if they have reached it. */
  progress?: WordProgress;
}

export function TypeWord({ text, level, progress }: Props) {
  if (!progress) return <>{text}</>;

  const classes = ["melody-word", `is-${progress.status}`];
  if (progress.status === "done") {
    return (
      <span className={classes.join(" ")} data-word-state="done">
        {text}
      </span>
    );
  }
  if (progress.status === "missed") {
    return (
      <span className={classes.join(" ")} data-word-state="missed">
        {text}
      </span>
    );
  }

  return (
    <span className={classes.join(" ")} data-word-state="pending">
      {typedChars(text, level, progress.input).map((char, index) => (
        <span
          key={index}
          className={
            char.caret
              ? "melody-char is-caret"
              : char.done
                ? "melody-char is-done"
                : char.counts
                  ? "melody-char is-todo"
                  : "melody-char"
          }
        >
          {char.char}
        </span>
      ))}
    </span>
  );
}
