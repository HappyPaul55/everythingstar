import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../../../i18n/react";
import {
  BRAG_GAME,
  BRAG_HEIGHT,
  BRAG_WIDTH,
  bragSvg,
  bragText,
  fontCss,
  toBase64,
  type BragCard,
} from "../../../lib/game/bragCard";
import { slug } from "../../../lib/game/text";
import { NativeDialog } from "../ui/NativeDialog";

/**
 * The brag card, over the results: a preview of the poster, and the three ways to
 * take it — download, share, or copy the words.
 *
 * It is **lazy**, because it is opened by one press: the card's SVG builder and the
 * fonts it embeds are not part of a run. The preview is an `<img>` over an object
 * URL, never `dangerouslySetInnerHTML`: the SVG is a document of somebody else's
 * song title, and an image element treats it as a picture rather than as markup with
 * a script's rights.
 *
 * The fonts are the game's own files, inlined as data URLs so the downloaded card
 * looks like the game wherever it is opened. A failed fetch is not a failure: the
 * SVG names a system stack after each family, so the card still reads.
 */

/** The three files the card inlines, in the order `fontCss` uses them. */
const FONT_URLS = {
  display: "/fonts/permanent-marker-latin.woff2",
  mono: "/fonts/space-mono-latin-400.woff2",
  monoBold: "/fonts/space-mono-latin-700.woff2",
} as const;

type BragFonts = { display?: string; mono?: string; monoBold?: string };

async function readFont(url: string): Promise<string | undefined> {
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    return toBase64(new Uint8Array(await response.arrayBuffer()));
  } catch {
    // A card with a system stack is a card; a font is not worth failing on.
    return undefined;
  }
}

interface Props {
  /** The run's own facts; the card signs the game's name itself. */
  run: BragRun;
  onClose: () => void;
}

/**
 * What the results screen hands over: the run, without the game's name.
 *
 * It is deliberately plain data rather than a `BragCard`, so the screen that opens
 * this dialog does not import the SVG builder — the whole module stays in the lazy
 * chunk this component lives in.
 */
export type BragRun = Omit<BragCard, "game">;

export function BragCardDialog({ run, onClose }: Props) {
  const t = useT();
  const card = useMemo<BragCard>(() => ({ ...run, game: BRAG_GAME }), [run]);
  const [fonts, setFonts] = useState<BragFonts | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [shareable, setShareable] = useState(false);
  /** Object URLs a download made, so a card closed mid-save still revokes them. */
  const pending = useRef<Set<string>>(new Set());

  const filename = `everythingstar-brag-${slug(card.title) || "run"}.svg`;

  // The card is built without fonts at first and rebuilt when they arrive, so the
  // preview is up at once rather than waiting on three files.
  const svg = useMemo(
    () => bragSvg(card, fonts ? { fontCss: fontCss(fonts) } : undefined),
    [card, fonts],
  );

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [display, mono, monoBold] = await Promise.all([
        readFont(FONT_URLS.display),
        readFont(FONT_URLS.mono),
        readFont(FONT_URLS.monoBold),
      ]);
      if (!alive) return;
      if (display || mono || monoBold) setFonts({ display, mono, monoBold });
    })();
    return () => {
      alive = false;
    };
  }, []);

  // One object URL per rendered card, revoked as soon as the next one replaces it.
  useEffect(() => {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [svg]);

  // The share sheet is asked about a file before the button exists: a browser with
  // `share` but no file sharing (most desktop ones) gets Download and Copy only.
  useEffect(() => {
    try {
      setShareable(
        typeof navigator.canShare === "function" &&
          navigator.canShare({
            files: [new File([""], "card.svg", { type: "image/svg+xml" })],
          }),
      );
    } catch {
      setShareable(false);
    }
  }, []);

  // Revoke anything a download left behind when the dialog goes.
  useEffect(() => {
    const urls = pending.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  const download = () => {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    pending.current.add(url);
    // A revoke in the same tick can cancel the save in some browsers; a second is
    // longer than any of them needs and the URL is still revoked.
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
      pending.current.delete(url);
    }, 1000);
  };

  const share = async () => {
    const file = new File([svg], filename, { type: "image/svg+xml" });
    if (
      typeof navigator.canShare !== "function" ||
      !navigator.canShare({ files: [file] })
    ) {
      return;
    }
    try {
      await navigator.share({ files: [file], title: card.title, text: bragText(card) });
      setNote(t("brag.shared"));
    } catch {
      // Backing out of the share sheet is a decision, not an error.
    }
  };

  const copy = async () => {
    const text = bragText(card);
    try {
      await navigator.clipboard.writeText(text);
      setNote(t("brag.copied"));
    } catch {
      // Clipboard permission is the browser's; the preview is still there to save.
      setNote(t("brag.copyFailed"));
    }
  };

  return (
    <NativeDialog
      title={t("brag.title")}
      onClose={onClose}
      panelClassName="brag-panel"
      initialFocus="[data-dialog-focus]"
    >
      <p className="config__lead">{t("brag.title")}</p>
      <p className="config__hint">{t("brag.lede")}</p>

      <div className="brag-preview">
        {preview ? (
          <img
            className="brag-preview__image"
            src={preview}
            alt={t("brag.previewAlt", { title: card.title })}
            width={BRAG_WIDTH}
            height={BRAG_HEIGHT}
            draggable={false}
          />
        ) : null}
      </div>

      <div className="config__actions brag-actions">
        <button
          type="button"
          className="band-btn band-btn--primary"
          data-sound="select"
          data-dialog-focus="true"
          onClick={download}
        >
          {t("brag.download")}
        </button>
        {shareable ? (
          <button
            type="button"
            className="band-btn"
            data-sound="select"
            onClick={() => void share()}
          >
            {t("brag.share")}
          </button>
        ) : null}
        <button
          type="button"
          className="band-btn"
          data-sound="select"
          onClick={() => void copy()}
        >
          {t("brag.copy")}
        </button>
      </div>

      <p className="config__hint" role="status" aria-live="polite">
        {note}
      </p>
    </NativeDialog>
  );
}
