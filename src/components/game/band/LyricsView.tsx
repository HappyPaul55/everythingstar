import { useMemo } from "react";
import { useT } from "../../../i18n/react";
import { activeLineIndex, activeWordIndex, introProgress } from "../../../lib/game/run";
import type { MelodyLine, Track } from "../../../lib/game/track";
import type { TypingLevel } from "../../../lib/game/typing";
import { useClockMs } from "./StageClock";
import { TypeWord } from "./TypeWord";
import type { MelodyTyping } from "./useTyping";
import { PART_RULE, PART_TEXT, partClass } from "./partClasses";

/**
 * The view's box: a container in both axes (the words and its chip are sized in
 * `cqmin`), centred, and see-through so the backdrop is the room it sits in. It
 * is one of the two things the run's entrance drops from the top.
 */
const VIEW = [
  "lyrics-view relative flex flex-none flex-col justify-center gap-[1.5cqmin] overflow-hidden px-[5cqmin] py-[2.5cqmin] min-h-0 [container-type:size]",
  "animate-[lyrics-drop_var(--entrance-slide,650ms)_cubic-bezier(0.22,0.61,0.36,1)_var(--entrance-lead,1200ms)_both] motion-reduce:[animation-delay:0ms]",
].join(" ");

/**
 * The words: a stack for a solo, and side by side for a duet, each block with the
 * rule and the number that say whose words they are. No room for two blocks to be
 * read side by side stacks them again.
 */
const LINES_SOLO = "lyrics-view__lines flex flex-col gap-[1.4cqmin] text-center";
const LINES_DUET =
  "lyrics-view__lines flex flex-row items-stretch gap-[7cqmin] text-left @max-[34rem]:flex-col @max-[34rem]:gap-[3cqmin]";

/**
 * One block per voice. A solo has the one it always had; a duet sets them side by
 * side, separated by the stage's own gutter of space and marked by a rule in that
 * voice's colour. A line both sing simply appears in both blocks.
 *
 * A rising line starts half a line lower (see `lyric-rising`); the gap has to hold
 * that shift or it lands on the line below. The line's own font is 7cqmin here
 * (5cqmin in a duet), so 3.6cqmin clears both.
 */
const PART = "lyrics-view__part flex flex-col gap-[3.6cqmin]";
const PART_DUET = "flex-1 basis-0 border-l-[3px] pl-[3.2cqmin]";

/** Which voice reads the line, in a duet. */
const TAG =
  "lyrics-view__tag mb-[0.35em] font-mono text-[clamp(0.5rem,2.2cqmin,0.85rem)] font-bold tracking-[0.1em]";

/**
 * One line, still to be sung, being sung, or done. A line still to be sung is
 * drawn in the full colour and simply faded back, so it rises to exactly the look
 * it will have when it starts — the fade, not a colour change, tells its moment
 * from the one after it.
 */
const LINE =
  "lyrics-view__line font-display leading-[1.12] transition-[color] duration-300 ease-brand on-video";
const LINE_SOLO = "text-[clamp(1rem,7cqmin,3.4rem)]";
const LINE_DUET = "text-[clamp(0.85rem,5cqmin,2.2rem)]";
const LINE_RESTING = "text-[rgba(250,250,244,0.4)]";
const LINE_SINGING = "text-cream";

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

  const classes = [VIEW];
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
        <span className="lyrics-view__chip chip">
          {t(typing.typists.length > 0 ? "band.typists" : "band.singers", {
            count: words,
          })}
        </span>
      ) : null}
      <div className={duet ? LINES_DUET : LINES_SOLO}>
        {rows.map((row) => (
          <div
            key={row.part}
            className={[
              PART,
              duet ? PART_DUET : "",
              duet ? partClass(PART_RULE, row.part) : "",
              `is-part-${row.part}`,
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {duet ? (
              <span className={`${TAG} ${partClass(PART_TEXT, row.part)}`}>
                {row.part + 1}
              </span>
            ) : null}
            {row.lines.map((line) => {
              const sounding = line === row.activeLine && now < line.endMs;
              const rising = line === row.nextLine;
              const word = sounding ? activeWordIndex(line, now) : -1;
              const classes = [
                LINE,
                duet ? LINE_DUET : LINE_SOLO,
                sounding || rising ? LINE_SINGING : LINE_RESTING,
                rising ? "lyric-rising" : "",
              ];
              if (sounding) classes.push("is-active");
              if (rising) classes.push("is-rising");
              return (
                <p
                  key={line.timeMs}
                  className={classes.filter(Boolean).join(" ")}
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
                          sung ? "word-active" : "",
                          item.hero ? "word-hero" : "",
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
