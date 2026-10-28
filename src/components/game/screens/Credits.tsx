import type { ReactNode } from "react";
import { useT } from "../../../i18n/react";
import type { Sound } from "../../../lib/game/audio/sounds";
import { ScreenBackButton } from "./ScreenBackButton";

/**
 * Credits: what the game is made of, and by whom.
 *
 * The list is **read where it can be** rather than written out again. The sound
 * manifest carries a `credit` per file (`docs/developers/audio.md` is where the rule lives), so the
 * music and the cues are gathered from it here — one line per licence, with how many
 * files sit under it — and a file with no credit is *said* rather than hidden, because
 * an unrecorded licence is a gap and a credits page is the place it shows.
 *
 * The rest — the fonts, the artwork, the licence, the tools — is a short list of facts
 * about the build, which is a page that changes when the build does.
 */
interface Props {
  /** The manifest's sounds, for the credits they carry. */
  sounds: readonly Sound[];
  /** From the site's own settings, so the author is named in one place. */
  site: {
    author: string;
    authorUrl: string;
    repo: string;
    license: string;
    licenseUrl: string;
  };
  onBack: () => void;
}

export function Credits({ sounds, site, onBack }: Props) {
  const t = useT();
  const sources = soundCredits(sounds);
  // Every sound in the manifest has a file; a missing one is a *type* nothing has
  // been delivered for yet (`sounds.missing`), which is not a licence anyone owes.
  // What is left are the files that shipped without the credit written down — which
  // a credits page is exactly the place to say out loud.
  const unrecorded = sounds.filter((sound) => !sound.credit).length;

  /** One line: what it is for, who it is by, and anything worth adding. */
  const row = (role: string, who: ReactNode, note?: ReactNode) => (
    <li className="credit" key={role}>
      <span className="credit__role">{role}</span>
      <span className="credit__who">{who}</span>
      {note ? <span className="credit__note">{note}</span> : null}
    </li>
  );

  return (
    <div className="screen screen--credits">
      <div className="screen__panel screen__panel--page">
        <ScreenBackButton label={t("screen.backToMenu")} onBack={onBack} />
        <h2 className="screen__title">{t("screen.credits")}</h2>
        <p className="screen__lede">{t("screen.creditsLede")}</p>

        <ul className="credits">
          {row(
            t("screen.creditGame"),
            <a href={site.authorUrl} rel="noreferrer">
              {site.author}
            </a>,
            <a href={site.repo} rel="noreferrer">
              {t("screen.creditSource")}
            </a>,
          )}

          {row(
            t("screen.creditAudio"),
            <>
              {sources.map((source) => (
                <span className="credit__source" key={source.credit}>
                  {source.credit}
                  <span className="credit__count">
                    {source.count === 1
                      ? t("screen.creditOneFile")
                      : t("screen.creditFiles", { count: source.count })}
                  </span>
                </span>
              ))}
            </>,
            unrecorded > 0 ? t("screen.creditUnrecorded", { count: unrecorded }) : undefined,
          )}

          {row(t("screen.creditFonts"), t("screen.creditFontsWho"))}
          {row(t("screen.creditArt"), t("screen.creditArtWho"))}
          {row(
            t("screen.creditLicence"),
            <a href={site.licenseUrl} rel="noreferrer">
              {site.license}
            </a>,
          )}
          {row(t("screen.creditTools"), t("screen.creditToolsWho"))}
        </ul>
      </div>
    </div>
  );
}

/**
 * The licences behind the files that shipped, with how many files each covers.
 *
 * Two files under one licence are one line: what a reader wants to know is who to
 * thank, not which click is whose.
 */
function soundCredits(sounds: readonly Sound[]): { credit: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const sound of sounds) {
    if (!sound.credit) continue;
    counts.set(sound.credit, (counts.get(sound.credit) ?? 0) + 1);
  }
  return [...counts].map(([credit, count]) => ({ credit, count }));
}
