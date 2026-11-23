import type { ReactNode } from "react";
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
 * The wordmark and the three big, tilted doors into the game, with two darker
 * side doors under them: the Jukebox and the Charter.
 *
 * The masthead is the poster's: a graffiti tag, the wordmark (its "Star" lit like
 * the welcome's), a strip of hazard tape and the strapline. The wordmark itself is
 * the door back to the welcome, and the three doors below are numbered the way the
 * landing page's sticker cards are, each saying in a line where it leads — so the
 * hub reads as three ways in rather than three identical yellow bars. The Jukebox
 * is the listening mode and the Charter is a tool, not two more ways to play, so
 * they sit under the three doors: all five share the doors' shape, tilt and hover,
 * and only the side doors' resting colours say they are a different kind of place.
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

  const entryClass = (side: boolean, first = false) =>
    side
      ? `menu__entry menu__entry--side${first ? " menu__entry--side-first" : ""}`
      : "menu__entry";

  /** What every door says: its mark, its name over a line of where it leads, its arrow. */
  const body = (lead: ReactNode, name: string, hint: string) => (
    <>
      {lead}
      <span className="menu__text">
        <span className="menu__name">{name}</span>
        <span className="menu__hint">{hint}</span>
      </span>
      <span className="menu__arrow" aria-hidden="true">
        →
      </span>
    </>
  );

  const item = (
    id: string,
    index: string,
    name: string,
    hint: string,
    onPress: () => void,
    side = false,
  ) => (
    <li className={entryClass(side, id === "jukebox")} key={id}>
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
        {body(
          side ? (
            <span className="menu__disc" aria-hidden="true" />
          ) : (
            <span className="menu__index" aria-hidden="true">
              {index}
            </span>
          ),
          name,
          hint,
        )}
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
            {arcade ? null : (
              <li className={entryClass(true)} key="charter">
                <a
                  className="band-btn band-btn--big menu__item menu__item--side"
                  href={localePath(locale, "/charter")}
                  data-sound="open"
                  data-nav-id="charter"
                >
                  {body(
                    <svg
                      className="menu__pen"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                    </svg>,
                    t("charter.menu"),
                    t("charter.menuHint"),
                  )}
                </a>
              </li>
            )}
          </ul>
        </nav>
      </div>
    </div>
  );
}
