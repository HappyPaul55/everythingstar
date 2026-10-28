/**
 * A finished run as a **poster**: the numbers, the song and the stars, drawn as a
 * 1200×630 SVG that can be downloaded, shared or posted anywhere.
 *
 * It is deliberately a **poster rather than a cover**. A song's art is somebody
 * else's file at somebody else's URL, and a canvas that reads it would need CORS on
 * a host the game does not control, so the card carries no picture at all. What it
 * carries is what the run made: the song, the band's score, the stars, the accuracy,
 * the best combo, how many were on stage and when it happened.
 *
 * Everything here is **pure**, and the same card always produces the same SVG: a
 * date is formatted in UTC because a poster shared from two time zones is one
 * poster, and no value is read from the browser.
 *
 * Every value that goes into the document is XML-escaped, because a song title is
 * somebody else's text and `<`, `&`, `"` or `'` in it must be a character in a
 * title rather than the end of an attribute.
 */

import { formatScore } from "./scoring";

/** The poster's own size, the one every place a link is previewed expects. */
export const BRAG_WIDTH = 1200;
export const BRAG_HEIGHT = 630;

/**
 * The name a card signs itself with.
 *
 * The game island has no site settings (the pages do), and a poster is not the place
 * to thread one through five entries: this is the game's own name, in the module
 * that draws it.
 */
export const BRAG_GAME = "EverythingStar";

const INK = "#0c0d0a";
const PAPER = "#fafaf4";
const YELLOW = "#ffd400";

/** What the card says, and nothing about where it came from. */
export interface BragCard {
  /** The game's name, as the card signs itself. */
  game: string;
  title: string;
  artist: string;
  score: number;
  /** 0 when the run has no rating, otherwise 1..5. */
  stars: number;
  /** The run that hit everything the part has: the same five stars, in gold. */
  gold: boolean;
  /** What share of what was judged landed, as a whole percentage. */
  accuracy: number;
  bestCombo: number;
  /** How many players were on stage. */
  players: number;
  /** When the run was played, in ms since the epoch. */
  at: number;
  /** The song's own colour, for one restrained mark. */
  accent?: string | null;
}

export interface BragCardOptions {
  /**
   * A self-contained `@font-face` block for the card's two faces — a display face
   * and a mono one — with its files inlined as data URLs.
   *
   * Absent is not a broken card: every text element names a system stack after the
   * embedded family, so an SVG with no fonts is still a poster rather than a
   * document full of invisible words.
   */
  fontCss?: string;
}

/** The two families a card asks for, whatever the block actually declares. */
const DISPLAY_STACK =
  '"ES Display", "Permanent Marker", Impact, "Arial Black", system-ui, sans-serif';
const MONO_STACK =
  '"ES Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';

/**
 * XML-escape a value for text content **and** an attribute.
 *
 * Both quote kinds are escaped, so the same function is safe inside `"…"` and
 * `'…'`; the order matters — `&` first, or the entities that follow would be
 * escaped twice.
 */
export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * The song's accent for the card's one mark, held to a colour and nothing else.
 *
 * A playlist's `accent` is somebody else's string: anything that is not a hex
 * colour is not a mark, and the card falls back to the brand's yellow rather than
 * writing an arbitrary value into an attribute.
 */
export function accentColour(accent: string | null | undefined): string {
  return typeof accent === "string" && /^#[0-9a-f]{3,8}$/i.test(accent)
    ? accent
    : YELLOW;
}

/**
 * A title as the lines the poster draws: words wrapped to `maxChars`, at most
 * `maxLines`, and a last line that says it was cut rather than ending mid-word.
 *
 * A single very long word is split by characters, because a title is not required
 * to have a space in it and a word wider than the poster is the one case wrapping
 * cannot solve on its own.
 */
export function titleLines(
  title: string,
  maxChars = 22,
  maxLines = 2,
): string[] {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  const push = () => {
    if (line) lines.push(line);
    line = "";
  };
  for (const word of words) {
    let rest = word;
    while (rest.length > maxChars) {
      // A word longer than a line: fill the current line, then break it.
      if (line) push();
      lines.push(`${rest.slice(0, maxChars - 1)}…`);
      rest = rest.slice(maxChars - 1);
      if (lines.length >= maxLines) return lines.slice(0, maxLines);
    }
    const next = line ? `${line} ${rest}` : rest;
    if (next.length <= maxChars) {
      line = next;
      continue;
    }
    push();
    line = rest;
  }
  push();
  if (lines.length === 0) return ["?"];
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  // Cut at a word rather than in the middle of one; a title with no space in
  // reach is cut where it has to be.
  const cut = kept[maxLines - 1].slice(0, maxChars - 1).trimEnd();
  const space = cut.lastIndexOf(" ");
  kept[maxLines - 1] = `${space > 6 ? cut.slice(0, space) : cut}…`;
  return kept;
}

/** A number held to two decimals, so a star's points are the same every time. */
function fixed(value: number): string {
  return (Math.round(value * 100) / 100).toString();
}

/** A five-pointed star as a polygon's points, deterministic to two decimals. */
export function starPoints(cx: number, cy: number, radius: number): string {
  const points: string[] = [];
  for (let index = 0; index < 10; index += 1) {
    const r = index % 2 === 0 ? radius : radius * 0.42;
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    points.push(
      `${fixed(cx + r * Math.cos(angle))},${fixed(cy + r * Math.sin(angle))}`,
    );
  }
  return points.join(" ");
}

/** The run's date as the card writes it, in UTC so the card is one card. */
function dateLabel(at: number): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** What a card says, as text: the Copy fallback and the share's own words. */
export function bragText(card: BragCard): string {
  const stars =
    card.stars <= 0
      ? "no rating"
      : card.gold
        ? "gold stars"
        : `${card.stars} of 5 stars`;
  const players = card.players === 1 ? "1 player" : `${card.players} players`;
  return [
    `${card.title} — ${card.artist}`,
    `${formatScore(card.score)} points · ${stars} · ${card.accuracy}% accuracy · ×${card.bestCombo} best combo · ${players}`,
    `${card.game} · ${dateLabel(card.at)}`,
  ].join("\n");
}

/**
 * Base64 for a font file, so a card can carry its own typography.
 *
 * It is chunked rather than one `String.fromCharCode(...bytes)`: a latin font is
 * tens of kilobytes, and spreading them all into one call blows the argument
 * limit in every engine.
 */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let at = 0; at < bytes.length; at += chunk) {
    binary += String.fromCharCode(...bytes.subarray(at, at + chunk));
  }
  return btoa(binary);
}

/** A `@font-face` block for whatever font files the caller managed to read. */
export function fontCss(fonts: {
  display?: string;
  mono?: string;
  monoBold?: string;
}): string {
  const faces: string[] = [];
  const face = (family: string, data: string | undefined, weight: number) => {
    if (!data) return;
    faces.push(
      `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};src:url(data:font/woff2;base64,${data}) format("woff2");}`,
    );
  };
  face("ES Display", fonts.display, 400);
  face("ES Mono", fonts.mono, 400);
  face("ES Mono", fonts.monoBold ?? fonts.mono, 700);
  return faces.join("");
}

/**
 * The card: a complete, standalone SVG document.
 *
 * The layout is fixed rather than measured — a poster has one size and one place
 * for each thing — and the stylesheet names a system stack after the embedded
 * family so the same document reads with no fonts at all.
 */
export function bragSvg(card: BragCard, options: BragCardOptions = {}): string {
  const accent = accentColour(card.accent);
  const lines = titleLines(card.title);
  const date = dateLabel(card.at);
  const stars = Math.max(0, Math.min(5, Math.round(card.stars)));
  const score = formatScore(card.score);
  const accuracy = `${Math.round(card.accuracy)}%`;
  const combo = `×${Math.round(card.bestCombo)}`;
  const players = `${Math.max(0, Math.round(card.players))}`;
  const rated =
    stars === 0
      ? "NO RATING"
      : card.gold
        ? "GOLD · EVERY NOTE"
        : `${stars} / 5 STARS`;

  // The title's own block: one line gets the bigger face, two make room for the
  // second. The artist sits under whichever there is.
  const titleSize = lines.length > 1 ? 58 : 72;
  const titleStep = lines.length > 1 ? 66 : 78;
  const titleTop = lines.length > 1 ? 196 : 218;
  const artistY = titleTop + titleStep * (lines.length - 1) + 40;

  const titleParts = lines.map(
    (line, index) =>
      `<text class="display" x="72" y="${fixed(titleTop + index * titleStep)}" font-size="${titleSize}" fill="${PAPER}">${xmlEscape(line)}</text>`,
  );

  // Five stars, lit to the rating and dim beyond it. Gold is the same five lit in
  // the brand's yellow rather than a sixth star.
  const starParts: string[] = [];
  for (let index = 0; index < 5; index += 1) {
    const cx = 100 + index * 68;
    const on = index < stars;
    const fill = on ? (card.gold ? YELLOW : PAPER) : "none";
    const stroke = on ? (card.gold ? YELLOW : PAPER) : "rgba(250,250,244,0.28)";
    starParts.push(
      `<polygon points="${starPoints(cx, 384, 27)}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`,
    );
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BRAG_WIDTH}" height="${BRAG_HEIGHT}" viewBox="0 0 ${BRAG_WIDTH} ${BRAG_HEIGHT}" role="img">`,
    `<title>${xmlEscape(card.title)} — ${xmlEscape(card.artist)}</title>`,
    `<desc>${xmlEscape(bragText(card))}</desc>`,
    `<style>${options.fontCss ?? ""}` +
      `text{font-kerning:normal}.display{font-family:${DISPLAY_STACK}}` +
      `.mono{font-family:${MONO_STACK}}.label{font-family:${MONO_STACK};font-weight:700;letter-spacing:3px}` +
      `</style>`,
    `<rect width="${BRAG_WIDTH}" height="${BRAG_HEIGHT}" fill="${INK}"/>`,
    // The room: one huge star outline, quiet enough to read as paper stock rather
    // than as a second rating.
    `<polygon points="${starPoints(1044, 344, 262)}" fill="none" stroke="${PAPER}" stroke-opacity="0.05" stroke-width="3"/>`,
    // The header, and the song's one restrained mark beside the game's name.
    `<rect x="72" y="46" width="12" height="48" rx="6" fill="${accent}"/>`,
    `<text class="display" x="100" y="84" font-size="38" fill="${PAPER}">${xmlEscape(card.game)}</text>`,
    `<text class="label" x="1128" y="78" font-size="17" fill="${YELLOW}" text-anchor="end">SCORE CARD</text>`,
    `<line x1="72" y1="118" x2="1128" y2="118" stroke="${PAPER}" stroke-opacity="0.16" stroke-width="2"/>`,
    ...titleParts,
    `<text class="mono" x="72" y="${fixed(artistY)}" font-size="24" fill="${PAPER}" fill-opacity="0.72">${xmlEscape(card.artist)}</text>`,
    // The rating, and the band's score as the number the poster is about.
    ...starParts,
    `<text class="label" x="72" y="436" font-size="16" fill="${PAPER}" fill-opacity="0.62">${rated}</text>`,
    `<text class="mono" x="1128" y="412" font-size="96" font-weight="700" fill="${YELLOW}" text-anchor="end">${xmlEscape(score)}</text>`,
    `<text class="label" x="1128" y="444" font-size="15" fill="${PAPER}" fill-opacity="0.6" text-anchor="end">BAND SCORE</text>`,
    // The reads under the rule: how, how far and how many.
    `<line x1="72" y1="482" x2="1128" y2="482" stroke="${PAPER}" stroke-opacity="0.12" stroke-width="2"/>`,
    `<text class="label" x="72" y="516" font-size="14" fill="${PAPER}" fill-opacity="0.55">ACCURACY</text>`,
    `<text class="mono" x="72" y="552" font-size="30" font-weight="700" fill="${PAPER}">${xmlEscape(accuracy)}</text>`,
    `<text class="label" x="332" y="516" font-size="14" fill="${PAPER}" fill-opacity="0.55">BEST COMBO</text>`,
    `<text class="mono" x="332" y="552" font-size="30" font-weight="700" fill="${PAPER}">${xmlEscape(combo)}</text>`,
    `<text class="label" x="592" y="516" font-size="14" fill="${PAPER}" fill-opacity="0.55">ON STAGE</text>`,
    `<text class="mono" x="592" y="552" font-size="30" font-weight="700" fill="${PAPER}">${xmlEscape(players)}</text>`,
    `<text class="mono" x="1128" y="552" font-size="18" fill="${PAPER}" fill-opacity="0.7" text-anchor="end">${xmlEscape(date)}</text>`,
    `</svg>`,
  ].join("\n");
}
