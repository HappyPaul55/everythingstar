import { useEffect, useRef } from "react";
import { useT } from "../../../i18n/react";
import { useSongAudioProgress } from "../band/SongAudioStatus";
import { SongProblems } from "./SongProblems";

/**
 * The loader, between choosing a song and the stage's entrance.
 *
 * A song's charts are fetched as the band screen opens, so this is usually over
 * before it is read — but it is what a run actually waits for: `ready` is the track
 * being in hand, and the song's own **stems** have to say they are ready too. The
 * band screen's Play button is the loader for the ordinary path; this page still
 * waits for both halves when another way in (the attract demo, a load that started
 * elsewhere) reaches it. A chart that never arrives is said here and the run goes
 * on without it, because a band with one player missing a part is still a band.
 */
interface Props {
  /** The track is loaded and the run can start. The sound is checked here too. */
  ready: boolean;
  /** Anything the files said was wrong, named. */
  problems: readonly string[];
  onLoaded: () => void;
}

/** How long the spinner is shown at the least, so it reads rather than flashes. */
const MINIMUM_MS = 420;

export function Loading({ ready, problems, onLoaded }: Props) {
  const t = useT();
  // The sound is the other half of the wait: a chart in hand and no drums is not a
  // run to start. A song with no stems is ready at once.
  const audio = useSongAudioProgress();
  const done = ready && audio.ready;
  // The session hands down a new arrow on every render, and the timer must not
  // start again because the library or the sounds changed underneath it. Read the
  // latest through a ref, as `StageDirector` does with its callbacks.
  const loaded = useRef(onLoaded);
  loaded.current = onLoaded;

  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(() => loaded.current(), MINIMUM_MS);
    return () => window.clearTimeout(timer);
  }, [done]);

  return (
    <div
      className="screen screen--loading"
      role="status"
      aria-label={t("screen.loading")}
      tabIndex={-1}
      data-nav-default="true"
    >
      <div className="screen__panel screen__panel--centre">
        <span className="screen__spinner" aria-hidden="true" />
        <p className="screen__status">{t("screen.loading")}</p>
        {problems.length > 0 ? (
          <SongProblems problems={problems} className="screen__hint" />
        ) : null}
      </div>
    </div>
  );
}

