import { localePath } from "../../../i18n/paths";
import { useLocale, useT } from "../../../i18n/react";

interface Props {
  onQuickPlay: () => void;
  onJukebox: () => void;
  onOptions: () => void;
  onCredits: () => void;
  /** The wordmark is the way back to the welcome, as a wordmark usually is. */
  onBack: () => void;
  /**
   * The `/arcade` entry is the game playing itself, not a chart-making tool: the
   * menu there has no door to the charter.
   */
  arcade?: boolean;
}

/**
 * The wordmark and the three big, tilted doors into the game, with a smaller
 * side door to the Jukebox under them.
 *
 * The masthead is the poster's: a graffiti tag, the wordmark (its "Star" lit like
 * the welcome's), a strip of hazard tape and the strapline. The wordmark itself is
 * the door back to the welcome, and the three doors below are numbered the way the
 * landing page's sticker cards are, each saying in a line where it leads — so the
 * hub reads as three ways in rather than three identical yellow bars. The Jukebox
 * is the listening mode rather than a fourth way to play, so it sits lower and
 * quieter.
 */
export function Menu({
  onQuickPlay,
  onJukebox,
  onOptions,
  onCredits,
  onBack,
  arcade = false,
}: Props) {
  const t = useT();
  const locale = useLocale();

  const item = (
    id: string,
    index: string,
    name: string,
    hint: string,
    onPress: () => void,
    side = false,
  ) => (
    <li className={side ? "menu__entry menu__entry--side" : "menu__entry"} key={id}>
      <button
        type="button"
        className={
          side
            ? "band-btn band-btn--big menu__item menu__item--side"
            : "band-btn band-btn--primary band-btn--big menu__item"
        }
        data-sound={side ? "open" : "select"}
        data-nav-id={id}
        data-nav-default={id === "quick-play" ? "true" : undefined}
        onClick={onPress}
      >
        {side ? (
          <span className="menu__disc" aria-hidden="true" />
        ) : (
          <span className="menu__index" aria-hidden="true">
            {index}
          </span>
        )}
        <span className="menu__text">
          <span className="menu__name">{name}</span>
          <span className="menu__hint">{hint}</span>
        </span>
        <span className="menu__arrow" aria-hidden="true">
          →
        </span>
      </button>
    </li>
  );

  return (
    <div className="screen screen--menu">
      <div className="menu-layout">
        <div className="menu__branding">
          <p className="comment on-ink menu__comment">
            <span className="slash" aria-hidden="true">
              //
            </span>{" "}
            {t("screen.menuComment")}
          </p>
          <div className="menu__masthead">
            <h2 className="menu__brand" aria-label={t("screen.welcomeTitle")}>
              <button
                type="button"
                className="menu__brand-button"
                aria-label={t("screen.welcomeTitle")}
                data-sound="back"
                onClick={onBack}
              >
                <span>Everything</span>
                <span className="menu__brand-star">Star</span>
              </button>
            </h2>
            <span className="hazard menu__rule" aria-hidden="true" />
            <p className="menu__tagline">{t("site.tagline")}</p>
          </div>
        </div>

        <nav className="menu__nav" aria-label={t("screen.menuTitle")}>
          <ul className="menu">
            {item(
              "quick-play",
              "01",
              t("screen.quickPlay"),
              t("screen.quickPlayHint"),
              onQuickPlay,
            )}
            {item("options", "02", t("screen.options"), t("screen.optionsHint"), onOptions)}
            {item("credits", "03", t("screen.credits"), t("screen.creditsHint"), onCredits)}
            {item(
              "jukebox",
              "",
              t("screen.jukebox"),
              t("screen.jukeboxHint"),
              onJukebox,
              true,
            )}
          </ul>
          {arcade ? null : (
            <a className="menu__charter" href={localePath(locale, "/charter")}>
              {t("charter.menu")}
            </a>
          )}
        </nav>
      </div>
    </div>
  );
}
