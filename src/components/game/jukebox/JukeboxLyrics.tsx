import { memo, useEffect, useRef } from "react";
import { useT } from "../../../i18n/react";
import { activeLineIndex, activeWordIndex } from "../../../lib/game/run";
import type { MelodyLine } from "../../../lib/game/track";
import { useSong } from "../band/SongContext";
import { useClockMs } from "../band/StageClock";
import { useReducedMotion } from "../band/useReducedMotion";

/**
 * The Jukebox's words, following the song.
 *
 * This is the **read-along** view, not the stage's melody region: one column of
 * timed lines that scrolls past the live one, with the word being heard picked
 * out. It uses the same `activeLineIndex`/`activeWordIndex` arithmetic as the
 * karaoke playhead, so the line and the word are the same ones the stage would
 * show.
 *
 * A duet keeps its two voices in one line: the words are shared text, and the
 * line's own `parts` become a coloured rule rather than a second copy of the
 * words. An instrumental — or a song whose voice chart did not arrive — says so
 * instead of leaving an empty column.
 */
interface Props {
  /** The current song's document and words are still arriving. */
  loading: boolean;
}

export function JukeboxLyrics({ loading }: Props) {
  const t = useT();
  const { track } = useSong();
  const reduced = useReducedMotion();
  const timeMs = useClockMs(100);
  const lines = track.melody.lines;
  const active = activeLineIndex(lines, timeMs);
  const word = activeWordIndex(lines[active], timeMs);
  const box = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([]);

  // The live line is kept in the middle of the reading column. This runs on a
  // line change, not on every frame: the frame clock only decides *which* line
  // is live, and the scroll is a consequence of that.
  useEffect(() => {
    const scroller = box.current;
    const target = lineRefs.current[Math.max(0, active)];
    if (!scroller || !target) return;
    const top =
      target.offsetTop - scroller.clientHeight / 2 + target.clientHeight / 2;
    scroller.scrollTo({
      top: Math.max(0, top),
      behavior: reduced ? "auto" : "smooth",
    });
  }, [active, reduced]);

  if (loading && lines.length === 0) {
    return (
      <div className="jukebox__lyrics is-loading" aria-live="polite">
        <p className="jukebox__lyrics-note">{t("screen.jukeboxLyricsLoading")}</p>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="jukebox__lyrics is-empty">
        <p className="jukebox__lyrics-note">{t("screen.jukeboxInstrumental")}</p>
      </div>
    );
  }

  return (
    <div className="jukebox__lyrics" ref={box} aria-label={t("screen.jukeboxTitle")}>
      {lines.map((line, index) => (
        <LyricLine
          key={`${line.timeMs}-${index}`}
          line={line}
          active={index === active}
          word={index === active ? word : -1}
          innerRef={(node) => {
            lineRefs.current[index] = node;
          }}
        />
      ))}
    </div>
  );
}

/**
 * One line. It is memoised on the line object and the two live indices, so the
 * ten-a-second word update does not reconcile a whole song's worth of words.
 */
const LyricLine = memo(
  function LyricLine({
    line,
    active,
    word,
    innerRef,
  }: {
    line: MelodyLine;
    active: boolean;
    word: number;
    innerRef: (node: HTMLParagraphElement | null) => void;
  }) {
    const parts = line.parts.map((part) => part.part);
    const part = parts[0] ?? 0;
    return (
      <p
        ref={innerRef}
        className={`jukebox__line is-part-${part}${active ? " is-active" : ""}${
          parts.length > 1 ? " is-duet" : ""
        }`}
        data-parts={parts.length}
      >
        {line.words.map((entry, index) => (
          <span
            key={`${entry.timeMs}-${index}`}
            className={index === word ? "jukebox__word is-sung" : "jukebox__word"}
          >
            {entry.text}{" "}
          </span>
        ))}
      </p>
    );
  },
  (previous, next) =>
    previous.line === next.line &&
    previous.active === next.active &&
    previous.word === next.word,
);
