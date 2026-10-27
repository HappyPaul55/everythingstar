import { useMemo } from "react";
import { useT } from "../../../i18n/react";
import { activeLineIndex, activeWordIndex, introProgress } from "../../../lib/game/run";
import type { MelodyLine, Track } from "../../../lib/game/track";
import type { TypingLevel } from "../../../lib/game/typing";
import { useClockMs } from "./StageClock";
import { TypeWord } from "./TypeWord";
import type { MelodyTyping } from "./useTyping";

/**
 * The lyrics view: a song whose words carry no pitch, a pitched song with only
 * typists, or Listen. It is where a typist reads, since typing wants the words
 * rather than the roll.
 *
 * Each part gets its own block, side by side, with a rule in its colour and its
 * number down the side; each block is self-contained, so a line both parts sing
 * simply appears in both. A line still to come **fades up** over its run-up, so a
 * player can see their own entry arriving.
 */
interface Props {
  /** How many of the words' players there are, for the chip. */
  words: number;
  /** A fixed height, or none to fill the box it is put in. */
  height?: number;
  track: Track;
  typing: MelodyTyping;
  /** What the typists have to type. Free play, on a lyrics song. */
  level: TypingLevel;
  /** Parts the melody has, so each block knows whose words it is showing. */
  parts: number;
}

/** How many lines are on screen at once, for one part. */
const LINE_SPAN = 3;

export function LyricsView({
  words,
  height,
  track,
  typing,
  level,
  parts,
}: Props) {
  const t = useT();
  const now = useClockMs(80);
  const duet = parts > 1;

  const rows = useMemo(
    () => buildRows(track.melody.lines, parts, now),
    [track.melody.lines, parts, now],
  );

  const classes = ["lyrics-view"];
  if (duet) classes.push("lyrics-view--duet");

  return (
    // A **group** inside the melody region: the words are the region's content,
    // drawn one way or the other, so a nested landmark here would name the same
    // place twice. The label is what tells the two views apart within it.
    <div
      className={classes.join(" ")}
      style={{ height: height ?? "100%" }}
      role="group"
      aria-label={t("band.melody")}
    >
      {words > 0 ? (
        <span className="lyrics-view__chip">
          {t(typing.typists.length > 0 ? "band.typists" : "band.singers", {
            count: words,
          })}
        </span>
      ) : null}
      <div className="lyrics-view__lines">
        {rows.map((row) => (
          <div key={row.part} className={`lyrics-view__part is-part-${row.part}`}>
            {duet ? <span className="lyrics-view__tag">{row.part + 1}</span> : null}
            {row.lines.map((line) => {
              const sounding = line === row.activeLine && now < line.endMs;
              const rising = line === row.nextLine;
              const word = sounding ? activeWordIndex(line, now) : -1;
              const classes = ["lyrics-view__line"];
              if (sounding) classes.push("is-active");
              if (rising) classes.push("is-rising");
              return (
                <p
                  key={line.timeMs}
                  className={classes.join(" ")}
                  style={
                    rising
                      ? ({
                          "--approach": introProgress(line.timeMs, now),
                        } as React.CSSProperties)
                      : undefined
                  }
                >
                  {line.words.map((item, index) => {
                    const sung = index === word;
                    return (
                      <span
                        key={index}
                        className={[
                          "lyrics-view__word",
                          sung ? "is-active" : "",
                          item.hero ? "is-hero" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <TypeWord
                          text={item.text}
                          level={level}
                          progress={typing.words[row.part]?.get(item.timeMs)}
                        />
                        {index < line.words.length - 1 ? " " : ""}
                      </span>
                    );
                  })}
                </p>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** One block of the view: a part, the lines it is reading, and which is live. */
interface PartRow {
  part: number;
  lines: MelodyLine[];
  activeLine: MelodyLine | undefined;
  /** The next line this part has still to start. */
  nextLine: MelodyLine | undefined;
}

/**
 * The lines on screen, grouped by part. A solo keeps the one stack it always had
 * — the line before, the live one and the one coming. A duet gives each part its
 * own block of the live line and the one after it.
 */
function buildRows(
  lines: readonly MelodyLine[],
  parts: number,
  now: number,
): PartRow[] {
  if (parts <= 1) {
    const active = activeLineIndex(lines, now);
    const first = Math.max(0, active - 1);
    const shown = lines.slice(first, first + LINE_SPAN);
    return [
      {
        part: 0,
        lines: shown,
        activeLine: active >= 0 ? lines[active] : undefined,
        nextLine: shown.find((line) => line.timeMs > now),
      },
    ];
  }
  return Array.from({ length: parts }, (_, part) => {
    const own = lines.filter((line) =>
      line.parts.some((sung) => sung.part === part),
    );
    const active = activeLineIndex(own, now);
    const from = active >= 0 ? active : 0;
    const shown = own.slice(from, from + 2);
    return {
      part,
      lines: shown,
      activeLine: active >= 0 ? own[active] : undefined,
      nextLine: shown.find((line) => line.timeMs > now),
    };
  });
}
