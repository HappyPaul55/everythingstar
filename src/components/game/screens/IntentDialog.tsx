import type { ReactNode } from "react";
import { useT } from "../../../i18n/react";
import type { MessageKey } from "../../../i18n";
import { hostOf } from "../../../lib/game/url";
import type { IntentRequest } from "../intent/useIntent";
import { NativeDialog } from "../ui/NativeDialog";

/**
 * The question a link asks.
 *
 * A link adds nothing on its own: this is the one press that does, and it shows
 * the **host** rather than the whole address so the player can see who they are
 * about to fetch from. A playlist is read by the library and reports its count; a
 * song is read before it is kept, so a refusal is said here rather than discovered
 * in a jukebox row that cannot be opened.
 *
 * Working is deliberately not dismissible — a request is already out, and a
 * second question would replace this one without an answer.
 */
interface Props {
  request: IntentRequest;
  onAccept: () => void;
  onDismiss: () => void;
}

export function IntentDialog({ request, onAccept, onDismiss }: Props) {
  const t = useT();

  if (request.phase === "invalid") {
    const reason: MessageKey =
      request.reason === "both"
        ? "screen.intentInvalidBoth"
        : request.reason === "long"
          ? "screen.intentInvalidLong"
          : "screen.intentInvalidUrl";
    return (
      <NativeDialog
        title={t("screen.intentInvalidTitle")}
        onClose={onDismiss}
        panelClassName="intent"
        initialFocus="[data-intent-primary]"
      >
        <p className="config__lead">{t(reason)}</p>
        <Actions>
          <button
            type="button"
            className="band-btn band-btn--primary"
            data-intent-primary
            data-sound="select"
            onClick={onDismiss}
          >
            {t("screen.close")}
          </button>
        </Actions>
      </NativeDialog>
    );
  }

  const host = hostOf(request.intent.url) ?? "";
  const kind = request.intent.kind;
  const working = request.phase === "working";
  const done = request.phase === "done" ? request.outcome : null;
  const added = done?.kind === "playlist" || done?.kind === "song";

  const title = t(
    done?.kind === "already"
      ? "screen.intentAlreadyTitle"
      : added
        ? "screen.intentAddedTitle"
        : kind === "playlist"
          ? "screen.intentPlaylistTitle"
          : "screen.intentSongTitle",
  );

  return (
    <NativeDialog
      title={title}
      onClose={onDismiss}
      dismissible={!working}
      panelClassName="intent"
      // The selector must not change between phases: `useModal` re-runs its setup
      // when it does, and its cleanup closes the dialog — which, once the add has
      // finished, would dismiss the answer that was just given. A phase with no
      // primary button falls back to the dialog's first control.
      initialFocus="[data-intent-primary]"
    >
      {request.phase === "ask" ? (
        <>
          <p className="config__lead">{t("screen.intentFrom", { host })}</p>
          <p className="config__hint">
            {t(kind === "playlist" ? "screen.intentPlaylistHint" : "screen.intentSongHint")}
          </p>
        </>
      ) : null}

      {working ? (
        <p className="config__lead" role="status">
          {t("screen.intentAdding")}
        </p>
      ) : null}

      {done ? <Outcome outcome={done} host={host} /> : null}

      <Actions>
        {request.phase === "ask" ? (
          <>
            <button
              type="button"
              className="band-btn band-btn--primary"
              data-intent-primary
              data-sound="select"
              onClick={onAccept}
            >
              {t("screen.intentAdd")}
            </button>
            <button type="button" className="band-btn" data-sound="back" onClick={onDismiss}>
              {t("screen.intentNotNow")}
            </button>
          </>
        ) : done?.kind === "failed" ? (
          <>
            <button
              type="button"
              className="band-btn band-btn--primary"
              data-intent-primary
              data-sound="select"
              onClick={onAccept}
            >
              {t("screen.intentTryAgain")}
            </button>
            <button type="button" className="band-btn" data-sound="back" onClick={onDismiss}>
              {t("screen.close")}
            </button>
          </>
        ) : working ? null : (
          <button
            type="button"
            className="band-btn band-btn--primary"
            data-intent-primary
            data-sound="select"
            onClick={onDismiss}
          >
            {t("screen.close")}
          </button>
        )}
      </Actions>
    </NativeDialog>
  );
}

function Outcome({
  outcome,
  host,
}: {
  outcome: Extract<IntentRequest, { phase: "done" }>["outcome"];
  host: string;
}) {
  const t = useT();
  switch (outcome.kind) {
    case "playlist":
      return (
        <>
          <p className="config__lead">
            {t("screen.intentPlaylistAdded", { name: outcome.name ?? host })}
          </p>
          <p className="config__hint">
            {outcome.count === 1
              ? t("screen.playlistOneSong")
              : t("screen.playlistSongs", { count: outcome.count })}
            {outcome.problems > 0
              ? ` · ${t("screen.playlistProblems", { count: outcome.problems })}`
              : null}
          </p>
        </>
      );
    case "song":
      return (
        <p className="config__lead">
          {t("screen.intentSongAdded", { title: outcome.title })}
        </p>
      );
    case "already":
      return <p className="config__lead">{t("screen.intentAlready")}</p>;
    case "failed":
      return (
        <>
          <p className="config__lead">{t("screen.intentFailed")}</p>
          <p className="config__hint is-warn">{outcome.reason}</p>
        </>
      );
  }
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="screen__actions">{children}</div>;
}
