import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useT } from "../../../i18n/react";
import type { MessageKey } from "../../../i18n";
import { useAudio } from "../audio/StageAudio";
import { focusStageTarget } from "../ui/nav";

/**
 * The way in: the game's name and one button, set as the game's own poster — a
 * hazard-taped marquee over the room. The name stays one line where it fits and
 * splits cleanly on smaller screens.
 *
 * The press does two things: it **takes the screen** (fullscreen wants a gesture,
 * and this is the one that means "let me in"), and it is the gesture that will
 * unlock audio when the song comes from a file — browsers only allow sound after a
 * press. So a run always starts from here.
 *
 * The button is the game's **loading gate** until then: the mixer decodes the cues
 * and downloads the menu bed while the poster is up, and "Enter the stage" appears
 * only when the first click will be heard. A file that never arrives still lets the
 * player in after the mixer's cap — a silent game, not a locked door.
 */
interface Props {
  onEnter: () => void;
  /**
   * Whether the screen may put focus on its button. The homepage's attract window
   * is a picture in somebody else's page, so it must not take that page's focus.
   */
  focus?: boolean;
}

/**
 * The parts on the stage, short enough for a marquee strip: the band's four
 * instruments, then the words (typed or sung). **Only the words' place wears the
 * accent** — every instrument stays in the default schema.
 *
 * `word` is the thing that part would be if it were the whole game: hovering a
 * pill renames the game ("GuitarStar"), and the poster keeps that name after the
 * pointer leaves — the strip is a choice, not a preview. Hovering the wordmark
 * itself is the way back to EverythingStar. It is a flourish, never the
 * wordmark's real name — the heading's accessible name stays EverythingStar.
 */
const MODES: ReadonlyArray<{ key: MessageKey; word: MessageKey; accent?: boolean }> = [
  { key: "mode.shortGuitar", word: "screen.welcomeWordGuitar" },
  { key: "mode.shortBass", word: "screen.welcomeWordBass" },
  { key: "mode.shortKeys", word: "screen.welcomeWordKeys" },
  { key: "mode.shortDrums", word: "screen.welcomeWordDrums" },
  { key: "mode.shortTyping", word: "screen.welcomeWordTyping" },
  { key: "mode.shortKaraoke", word: "screen.welcomeWordKaraoke", accent: true },
];

export function Welcome({ onEnter, focus = true }: Props) {
  const t = useT();
  const { ready } = useAudio();
  const enter = useRef<HTMLButtonElement | null>(null);
  const title = useRef<HTMLHeadingElement | null>(null);
  const prefixWord = useRef<HTMLSpanElement | null>(null);
  const starWord = useRef<HTMLSpanElement | null>(null);
  const version = import.meta.env.DEV ? "dev" : __BUILD_VERSION__;
  /** The part the wordmark is wearing, once a pill has been hovered. */
  const [word, setWord] = useState<MessageKey | null>(null);
  /** Whether the wordmark has wrapped, putting the Star on a line of its own. */
  const [wrapped, setWrapped] = useState(false);

  // The poster's name is one line where it fits and two where it does not, and the
  // two states cannot share one alignment: on a line the part's word is held
  // against the Star, while stacked the Star is centred below it and a word still
  // pushed right would sit out of line. So the title says which it is, and the
  // stylesheet centres the word only while it is stacked. The prefix box keeps the
  // width of the whole name either way, so the wrap cannot flicker as the word
  // changes.
  useLayoutEffect(() => {
    const heading = title.current;
    if (!heading) return;
    const measure = () => {
      const first = prefixWord.current;
      const last = starWord.current;
      if (!first || !last) return;
      const stacked =
        last.getBoundingClientRect().top - first.getBoundingClientRect().top > 1;
      setWrapped((was) => (was === stacked ? was : stacked));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(heading);
    return () => observer.disconnect();
  }, []);

  // The screen opened on a disabled button, so there was nowhere for focus to land.
  // When it becomes pressable it is the screen's starting control again — but only
  // if the player has not already put focus somewhere else. The game's own focus
  // is silent: the screen announcement has already said where they are.
  useEffect(() => {
    if (!focus || !ready || document.activeElement !== document.body) return;
    if (enter.current) focusStageTarget(enter.current, { silent: true });
  }, [focus, ready]);

  return (
    <div className="screen screen--welcome">
      <div className="screen__panel screen__panel--title">
        <p className="comment on-ink screen__comment welcome__build">
          <span className="slash" aria-hidden="true">
            //
          </span>{" "}
          {t("screen.preview")} <span className="welcome__version">· {version}</span>
        </p>
        <h2
          ref={title}
          className="screen__title screen__title--welcome"
          data-wrapped={wrapped ? "true" : undefined}
          aria-label={t("screen.welcomeTitle")}
          onPointerEnter={() => setWord(null)}
        >
          <span ref={prefixWord} className="welcome__word welcome__word--prefix">
            {/* The sizer is the width of the whole name: it holds the space so a
                part's word swapped in on hover cannot move the Star beside it. */}
            <span className="welcome__word-sizer" aria-hidden="true">
              Everything
            </span>
            <span className="welcome__word-live">{word ? t(word) : "Everything"}</span>
          </span>
          <wbr />
          <span ref={starWord} className="welcome__word welcome__word--star">
            Star
          </span>
        </h2>
        <p className="welcome__tagline">{t("site.tagline")}</p>
        <ul className="welcome__modes" aria-label={t("screen.welcomeModes")}>
          {MODES.map((mode) => (
            <li
              key={mode.key}
              className={mode.accent ? "welcome__mode welcome__mode--accent" : "welcome__mode"}
              onPointerEnter={() => setWord(mode.word)}
            >
              {t(mode.key)}
            </li>
          ))}
        </ul>
        <div className="screen__actions">
          <button
            ref={enter}
            type="button"
            className="band-btn band-btn--primary band-btn--big welcome__enter"
            data-nav-default={ready ? "true" : undefined}
            disabled={!ready}
            aria-busy={ready ? undefined : "true"}
            onClick={onEnter}
          >
            {ready ? (
              <>
                {t("screen.enter")} <span aria-hidden="true">→</span>
              </>
            ) : (
              t("screen.enterLoading")
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
