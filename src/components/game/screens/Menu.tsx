import { localePath } from "../../../i18n/paths";
import { useLocale, useT } from "../../../i18n/react";

interface Props {
  onQuickPlay: () => void;
  onOptions: () => void;
  onCredits: () => void;
  /** The wordmark is the way back to the welcome, as a wordmark usually is. */
  onBack: () => void;
}

/**
 * The hub's surface wears the welcome's poster language over the room's own glow,
 * so the two screens read as the same show.
 */
const SCREEN =
  "screen screen--menu [align-items:safe_center] overflow-auto p-[clamp(0.35rem,2vmin,1.6rem)] [background:radial-gradient(120%_90%_at_12%_8%,rgba(255,212,0,0.15),transparent_62%),radial-gradient(80%_70%_at_95%_100%,rgba(34,224,255,0.08),transparent_62%),linear-gradient(180deg,rgba(10,11,8,0.52),rgba(10,11,8,0.78))]";

/**
 * The two-column hub, one column on a phone. A **short** screen's own spacing wins
 * over a narrow one's (`[html_&]` makes that tier a touch more specific): a phone in
 * landscape is both, and its limited height is the constraint that matters. */
const LAYOUT =
  "menu-layout grid grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)] items-center gap-[clamp(2rem,8vw,8rem)] w-[min(84rem,100%)] h-full mx-auto p-[clamp(0.5rem,3vmin,2rem)] [@media(max-width:44rem)]:grid-cols-[minmax(0,1fr)] [@media(max-width:44rem)]:grid-rows-[auto_auto] [@media(max-width:44rem)]:justify-items-center [@media(max-width:44rem)]:content-center [@media(max-width:44rem)]:gap-[clamp(1rem,3.8vh,2rem)] [@media(max-width:44rem)]:px-3 [@media(max-width:44rem)]:pt-[clamp(0.5rem,2vh,0.9rem)] [@media(max-width:44rem)]:pb-[clamp(2rem,8vh,3rem)] [@media(max-width:44rem)]:translate-y-[-2rem] [@media(max-height:30rem)]:[html_&]:gap-3 [@media(max-height:30rem)]:[html_&]:px-3 [@media(max-height:30rem)]:[html_&]:pt-2 [@media(max-height:30rem)]:[html_&]:pb-5 [@media(max-width:44rem)_and_(max-height:22rem)]:translate-y-0";

/**
 * The wordmark drifts on `translate`, so the hub is never quite still — and the
 * button's own hover `translate` is free to lift on top. Hovering it freezes the
 * drift while it is read and pressed. At 44rem and below it drops the perspective
 * and sits centred over the doors.
 */
const BRAND =
  "menu__brand m-0 font-display text-[clamp(3.7rem,8.2vw,8.7rem)] font-normal leading-[0.78] tracking-[-0.045em] text-cream [transform:perspective(900px)_rotateY(12deg)] [transform-origin:center] animate-menu-float [animation-duration:8s] [animation-direction:alternate] hover:[animation-play-state:paused] focus-within:[animation-play-state:paused] [&_span]:block [@media(max-width:44rem)]:self-center [@media(max-width:44rem)]:text-[clamp(2rem,10vw,2.8rem)] [@media(max-width:44rem)]:leading-[0.84] [@media(max-width:44rem)]:text-center [@media(max-width:44rem)]:[transform:none] [@media(max-height:30rem)]:[html_&]:text-[clamp(1.7rem,7vh,2.2rem)]";

/**
 * The wordmark is the door back to the welcome: a button stripped to plain type
 * that lifts and lights its Star. It does not wear a focus box — the lift and the
 * glow are the cue.
 */
const BRAND_BUTTON =
  "menu__brand-button group/brand block m-0 p-0 [font:inherit] text-inherit [text-align:inherit] [background:none] [border:none] cursor-pointer rounded-inner transition-[translate] duration-[220ms] hover:outline-cream focus-visible:outline-cream data-[nav-focus]:outline-cream hover:translate-y-[-0.1em] focus-visible:translate-y-[-0.1em] data-[nav-focus]:translate-y-[-0.1em] focus-visible:outline-none data-[nav-focus]:outline-none [@media(forced-colors:active)]:focus-visible:[outline:3px_solid_CanvasText] [@media(forced-colors:active)]:data-[nav-focus]:[outline:3px_solid_CanvasText]";

/** The same neon breath as the welcome, so the wordmark is one wordmark. */
const BRAND_STAR =
  "menu__brand-star mt-[0.14em] mb-0 ml-[0.62em] text-yellow [text-shadow:0_0_0.35em_rgba(255,212,0,0.45)] transition-[text-shadow] duration-[220ms] group-hover/brand:[text-shadow:0_0_0.45em_rgba(255,212,0,0.7),0_0_1.3em_rgba(255,212,0,0.45)] group-focus-visible/brand:[text-shadow:0_0_0.45em_rgba(255,212,0,0.7),0_0_1.3em_rgba(255,212,0,0.45)] group-data-[nav-focus]/brand:[text-shadow:0_0_0.45em_rgba(255,212,0,0.7),0_0_1.3em_rgba(255,212,0,0.45)] [@media(max-width:44rem)]:mt-[0.08em]";

const TAGLINE =
  "menu__tagline m-0 font-mono text-[clamp(0.62rem,1.4vmin,0.82rem)] font-bold tracking-[0.3em] uppercase indent-[0.3em] text-[rgba(250,250,244,0.9)] [text-shadow:0_1px_0_rgba(12,13,10,0.95),0_0_5px_rgba(12,13,10,0.95),0_0_14px_rgba(12,13,10,0.8)] [@media(max-width:44rem)]:tracking-[0.22em] [@media(max-width:44rem)]:indent-[0.22em] [@media(max-height:30rem)]:hidden";

/**
 * A door: its number, its name over a line of where it leads, and an arrow. It
 * lifts the way the landing page's stickers do — a hard block of the brand's own
 * yellow under it and a step up out of the row — and that lift is its focus cue,
 * so the ring would be a second border saying the same thing.
 */
const ITEM =
  "band-btn band-btn--primary band-btn--big menu__item group/item relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-[clamp(0.7rem,1.6vw,1.2rem)] w-full min-h-[clamp(4.2rem,9vmin,6rem)] px-[clamp(0.9rem,2vw,1.4rem)] py-3 text-left text-[clamp(1.05rem,2vw,1.5rem)] [transform:perspective(900px)_rotateY(-12deg)_rotateX(2deg)] [transform-origin:center] [transition:background-color_0.18s_var(--ease-brand),border-color_0.18s_var(--ease-brand),color_0.18s_var(--ease-brand),box-shadow_0.22s_var(--ease-brand),translate_0.22s_var(--ease-brand)] hover:shadow-[0.5rem_0.5rem_0_0_var(--color-yellow)] hover:translate-x-[-0.25rem] hover:translate-y-[-0.25rem] focus-visible:shadow-[0.5rem_0.5rem_0_0_var(--color-yellow)] focus-visible:translate-x-[-0.25rem] focus-visible:translate-y-[-0.25rem] data-[nav-focus]:shadow-[0.5rem_0.5rem_0_0_var(--color-yellow)] data-[nav-focus]:translate-x-[-0.25rem] data-[nav-focus]:translate-y-[-0.25rem] focus-visible:outline-none data-[nav-focus]:outline-none [@media(forced-colors:active)]:focus-visible:[outline:3px_solid_CanvasText] [@media(forced-colors:active)]:data-[nav-focus]:[outline:3px_solid_CanvasText] [@media(max-width:44rem)]:min-h-[clamp(44px,8vh,3.5rem)] [@media(max-width:44rem)]:px-[0.8rem] [@media(max-width:44rem)]:py-[0.6rem] [@media(max-width:44rem)]:text-[clamp(1rem,5.2vw,1.3rem)] [@media(max-width:44rem)]:[transform:perspective(800px)_rotateX(1deg)] [@media(max-height:30rem)]:[html_&]:min-h-[44px] [@media(max-height:30rem)]:[html_&]:[padding-block:0.4rem]";

const HINT =
  "menu__hint font-body text-[0.72rem] font-normal tracking-[0.01em] leading-[1.25] normal-case text-[rgba(12,13,10,0.68)] [@media(max-width:44rem)]:text-[0.66rem] [@media(max-height:30rem)]:[html_&]:text-[0.64rem]";

const ARROW =
  "menu__arrow text-[1.1rem] leading-none text-[rgba(12,13,10,0.7)] transition-transform duration-[220ms] group-hover/item:translate-x-[0.3rem] group-focus-visible/item:translate-x-[0.3rem] group-data-[nav-focus]/item:translate-x-[0.3rem]";

/**
 * The wordmark and the three big, tilted doors into the game.
 *
 * The masthead is the poster's: a graffiti tag, the wordmark (its "Star" lit like
 * the welcome's), a strip of hazard tape and the strapline. The wordmark itself is
 * the door back to the welcome, and the three doors below are numbered the way the
 * landing page's sticker cards are, each saying in a line where it leads — so the
 * hub reads as three ways in rather than three identical yellow bars.
 */
export function Menu({ onQuickPlay, onOptions, onCredits, onBack }: Props) {
  const t = useT();
  const locale = useLocale();

  const item = (
    id: string,
    index: string,
    name: string,
    hint: string,
    onPress: () => void,
  ) => (
    <li className="menu__entry" key={id}>
      <button
        type="button"
        className={ITEM}
        data-sound="select"
        data-nav-id={id}
        data-nav-default={id === "quick-play" ? "true" : undefined}
        onClick={onPress}
      >
        <span className="menu__index font-mono text-[0.72rem] font-bold tracking-[0.1em] text-ink-soft" aria-hidden="true">
          {index}
        </span>
        <span className="menu__text flex flex-col gap-[0.18rem] min-w-0">
          <span className="menu__name leading-none">{name}</span>
          <span className={HINT}>{hint}</span>
        </span>
        <span className={ARROW} aria-hidden="true">
          →
        </span>
      </button>
    </li>
  );

  return (
    <div className={SCREEN}>
      <div className={LAYOUT}>
        <div className="menu__branding flex flex-col items-start gap-[clamp(0.6rem,1.7vmin,1.1rem)] min-w-0 [@media(max-width:44rem)]:items-center [@media(max-width:44rem)]:text-center [@media(max-width:44rem)]:gap-[clamp(0.45rem,1.5vmin,0.75rem)] [@media(max-height:30rem)]:[html_&]:gap-[0.35rem]">
          <p className="comment comment-ink on-ink menu__comment m-0">
            <span className="slash" aria-hidden="true">
              //
            </span>{" "}
            {t("screen.menuComment")}
          </p>
          <div className="menu__masthead flex flex-col items-center gap-[clamp(0.6rem,1.7vmin,1.1rem)] w-max max-w-full [@media(max-height:30rem)]:[html_&]:gap-[0.35rem]">
            <h2 className={BRAND} aria-label={t("screen.welcomeTitle")}>
              <button
                type="button"
                className={BRAND_BUTTON}
                aria-label={t("screen.welcomeTitle")}
                data-sound="back"
                onClick={onBack}
              >
                <span>Everything</span>
                <span className={BRAND_STAR}>Star</span>
              </button>
            </h2>
            <span
              className="hazard menu__rule w-[min(20rem,72%)] mt-[clamp(0.7rem,3vmin,1.8rem)] rounded-pill [@media(max-width:44rem)]:w-[min(14rem,58%)] [@media(max-height:30rem)]:mt-[0.3rem]"
              aria-hidden="true"
            />
            <p className={TAGLINE}>{t("site.tagline")}</p>
          </div>
        </div>

        <nav
          className="menu__nav [perspective:1000px] [@media(max-width:44rem)]:self-center [@media(max-width:44rem)]:flex [@media(max-width:44rem)]:flex-col [@media(max-width:44rem)]:items-center [@media(max-width:44rem)]:gap-[0.35rem] [@media(max-width:44rem)]:w-[min(28rem,calc(100%-1rem))]"
          aria-label={t("screen.menuTitle")}
        >
          <ul className="menu flex flex-col gap-[clamp(0.5rem,2.2vmin,1.2rem)] m-0 p-0 list-none [@media(max-width:44rem)]:w-full [@media(max-width:44rem)]:gap-[clamp(0.25rem,1.4vh,0.6rem)] [@media(max-height:30rem)]:[html_&]:gap-[0.35rem]">
            {item(
              "quick-play",
              "01",
              t("screen.quickPlay"),
              t("screen.quickPlayHint"),
              onQuickPlay,
            )}
            {item("options", "02", t("screen.options"), t("screen.optionsHint"), onOptions)}
            {item("credits", "03", t("screen.credits"), t("screen.creditsHint"), onCredits)}
          </ul>
          <a
            className="menu__charter inline-block mt-[clamp(0.7rem,2vmin,1.1rem)] text-[rgba(250,250,244,0.62)] font-mono text-[clamp(0.56rem,1.2vmin,0.68rem)] tracking-[0.12em] uppercase no-underline hover:text-yellow focus-visible:text-yellow"
            href={localePath(locale, "/charter")}
          >
            {t("charter.menu")}
          </a>
        </nav>
      </div>
    </div>
  );
}
