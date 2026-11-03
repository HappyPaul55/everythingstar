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

/**
 * The poster's surface. It is a **scrim over the room**, not a sheet of ink: the
 * room's artwork is the first thing the game ever shows, so a faint glow in each
 * corner (the room's light, and one breath of the accent) warms the empty space
 * around the card. `safe center` keeps the top of an over-tall poster reachable at
 * 400% zoom instead of centring the overflow out of view.
 */
const SCREEN =
  "screen screen--welcome [align-items:safe_center] overflow-auto [background:radial-gradient(120%_90%_at_15%_10%,rgba(255,212,0,0.16),transparent_62%),radial-gradient(80%_70%_at_92%_100%,rgba(34,224,255,0.08),transparent_62%),linear-gradient(180deg,rgba(10,11,8,0.5),rgba(10,11,8,0.74))]";

/**
 * The way in is the game's **poster**: a hazard-taped marquee over the room, built
 * as the same hard offset block in the brand's yellow that the landing page's hero
 * artwork and mode stickers wear. The tape is two 8px strips, rounded where they
 * meet the frame's corners. A **short** screen's spacing wins over a narrow one's
 * (`[html_&]`): the two can both be true, and the height is then what pinches.
 */
const PANEL =
  "screen__panel screen__panel--title relative flex flex-col items-center justify-center gap-[clamp(0.9rem,3vmin,2rem)] w-[min(84rem,100%)] min-h-[min(78vh,52rem)] px-[clamp(1.5rem,7vmin,6rem)] py-[clamp(3rem,9vmin,6.5rem)] overflow-visible text-center [background:linear-gradient(180deg,rgba(12,13,10,0.72),rgba(12,13,10,0.9))] border border-[rgba(250,250,244,0.24)] rounded-brand shadow-[0.6rem_0.6rem_0_0_var(--color-yellow)] before:absolute before:inset-x-0 before:top-0 before:h-2 before:content-[''] before:hazard before:rounded-t-brand after:absolute after:inset-x-0 after:bottom-0 after:h-2 after:content-[''] after:hazard after:rounded-b-brand [@media(max-width:44rem)]:min-h-[min(68vh,28rem)] [@media(max-width:44rem)]:gap-[clamp(0.7rem,2.4vh,1.1rem)] [@media(max-width:44rem)]:px-[clamp(0.9rem,4vmin,1.4rem)] [@media(max-width:44rem)]:py-[clamp(2.1rem,8vmin,3rem)] [@media(max-width:44rem)]:translate-y-[-2.4rem] [@media(max-height:26rem)]:[html_&]:min-h-[min(60vh,12rem)] [@media(max-height:26rem)]:[html_&]:gap-[clamp(0.5rem,2vh,0.85rem)] [@media(max-height:26rem)]:[html_&]:[padding-block:clamp(1.6rem,6vh,2.2rem)] [@media(max-height:26rem)]:[html_&]:translate-y-[-1.2rem]";

/**
 * The wordmark: one line where it fits and two where it does not. The prefix is a
 * grid whose two children share one cell — the invisible sizer keeps the width of
 * the whole name ("Everything") so swapping in a part's word can never move the
 * "Star" beside it. Wrapped, the part's word is centred over the Star instead of
 * held against it.
 */
const TITLE =
  "screen__title screen__title--welcome m-0 text-[clamp(3.4rem,14vmin,10rem)] leading-[0.92] tracking-[-0.035em] w-max max-w-full whitespace-normal [@media(max-width:44rem)]:text-[clamp(1.8rem,10vmin,3rem)] [@media(max-width:44rem)]:leading-[0.98] [@media(max-height:26rem)]:[html_&]:text-[clamp(1.6rem,9vmin,2rem)]";

/** The strapline, a marquee plate under the wordmark. */
const TAGLINE =
  "welcome__tagline m-0 font-mono text-[clamp(0.62rem,1.5vmin,0.86rem)] font-bold tracking-[0.34em] uppercase indent-[0.34em] text-[rgba(250,250,244,0.72)] [@media(max-width:44rem)]:tracking-[0.24em] [@media(max-width:44rem)]:indent-[0.24em]";

/**
 * The three ways to play, said as an arcade strip: the band's instruments and the
 * words, with only the words' place wearing the accent. The chip under the pointer
 * lights up, and the wordmark above takes its name.
 */
const MODE =
  "welcome__mode px-3 py-[0.3rem] font-mono text-kicker font-bold tracking-[0.12em] uppercase text-[rgba(250,250,244,0.8)] bg-[rgba(12,13,10,0.5)] border border-[rgba(250,250,244,0.28)] rounded-pill transition-[background-color] duration-[120ms] hover:bg-[rgba(250,250,244,0.14)] [@media(max-width:44rem)]:px-[0.6rem] [@media(max-width:44rem)]:py-[0.25rem] [@media(max-width:44rem)]:text-[0.62rem]";

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
    <div className={SCREEN}>
      <div className={PANEL}>
        <p className="comment comment-ink on-ink screen__comment welcome__build m-0">
          <span className="slash" aria-hidden="true">
            //
          </span>{" "}
          {t("screen.preview")}{" "}
          <span className="welcome__version text-[rgba(250,250,244,0.82)]">· {version}</span>
        </p>
        <h2
          ref={title}
          className={TITLE}
          data-wrapped={wrapped ? "true" : undefined}
          aria-label={t("screen.welcomeTitle")}
          onPointerEnter={() => setWord(null)}
        >
          <span
            ref={prefixWord}
            className="welcome__word welcome__word--prefix inline-grid [&>*]:[grid-area:1/1]"
          >
            {/* The sizer is the width of the whole name: it holds the space so a
                part's word swapped in on hover cannot move the Star beside it.
                Its text is drawn by CSS, not carried in the DOM: copied or
                extracted, the wordmark must read "EverythingStar", not
                "EverythingEverythingStar". */}
            <span
              className="welcome__word-sizer invisible before:content-[attr(data-text)]"
              data-text="Everything"
              aria-hidden="true"
            />
            <span className="welcome__word-live text-right [[data-wrapped]_&]:text-center">
              {word ? t(word) : "Everything"}
            </span>
          </span>
          <wbr />
          <span
            ref={starWord}
            className="welcome__word welcome__word--star ml-[0.025em] text-yellow [text-shadow:0_0_0.35em_rgba(255,212,0,0.45)] [@media(max-width:44rem)]:m-[0.025em_0_0]"
          >
            Star
          </span>
        </h2>
        <p className={TAGLINE}>{t("site.tagline")}</p>
        <ul
          className="welcome__modes flex flex-wrap justify-center gap-[0.45rem] m-0 p-0 list-none"
          aria-label={t("screen.welcomeModes")}
        >
          {MODES.map((mode) => (
            <li
              key={mode.key}
              className={
                mode.accent ? `${MODE} welcome__mode--accent text-accent border-accent` : MODE
              }
              onPointerEnter={() => setWord(mode.word)}
            >
              {t(mode.key)}
            </li>
          ))}
        </ul>
        <div className="screen__actions justify-center mt-[clamp(0.2rem,1.5vmin,0.8rem)]">
          <button
            ref={enter}
            type="button"
            className="band-btn band-btn--primary band-btn--big welcome__enter min-w-[min(19rem,100%)] min-h-[3.4rem] px-[1.6rem] py-[0.95rem] text-[0.9rem] focus-visible:outline-none data-[nav-focus]:outline-none [@media(forced-colors:active)]:focus-visible:[outline:3px_solid_CanvasText] [@media(forced-colors:active)]:data-[nav-focus]:[outline:3px_solid_CanvasText] [@media(max-width:44rem)]:min-h-[44px] [@media(max-width:44rem)]:px-4 [@media(max-width:44rem)]:py-[0.7rem]"
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
