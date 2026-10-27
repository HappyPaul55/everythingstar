/**
 * The **playlist**: the index a jukebox lists and a band is offered from.
 *
 * A playlist file is a name and a list of songs, and a song in it is a **summary** —
 * enough to draw a row, chip it, and offer it to a band, plus the URL of the song's
 * own document. That is the whole point of the separation: 500 songs are read to
 * draw a list, and nothing heavier than the list itself is fetched until somebody
 * picks one.
 *
 * Reading is **tolerant**: a song missing its id, its title or its file is skipped
 * and named, rather than taking the other 499 down with it. Only a document that is
 * not a playlist at all comes back empty.
 *
 * A playlist may also be a **capability** rather than a catalogue: `ondemand: true`
 * says it can be asked for a song, with the query in a query-string parameter
 * (`q` by default). The answer is another playlist document, read exactly like
 * this one — see `searchUrl`.
 */

import { MAX_PARTS, DIFFICULTIES, type Difficulty } from "./track";
import { hashString } from "./hash";
import { slug } from "./text";
import {
  isSongRole,
  laneRoleOf,
  roleKind,
  seedForId,
  SONG_INSTRUMENT_ROLES,
  type Song,
  type SongInstrument,
  type SongOffer,
  type SongRole,
  type SongVideo,
} from "./song";
import {
  isObject,
  list,
  num,
  oneOf,
  resolveDocumentRef,
  schemaVersion,
  SCHEMA_VERSION,
  text,
} from "./read";

/** How a playlist is asked for a song, when it can be asked at all. */
export interface PlaylistSearch {
  /** The query-string parameter the source reads. */
  param: string;
}

export interface PlaylistRead {
  /** What the list calls itself. */
  name: string | null;
  description: string | null;
  songs: Song[];
  /**
   * How to ask this playlist for a song, or null when it is a fixed catalogue.
   * `ondemand: true` is the ordinary form; `ondemand: { "param": "search" }` names
   * a parameter other than `q`.
   */
  onDemand: PlaylistSearch | null;
  /** Anything unreadable, named, so a screen can say what it skipped. */
  problems: string[];
}

/**
 * Read a playlist document.
 *
 * `url` is the document's own absolute URL: every relative path inside it — a song's
 * document, its art — is resolved against that, so a playlist can live anywhere and
 * point at files beside it.
 *
 * `from` is the source a song belongs to, when the document is an answer rather than
 * the playlist itself: a search response is read against its **query URL** but its
 * songs still come *from* the playlist that was asked. It defaults to `url`.
 */
export function readPlaylist(body: unknown, url: string, from = url): PlaylistRead {
  const version = schemaVersion(body);
  if (!isObject(body)) {
    return {
      name: null,
      description: null,
      songs: [],
      onDemand: null,
      problems: ["not a playlist"],
    };
  }
  if (version !== SCHEMA_VERSION) {
    return {
      name: null,
      description: null,
      songs: [],
      onDemand: null,
      problems: [`playlist schemaVersion ${version ?? "missing"}, this reader is ${SCHEMA_VERSION}`],
    };
  }

  const problems: string[] = [];
  const seen = new Set<string>();
  const songs: Song[] = [];
  for (const entry of list(body.songs)) {
    const read = readEntry(entry, url, from, problems);
    if (!read) continue;
    if (seen.has(read.id)) {
      problems.push(`${read.id}: listed twice`);
      continue;
    }
    seen.add(read.id);
    songs.push(read);
  }

  return {
    name: text(body.name),
    description: text(body.description),
    songs,
    onDemand: onDemandOf(body, problems),
    problems,
  };
}

/**
 * The query parameter a document offers, or null when it is a catalogue.
 *
 * A flag that is not `true`, and an object with no usable `param`, do not make a
 * document unreadable — they leave it a catalogue, which is what it was before the
 * key was written.
 */
function onDemandOf(body: Record<string, unknown>, problems: string[]): PlaylistSearch | null {
  const value = body.ondemand ?? body.onDemand;
  if (value === true) return { param: "q" };
  if (!isObject(value)) return null;
  const param = text(value.param) ?? "q";
  if (!/^[A-Za-z0-9_.-]+$/.test(param)) {
    problems.push(`ondemand: “${param}” is not a query parameter name`);
    return { param: "q" };
  }
  return { param };
}

/** Is this document one this reader understands at all? */
export function isPlaylistBody(body: unknown): boolean {
  return isObject(body) && schemaVersion(body) === SCHEMA_VERSION;
}

/**
 * Is this body worth keeping as a playlist? A catalogue lists songs; a capability
 * may list none and still be one. A song document is neither.
 */
export function looksLikePlaylist(body: unknown): boolean {
  if (!isPlaylistBody(body)) return false;
  const doc = body as Record<string, unknown>;
  return Array.isArray(doc.songs) || onDemandOf(doc, []) !== null;
}

/**
 * The URL that asks a playlist for a song.
 *
 * Built through `URL` rather than by joining strings, so a source that already has a
 * query string (`?key=…`), a hash, or a parameter of its own keeps them, and the
 * query is encoded rather than pasted. The parameter replaces one of its own name.
 */
export function searchUrl(
  base: string,
  query: string,
  param = "q",
): string | null {
  const asked = query.trim();
  if (!asked) return null;
  try {
    const url = new URL(base);
    url.searchParams.set(param, asked);
    return url.href;
  } catch {
    return null;
  }
}

/** One entry, or null when it is missing something it cannot be a song without. */
function readEntry(entry: unknown, url: string, from: string, problems: string[]): Song | null {
  if (!isObject(entry)) {
    problems.push("a song that is not an object");
    return null;
  }
  const id = text(entry.id);
  const title = text(entry.title);
  const ref = text(entry.song);
  const named = id ?? title ?? "a song";
  if (!id || !title || !ref) {
    problems.push(`${named}: needs an id, a title and a song`);
    return null;
  }
  const doc = resolveDocumentRef(ref, url);
  if (!doc) {
    problems.push(`${id}: “${ref}” is not a URL this game will fetch`);
    return null;
  }

  const artist = readArtist(entry.artist, url, id, problems);
  if (!artist) problems.push(`${id}: no artist`);

  return {
    id,
    title,
    artist: artist ?? { id: "", name: "", art: null },
    album: readAlbum(entry.album, url, id, problems),
    art: readArt(entry.art, url, id, problems),
    accent: text(entry.accent),
    durationMs: Math.max(0, num(entry.durationMs) ?? 0),
    previewStartMs: Math.max(0, num(entry.previewStartMs) ?? 0),
    offer: readOffer(entry.offer, id, problems),
    video: readVideo(entry.video, id, problems, url),
    doc,
    from,
    revision: hashString(JSON.stringify(entry)).toString(36),
    seed: seedForId(id),
  };
}

/** An artist, written either as an object or as a bare name. */
function readArtist(
  value: unknown,
  url: string,
  id: string,
  problems: string[],
): Song["artist"] | null {
  const name = typeof value === "string" ? text(value) : isObject(value) ? text(value.name) : null;
  if (!name) return null;
  const artistId = isObject(value) ? text(value.id) : null;
  return {
    id: artistId ?? idFrom(name),
    name,
    art: isObject(value) ? readArt(value.art, url, id, problems) : null,
  };
}

function readAlbum(
  value: unknown,
  url: string,
  id: string,
  problems: string[],
): Song["album"] {
  if (!isObject(value)) return null;
  const name = text(value.name);
  if (!name) return null;
  return {
    id: text(value.id) ?? idFrom(name),
    name,
    year: num(value.year),
    art: readArt(value.art, url, id, problems),
  };
}

/** An art reference, resolved against the document that wrote it. */
function readArt(
  value: unknown,
  url: string,
  id: string,
  problems: string[],
): string | null {
  const ref = text(value);
  if (!ref) return null;
  const resolved = resolveDocumentRef(ref, url);
  if (!resolved) {
    problems.push(`${id}: “${ref}” is not an image this game will fetch`);
  }
  return resolved;
}

/** What a song has to play, by role, with the difficulties each one carries. */
function readOffer(
  value: unknown,
  id: string,
  problems: string[],
): SongOffer {
  if (!isObject(value)) {
    problems.push(`${id}: says nothing about what can be played`);
    return { instruments: [], voice: null };
  }

  const difficulties = new Map<SongRole, Set<Difficulty>>();
  for (const entry of list(value.instruments)) {
    if (!isObject(entry)) continue;
    const role = entry.role;
    if (!isSongRole(role)) {
      problems.push(`${id}: ${String(role)} is not a part`);
      continue;
    }
    const kind = roleKind(role);
    if (kind === "words") {
      problems.push(`${id}: the voice belongs in “voice”, not “instruments”`);
      continue;
    }
    const asked = list(entry.difficulties);
    const levels = asked.filter(
      (level): level is Difficulty => oneOf(level, DIFFICULTIES) !== null,
    );
    // An unknown level is a skippable field like any other: the levels that are
    // real still make the part playable, and the ones that are not are named rather
    // than dropped in silence. One problem per role, listing what could not be read.
    const rejected = asked.filter((level) => oneOf(level, DIFFICULTIES) === null);
    if (rejected.length === 1) {
      problems.push(`${id}: ${role} “${String(rejected[0])}” is not a difficulty`);
    } else if (rejected.length > 1) {
      const named = rejected.map((level) => `“${String(level)}”`).join(", ");
      problems.push(`${id}: ${role} ${named} are not difficulties`);
    }
    if (levels.length === 0) {
      problems.push(`${id}: ${role} carries no difficulties`);
      continue;
    }
    // The two guitar flavours stay separate: they are two seats with their own
    // charts, not one instrument with the levels either of them happens to carry.
    const carried = difficulties.get(role) ?? new Set<Difficulty>();
    for (const level of levels) carried.add(level);
    difficulties.set(role, carried);
  }

  const instruments: SongInstrument[] = SONG_INSTRUMENT_ROLES.flatMap((role) => {
    const carried = difficulties.get(role);
    if (!carried || carried.size === 0) return [];
    const kind = roleKind(role);
    if (kind === "words") return [];
    const lane = laneRoleOf(role);
    return [{
      kind,
      ...(lane ? { role: lane } : {}),
      difficulties: DIFFICULTIES.filter((level) => carried.has(level)),
    }];
  });

  return { instruments, voice: readVoice(value.voice, id, problems) };
}

function readVoice(value: unknown, id: string, problems: string[]): SongOffer["voice"] {
  if (value === undefined || value === null) return null;
  if (!isObject(value)) {
    problems.push(`${id}: the voice is not an object`);
    return null;
  }
  const chartType = oneOf(value.chartType, ["vocals", "lyrics"] as const);
  if (!chartType) {
    problems.push(`${id}: the voice is neither vocals nor lyrics`);
    return null;
  }
  const parts = Math.max(1, Math.min(MAX_PARTS, Math.trunc(num(value.parts) ?? 1)));
  return { chartType, parts };
}

function readVideo(
  value: unknown,
  id: string,
  problems: string[],
  url: string,
): SongVideo | null {
  if (value === undefined || value === null) return null;
  if (!isObject(value)) {
    problems.push(`${id}: the video is not an object`);
    return null;
  }
  const youtube = text(value.id);
  const ref = text(value.url);
  if (value.kind === "youtube" && youtube) return { kind: "youtube", id: youtube };
  if (value.kind === "video" && ref) {
    // A direct video is resolved against the playlist that wrote it, exactly as its
    // art is: a clip kept beside the playlist must not be looked for on the game's
    // own origin.
    const resolved = resolveDocumentRef(ref, url);
    if (resolved) return { kind: "video", url: resolved };
    problems.push(`${id}: “${ref}” is not a URL this game will fetch`);
    return null;
  }
  problems.push(`${id}: a video needs a kind and its source`);
  return null;
}

/** An id from a name, for a playlist that names an artist without one. */
function idFrom(name: string): string {
  return slug(name);
}

/**
 * One library from several playlists: in the order they were read, each song once.
 *
 * Ids are the library's key — the URL's `#songs/<id>`, the score board's — so the
 * same id in two playlists is one song, and the **first** playlist that lists it
 * wins. Two playlists carrying different audio of the same id is the author's
 * problem, and the duplicates are reported rather than silently merged.
 */
export function mergeSongs(lists: readonly Song[][]): {
  songs: Song[];
  duplicates: string[];
} {
  const songs: Song[] = [];
  const duplicates: string[] = [];
  const seen = new Set<string>();
  for (const list_ of lists) {
    for (const song of list_) {
      if (seen.has(song.id)) {
        duplicates.push(song.id);
        continue;
      }
      seen.add(song.id);
      songs.push(song);
    }
  }
  return { songs, duplicates };
}
