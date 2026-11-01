/**
 * The mixer: one audio graph for the whole game.
 *
 * Three channels — music, ambience, sound effects — under one master, which is what
 * lets a sting duck the music, a bed sit under the note feedback, and a player turn
 * the whole thing down. The graph is built **lazily**, on the first gesture: a browser
 * will not let anything make a sound before one, and pretending otherwise is how a
 * game ends up silent with no error to show for it.
 *
 * ## Beds stream; one-shots are decoded
 *
 * A four-minute loop decoded to a buffer is ~90MB of float samples, and a bank of
 * `background` beds would be most of a gigabyte — for something that plays front to
 * back and repeats. So **a bed is an `<audio>` element**: the browser streams it and
 * loops it, and the mixer only owns its gain. A **one-shot** is the other way round:
 * a click or a sting is milliseconds of audio that wants to start *now*, so it is
 * fetched once, decoded, and kept.
 *
 * Nothing in here throws into the game. A file that will not load, a gesture the
 * browser refuses, a decode that fails: all of them are silence, which is where the
 * game was before any of this existed.
 *
 * The decisions — which channel a type plays on, whether a screen wants a bed — are
 * in `mix.ts`, pure and tested.
 */

import {
  CHANNEL_LEVEL,
  DUCK_LEVEL,
  channelOf,
  ducksMusic,
  soundGain,
  type Channel,
  type ChannelLevels,
} from "../../../lib/game/audio/mix";
import { createPicker, soundsToWarm, type Sound } from "../../../lib/game/audio/sounds";
import { clamp01 } from "../../../lib/game/math";

/** How long a bed takes to come in, and to go out. */
const FADE_S = 0.6;

/**
 * The duck under a sting: how far the music and the room fall, how quickly, how
 * long they are held there, and how long they take to come back.
 *
 * The hold is the cue's own length when the decoded buffer knows it, with a short
 * floor for a buffer that cannot say; a file that never decodes has no cue to duck
 * under, because there is nothing to hear.
 */
const DUCK_ATTACK_S = 0.06;
const DUCK_RELEASE_S = 0.4;
const DUCK_MIN_S = 0.25;

/**
 * How long the welcome waits for the sound before letting the player in anyway.
 * The cues are small and local; this is a network that has stopped, not a game that
 * will not start.
 */
const PREPARE_TIMEOUT_MS = 5000;

const CHANNELS: Channel[] = ["music", "ambience", "sfx"];

/** How one cue is pitched and placed. */
export interface PlayOptions {
  /** Playback rate; `1` is the record. */
  rate?: number;
  /** -1 (left) .. +1 (right). A centre cue needs no panner at all. */
  pan?: number;
}

/** A cue in a group: what to play, and how. */
export interface PlayCue extends PlayOptions {
  type: string;
}

export interface Engine {
  /** The gesture a browser wants before anything may make a sound. */
  start: () => Promise<void>;
  /** The bank to pick from: the manifest's sounds, as they arrive. */
  load: (sounds: readonly Sound[]) => void;
  /**
   * Warm what the game is about to need: the cues decoded and the bed the pages
   * open on downloaded, so the first press is heard when it happens rather than a
   * fetch later. Builds the graph **suspended** — it still makes no sound until
   * `start()` — and never rejects. Safe to call again when the bank changes.
   */
  prepare: () => Promise<void>;
  /** A one-shot of a type, through the picker. `rate` pitches it and `pan` places
   *  it. */
  play: (type: string, options?: PlayOptions) => void;
  /**
   * A group of one-shots that belong to the same moment — a band's entrance, one
   * cue per part. Every file is picked and decoded first, then all of them start on
   * one `AudioContext` time so the layers are sample-aligned. A group that needs a
   * duck dips the music and the room **once**, for its longest ducking cue, rather
   * than restarting the envelope for every file.
   */
  playMany: (cues: readonly PlayCue[]) => void;
  /**
   * The **music** bed: a type to play, or null to stop. Asking for what is already
   * playing does nothing — a screen change must not restart a track — and a bank of
   * **tracks** runs on by itself, the next one when the last finishes.
   */
  bed: (type: string | null) => Promise<void>;
  /**
   * The **ambience** bed, which runs independently of the music: the room's murmur
   * while the run is paused. It comes and goes on its own channel, so a menu bed or a
   * jukebox preview can never take the room with it. A looped bank loops; asking for
   * the same bed again does nothing.
   */
  ambience: (type: string | null) => Promise<void>;
  /**
   * A song's **jukebox preview**: a streamed file that takes the music channel over
   * from the bed while it plays, then hands it back. Null stops it.
   */
  preview: (track: PreviewSource | null) => void;
  volume: (level: number) => void;
  /**
   * The family levels under the master: music, ambience and sound effects. The
   * settings own them, and the master stays the fader above all three.
   */
  setLevels: (levels: ChannelLevels) => void;
  /**
   * Tear the graph down: the preview and every bed stopped, the banks and channels
   * let go, the context closed. Called when the island unmounts — never on a screen
   * change — and safe to call twice.
   */
  dispose: () => void;
}

/** What a jukebox preview plays, and where in the file it starts. */
export interface PreviewSource {
  url: string;
  startMs?: number;
}

/** A bed that is sounding: the file, its type and the element that holds it. */
interface PlayingBed {
  id: string;
  type: string;
  element: HTMLAudioElement;
}

/**
 * One channel's bed: what a screen has asked for, what is sounding, and the change
 * in flight. Two of these make the room and the music independent.
 */
interface BedSlot {
  wanted: string | null;
  playing: PlayingBed | null;
  changing: { type: string | null; promise: Promise<void> } | null;
  /** Bumped per transition, so a fade that lands late cannot revive an old bed. */
  token: number;
}

function bedSlot(): BedSlot {
  return { wanted: null, playing: null, changing: null, token: 0 };
}

/**
 * @param onBed Told the file that is playing whenever it changes — including when a
 *   track finishes and the next one starts, which the caller cannot otherwise see.
 */
export function createEngine(onBed?: (id: string | null) => void): Engine {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  const channels = new Map<Channel, GainNode>();
  /**
   * Decoded one-shots, by sound id — **successes only**, because a fetch that failed
   * once is not a file that will never decode: a transient 5xx or an abort during
   * `prepare` must not silence that cue for the whole visit.
   */
  const decoded = new Map<string, AudioBuffer>();
  /** The decodes in flight, so a burst asks for one fetch rather than one each. */
  const decoding = new Map<string, Promise<AudioBuffer | null>>();
  /** Bed elements, by sound id: one element per file, its source made once. */
  const elements = new Map<string, HTMLAudioElement>();
  let picker = createPicker([]);
  /** The manifest as it last arrived: what `prepare` warms. */
  let bank: readonly Sound[] = [];
  /**
   * The browser has been given its gesture. The context can exist before one — the
   * welcome builds it so the cues can be decoded — but a suspended context must not
   * have cues scheduled into it: they would all arrive at once when it resumes.
   */
  let unlocked = false;
  /**
   * One bed per channel. The music bed is the menu's playlist; the ambience bed is
   * the room under a song. They are separate in every way that matters — what was
   * asked for, what is playing, the transition in flight and the token that lets a
   * late fade be forgotten — so stopping one cannot touch the other.
   */
  const musicBed = bedSlot();
  const ambienceBed = bedSlot();
  /**
   * The jukebox preview's **one** element and its **one** graph source. Clicking
   * through a few hundred rows is a few hundred previews, and a new element and node
   * per preview is a few hundred nodes the graph can never let go of — so they are
   * made once, on the first preview, and only the `src` changes after that.
   */
  let previewElement: HTMLAudioElement | null = null;
  let previewNode: MediaElementAudioSourceNode | null = null;
  /** The preview that owns the element, and the token that says which one it is. */
  let previewing: { token: number; startS: number } | null = null;
  /** Bumped per preview, so a late `play()` or `loadedmetadata` cannot touch a newer one. */
  let previewToken = 0;
  /** A preview asked for before the browser had been given a gesture. */
  let wantedPreview: PreviewSource | null = null;
  let level = 1;
  /** The family levels under the master, as the settings last said. */
  let levels: ChannelLevels = { ...CHANNEL_LEVEL };
  let starting: Promise<void> | null = null;
  /** Torn down: the island is gone, so nothing here may touch the graph again. */
  let disposed = false;

  function build(): AudioContext {
    const made = new AudioContext();
    master = made.createGain();
    master.gain.value = level;
    master.connect(made.destination);
    for (const name of CHANNELS) {
      const gain = made.createGain();
      gain.gain.value = levels[name];
      gain.connect(master);
      channels.set(name, gain);
    }
    // A running context can be suspended underneath us — an iOS call, the
    // operating system taking the output — and every sting scheduled into it would
    // sit there and arrive together when it woke. The browser's own state change is
    // the cue to ask for it back; `playMany` refuses to schedule while it is away,
    // so a pile-up cannot build in the meantime.
    made.onstatechange = () => {
      if (disposed || !unlocked || made.state !== "suspended") return;
      void made.resume().catch(() => undefined);
    };
    return made;
  }

  /**
   * Warm the files the next few presses will ask for.
   *
   * The graph is built here, **suspended**: a browser will not let it run before a
   * gesture, but it will let it decode. That is the whole trick — the cues are in
   * memory before the press that unlocks them, so the first click is a click rather
   * than a download. The bed is an element: setting it going downloads it, and it is
   * asked to play on the gesture like any other.
   *
   * What to warm is `soundsToWarm` (pure, tested); this only does the work. A file
   * that will not arrive is not an error — the wait is capped, and the game opens.
   */
  async function prepare(): Promise<void> {
    if (disposed) return;
    // A browser with no Web Audio is a silent game, not a welcome that never opens.
    try {
      context ??= build();
    } catch {
      return;
    }
    const work: Promise<unknown>[] = soundsToWarm(bank).map((sound) =>
      sound.kind === "oneshot" ? bufferFor(sound) : warmBed(sound),
    );
    if (work.length === 0) return;
    try {
      await Promise.race([
        Promise.all(work),
        new Promise((resolve) => window.setTimeout(resolve, PREPARE_TIMEOUT_MS)),
      ]);
    } catch {
      // The parts catch their own failures; this is the last line of defence.
    }
  }

  /** Start a bed's download, and answer when it can play without a wait. */
  function warmBed(sound: Sound): Promise<void> {
    const element = elementFor(sound);
    if (!element) return Promise.resolve();
    // A bed that is already sounding is not a bed to warm: `src` has already asked
    // the browser for it, and `load()` here would begin it again at the top — the
    // menu music restarting because a manifest arrived.
    if (!element.paused) return Promise.resolve();
    // HAVE_FUTURE_DATA: enough is buffered to start and keep going.
    if (element.readyState >= 3) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        element.removeEventListener("canplay", done);
        element.removeEventListener("error", done);
        resolve();
      };
      element.addEventListener("canplay", done);
      element.addEventListener("error", done);
    });
  }

  /**
   * The bed: out with the old, in with the new — unless the new *is* the old, which
   * is what a screen change looks like. A track's bank runs on by itself.
   *
   * The welcome's press and the screen change it causes arrive together: `start()`
   * asks for the bed for the first time while the menu is asking for the same one.
   * Without the in-flight marker both would pick from the bank — two files, two
   * tracks, and the opening piece skipped — so the second request waits on the first
   * rather than starting a second.
   */
  function bed(type: string | null): Promise<void> {
    // A screen that asks for a bed ends any preview: the bed is what the page wants,
    // and a preview in front of it would be music from the wrong place. It is the
    // **music** channel's guest, so the room under the stage carries on. Null is the
    // music bed's to stop, because that is the one a screen asked for.
    return requestBed(type, musicBed);
  }

  /** The room's own bed, on its own channel and with its own state. */
  function ambience(type: string | null): Promise<void> {
    return requestBed(type, ambienceBed);
  }

  /**
   * One request, on the **channel the type names**: the slot is chosen by
   * `channelOf`, and the fallback decides only where a null stops. Endpoints are how
   * a caller says which bed it means when it says null; they are not a way to send a
   * type to the wrong channel.
   */
  function requestBed(type: string | null, fallback: BedSlot): Promise<void> {
    if (disposed) return Promise.resolve();
    const slot =
      type === null ? fallback : channelOf(type) === "ambience" ? ambienceBed : musicBed;
    // A music bed and a jukebox preview are one channel's guests; the room's bed is
    // nobody's rival and must survive both.
    if (slot === musicBed) stopPreview(false);
    slot.wanted = type;
    if (!context) return Promise.resolve();
    if (type !== null && slot.playing?.type === type) return Promise.resolve();
    if (slot.changing && slot.changing.type === type) return slot.changing.promise;

    const work = changeBed(slot, type);
    slot.changing = { type, promise: work };
    void work.finally(() => {
      if (slot.changing?.promise === work) slot.changing = null;
    });
    return work;
  }

  async function changeBed(slot: BedSlot, type: string | null): Promise<void> {
    if (!context || channels.size === 0) return;
    const mine = ++slot.token;

    // Only an outgoing bed is faded out, and it is faded on **its own channel**:
    // the crowd is ambience, so a music bed arriving or leaving must not move it,
    // and vice versa. With nothing playing there is nothing to take away, and a
    // half-second of silence before the first piece would be the welcome's press
    // *causing* a delay rather than ending one.
    if (slot.playing) {
      const out = channels.get(channelOf(slot.playing.type));
      if (out) await fade(out, 0);
      if (mine !== slot.token) return;
      slot.playing.element.pause();
      slot.playing = null;
      if (slot === musicBed) onBed?.(null);
    }
    if (!type) return;

    const sound = picker.next(type);
    if (!sound) return;
    const element = elementFor(sound);
    if (!element) return;
    try {
      await element.play();
    } catch {
      // A refusal is not an error: it is a browser that has not been given a
      // gesture yet, and the bed that was asked for is remembered.
      return;
    }
    if (mine !== slot.token) {
      element.pause();
      return;
    }
    slot.playing = { id: sound.id, type, element };
    if (slot === musicBed) onBed?.(sound.id);
    // The type's own channel decides the fade, not the slot's name: a bed is a
    // family like any other, and that is what keeps the ducking and the per-family
    // levels working.
    const channel = channelOf(type);
    const target = channels.get(channel);
    if (target) void fade(target, levels[channel]);
  }

  /**
   * Stop the preview, and put the bed back when there was one to stop.
   *
   * `restore` is false when something else is about to take the channel — another
   * preview, or a bed — because handing it back only to take it away is a gap heard.
   */
  function stopPreview(restore: boolean): boolean {
    const current = previewing;
    if (!current) return false;
    previewing = null;
    // Whatever was in flight for this preview is stale from here.
    previewToken += 1;
    if (previewElement) {
      previewElement.pause();
      previewElement.removeAttribute("src");
      previewElement.load();
    }
    if (restore && musicBed.wanted && context) void bed(musicBed.wanted);
    return true;
  }

  /**
   * The preview's element and its route into the graph, made on first use and kept
   * for the life of the engine.
   *
   * Both handlers are attached here, once: they read the **current** preview rather
   * than closing over the file that was playing when they were added, and the
   * `ended`/`error` flags are the file's own — a new `src` clears them, so a late
   * event from the previous file is not mistaken for the new one's.
   */
  function previewElementFor(): HTMLAudioElement | null {
    if (!context) return null;
    if (previewElement) return previewElement;
    const music = channels.get("music");
    if (!music) return null;
    const element = new Audio();
    // Before `src`: a request that starts first is a request without CORS, and a
    // cross-origin preview then comes back silent through the graph.
    element.crossOrigin = "anonymous";
    element.preload = "auto";
    try {
      const node = context.createMediaElementSource(element);
      node.connect(music);
      previewNode = node;
    } catch {
      return null;
    }
    element.addEventListener("ended", () => {
      const current = previewing;
      // An ended event that has outlived its file: the element has already moved on.
      if (!current || !element.ended) return;
      // The loop is the file's own cue, not the top of the file.
      if (current.startS > 0) {
        try {
          element.currentTime = current.startS;
        } catch {
          // The cue is outside the file; let it repeat from the top.
        }
      }
      void element.play().catch(() => {
        if (previewing?.token === current.token) stopPreview(true);
      });
    });
    element.addEventListener("error", () => {
      // A new source clears the error, so this cannot be the previous file's.
      if (previewing && element.error) stopPreview(true);
    });
    previewElement = element;
    return element;
  }

  /**
   * A song's preview: the music channel's guest, not its owner.
   *
   * The bed gives way while it plays, and comes back when the jukebox is left or
   * another screen asks for a bed (`bed` calls `stopPreview`). The clip is
   * **streamed through a media element**, like a bed, and routed into the music
   * channel, so the master fader and the channel level apply to it exactly as they
   * do to the menu music. Nothing here decodes a four-minute file into memory.
   *
   * A preview **repeats until it is replaced or the jukebox is left**. A master
   * fallback returns to the same `previewStartMs` cue rather than the start of the
   * file, so the loop is the same part of the song each time.
   *
   * One element serves every preview — see `previewElementFor` — so a new file is
   * named on a clean element: the old one is paused, its source dropped, and the new
   * URL set before the metadata is waited for.
   */
  function preview(track: PreviewSource | null): void {
    if (disposed) return;
    wantedPreview = track;
    if (!track) {
      const had = stopPreview(false);
      if (had) void bed(musicBed.wanted);
      return;
    }
    // A preview is an ordinary media element, but it is routed through the graph:
    // before the gesture it would download and quietly run on, so it waits like
    // every other sound and starts with `start()`.
    if (!unlocked || !context) return;
    const music = channels.get("music");
    if (!music) return;
    // A bed transition halfway through a fade is not allowed to land on top of a
    // preview: the token invalidates it, and the channel is put back to its level
    // in case the preview caught the fade on its way down. Only the music's token:
    // the preview is the music channel's guest, not the room's.
    musicBed.token += 1;
    const at = context.currentTime;
    music.gain.cancelScheduledValues(at);
    music.gain.setValueAtTime(levels.music, at);
    // A preview already playing is replaced without handing the channel back first:
    // clicking through a list should sound like one preview after another, not a bed
    // between each pair.
    stopPreview(false);
    // One thing on the music channel at a time.
    if (musicBed.playing) {
      musicBed.playing.element.pause();
      musicBed.playing = null;
      onBed?.(null);
    }

    const element = previewElementFor();
    if (!element) {
      // A file the graph cannot take is a preview the jukebox does without: the bed
      // comes back rather than the room going quiet.
      wantedPreview = null;
      void bed(musicBed.wanted);
      return;
    }

    const mine = ++previewToken;
    const start = Math.max(0, track.startMs ?? 0) / 1000;
    element.pause();
    element.removeAttribute("src");
    element.load();
    element.src = track.url;
    previewing = { token: mine, startS: start };

    const begin = () => {
      // Another row was chosen while this one was waiting for its metadata.
      if (previewing?.token !== mine) return;
      if (start > 0) {
        try {
          element.currentTime = start;
        } catch {
          // Metadata is not ready for a seek; the start of the file will do.
        }
      }
      void element.play().catch(() => {
        if (previewing?.token === mine) stopPreview(true);
      });
    };
    if (element.readyState >= 1) begin();
    else element.addEventListener("loadedmetadata", begin, { once: true });
  }

  /**
   * The bank could not continue: the element that ended is still in the slot, so a
   * later request for the same type would see it "playing" and do nothing — one
   * failed start would silence the menu for the rest of the session. Clearing it
   * lets the next request deal again, and the listener hears the gap.
   */
  function clearBed(slot: BedSlot, finished: HTMLAudioElement): void {
    if (slot.playing?.element !== finished) return;
    slot.playing = null;
    if (slot === musicBed) onBed?.(null);
  }

  /**
   * A track finished: the bank's next one, straight away and without a gap in the
   * mix — the fades are for a bed arriving or leaving, not for one playing on.
   */
  function advance(slot: BedSlot, finished: HTMLAudioElement): void {
    const current = slot.playing;
    if (!current || current.element !== finished) return;
    const sound = picker.next(current.type);
    if (!sound) {
      clearBed(slot, finished);
      return;
    }
    const element = elementFor(sound);
    if (!element) {
      clearBed(slot, finished);
      return;
    }
    void element
      .play()
      .then(() => {
        // The bed may have moved on while that was starting.
        if (slot.playing?.element !== finished) return;
        slot.playing = { id: sound.id, type: current.type, element };
        if (slot === musicBed) onBed?.(sound.id);
      })
      .catch(() => clearBed(slot, finished));
  }

  /**
   * A bed's element: made once per file, and routed into the graph for good.
   *
   * A **loop** repeats itself; a **track** plays through and asks for the next one,
   * which is the difference between a texture and a playlist. The bed plays on the
   * channel its **type** names — a bed is not always music: the pause's crowd is
   * ambience, and the whole point of the split is that it does not duck with the
   * music.
   */
  function elementFor(sound: Sound): HTMLAudioElement | null {
    if (!context) return null;
    const existing = elements.get(sound.id);
    if (existing) return existing;
    const target = channels.get(channelOf(sound.type));
    if (!target) return null;
    const element = new Audio();
    // Before `src`, or the request starts without CORS and the graph gets silence.
    element.crossOrigin = "anonymous";
    element.preload = "auto";
    element.loop = sound.kind === "loop";
    applyLoopPoints(element, sound);
    try {
      const trim = context.createGain();
      trim.gain.value = soundGain(sound.gainDb);
      context.createMediaElementSource(element).connect(trim).connect(target);
    } catch {
      return null;
    }
    // Named only once the graph will take it, so a file the mixer cannot route is
    // not downloaded for nothing.
    element.src = sound.url;
    if (sound.kind === "track") {
      // A bank of tracks runs on by itself. The element is tied to the channel its
      // type names, so a track on the room would advance the room, not the music.
      const slot = channelOf(sound.type) === "ambience" ? ambienceBed : musicBed;
      element.addEventListener("ended", () => advance(slot, element));
    }
    elements.set(sound.id, element);
    return element;
  }

  /**
   * A loop's own points, where the browser honours them.
   *
   * `loopStart`/`loopEnd` are in the HTML spec but missing from some DOM typings, and
   * a browser that ignores them falls back to looping the whole file — which is what
   * the manifest's points improve on rather than replace.
   */
  function applyLoopPoints(element: HTMLAudioElement, sound: Sound): void {
    const start = sound.loopStart;
    const end = sound.loopEnd;
    if (start === null || end === null) return;
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;
    // A loop can start at the top of the file — "the whole file is the lead-in" is
    // the most natural way to say it — but a span that ends before it begins is not
    // a span at all, and writing it through is worse than falling back to the file.
    if (start < 0 || end <= start) return;
    const points = element as HTMLAudioElement & { loopStart?: number; loopEnd?: number };
    points.loopStart = start;
    points.loopEnd = end;
  }

  /** A one-shot: decoded once, then played from memory. */
  function play(type: string, options: PlayOptions = {}): void {
    playMany([{ type, ...options }]);
  }

  /**
   * One moment, several files: decode them all, then start them together.
   *
   * This is what makes a band's entrance an entrance rather than three sounds
   * arriving near each other. The picks are made before anything is awaited, so a
   * bank cannot deal the same cue twice while a decode is in flight, and the whole
   * group is scheduled against one `currentTime`. A duck belongs to the group: the
   * longest ducking file holds the bed and the room down, instead of every file
   * restarting the envelope on its own.
   */
  function playMany(cues: readonly PlayCue[]): void {
    if (disposed || cues.length === 0) return;
    // Before the gesture there is nothing to hear, and a cue scheduled into a
    // suspended context would arrive late — all of them together — once it resumes.
    // The context can also go away underneath us (an interruption and a browser that
    // has not given it back), so the cue is dropped rather than queued: a click that
    // did not sound is silence, a pile of them is a burst over the song.
    if (!unlocked || !context || context.state !== "running") return;
    const picked = cues.flatMap((cue) => {
      const sound = picker.next(cue.type);
      return sound ? [{ cue, sound }] : [];
    });
    if (picked.length === 0) return;

    void Promise.all(
      picked.map(async ({ cue, sound }) => ({
        cue,
        sound,
        buffer: await bufferFor(sound),
      })),
    ).then((entries) => {
      const ctx = context;
      if (!ctx) return;
      const ready = entries.flatMap(({ cue, sound, buffer }) =>
        buffer ? [{ cue, sound, buffer }] : [],
      );
      if (ready.length === 0) return;

      // One clock for the group. All the sources are scheduled into the same
      // rendering block, so their first samples line up.
      const when = ctx.currentTime;
      for (const { cue, sound, buffer } of ready) {
        const target = channels.get(channelOf(sound.type));
        if (!target) continue;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = cue.rate ?? 1;
        // Its own trim, so a pack's click and a commissioned sting arrive at the
        // same loudness without anybody mastering them together.
        const gain = ctx.createGain();
        gain.gain.value = soundGain(sound.gainDb);
        source.connect(gain);
        // A centre cue stays a two-node path; only a placed cue pays for a panner.
        const pan = cue.pan;
        let panner: StereoPannerNode | null = null;
        if (
          pan !== undefined &&
          pan !== 0 &&
          typeof ctx.createStereoPanner === "function"
        ) {
          panner = ctx.createStereoPanner();
          panner.pan.value = Math.max(-1, Math.min(1, pan));
          gain.connect(panner).connect(target);
        } else {
          gain.connect(target);
        }
        // A one-shot is over when its buffer ends, but the nodes stay wired into
        // the channel until something disconnects them. A typist generates
        // thousands of cues a minute; without this every one of them leaves a gain
        // node (and a panner) on the graph for the life of the page.
        source.onended = () => {
          source.disconnect();
          gain.disconnect();
          panner?.disconnect();
        };
        source.start(when);
      }

      const ducking = ready.filter(({ sound }) => ducksMusic(sound.type));
      if (ducking.length === 0) return;
      const longest = Math.max(
        ...ducking.map(({ buffer, cue }) =>
          buffer.duration / (cue.rate && cue.rate > 0 ? cue.rate : 1),
        ),
      );
      duck(Number.isFinite(longest) && longest > 0 ? longest : DUCK_MIN_S);
    });
  }

  function bufferFor(sound: Sound): Promise<AudioBuffer | null> {
    const done = decoded.get(sound.id);
    if (done) return Promise.resolve(done);
    const inFlight = decoding.get(sound.id);
    if (inFlight) return inFlight;
    const work = (async () => {
      try {
        const response = await fetch(sound.url);
        if (!response.ok) return null;
        const bytes = await response.arrayBuffer();
        const buffer = context ? await context.decodeAudioData(bytes) : null;
        // Only a real buffer is remembered. A failure is tried again next time,
        // because a 5xx or an abort is a bad moment rather than a bad file.
        if (buffer) decoded.set(sound.id, buffer);
        return buffer;
      } catch {
        return null;
      } finally {
        decoding.delete(sound.id);
      }
    })();
    decoding.set(sound.id, work);
    return work;
  }

  /** Ramp a channel, and answer when it has arrived. */
  function fade(gain: GainNode, to: number): Promise<void> {
    if (!context) return Promise.resolve();
    const at = context.currentTime;
    gain.gain.cancelScheduledValues(at);
    gain.gain.setValueAtTime(gain.gain.value, at);
    gain.gain.linearRampToValueAtTime(to, at + FADE_S);
    return new Promise((resolve) => {
      window.setTimeout(resolve, FADE_S * 1000);
    });
  }

  /**
   * Dip **music and ambience** under a sting, then bring them back.
   *
   * The envelope is on the two family gains, never on the master: the master is
   * the player's fader and must not move because a cue played. A second cue while
   * one is sounding cancels the first envelope and starts again from where the
   * gain actually is, so the hold restarts rather than stacking; and the release is
   * always scheduled, so the music cannot be left down. `context` is checked before
   * anything is touched, because a cue can arrive before the first gesture has
   * built the graph.
   */
  function duck(holdS: number): void {
    if (!context) return;
    const at = context.currentTime;
    const hold = Math.max(DUCK_MIN_S, holdS);
    for (const name of ["music", "ambience"] as const) {
      // A preview is not the bed: choosing a row is a ducking cue, and ducking the
      // music channel then holds the preview the player just started at 35% for its
      // first half second. The bed is paused while a preview plays, so there is
      // nothing on this channel the duck is for.
      if (name === "music" && previewing) continue;
      const gain = channels.get(name);
      if (!gain) continue;
      const base = levels[name];
      const dipped = base * DUCK_LEVEL;
      gain.gain.cancelScheduledValues(at);
      gain.gain.setValueAtTime(gain.gain.value, at);
      gain.gain.linearRampToValueAtTime(dipped, at + DUCK_ATTACK_S);
      gain.gain.setValueAtTime(dipped, at + DUCK_ATTACK_S + hold);
      gain.gain.linearRampToValueAtTime(
        base,
        at + DUCK_ATTACK_S + hold + DUCK_RELEASE_S,
      );
    }
  }

  /**
   * The family levels under the master. Called before the graph exists they are
   * simply remembered and `build` seats them; called after, each channel is put on
   * its new level at once. A setting change is a deliberate move, so it takes the
   * channel back from any fade or duck in progress rather than leaving it low.
   */
  function setLevels(next: ChannelLevels): void {
    const one = (value: number, fallback: number): number =>
      Number.isFinite(value) ? clamp01(value) : fallback;
    levels = {
      music: one(next.music, levels.music),
      ambience: one(next.ambience, levels.ambience),
      sfx: one(next.sfx, levels.sfx),
    };
    if (!context) return;
    const at = context.currentTime;
    for (const name of CHANNELS) {
      const gain = channels.get(name);
      if (!gain) continue;
      gain.gain.cancelScheduledValues(at);
      gain.gain.setValueAtTime(levels[name], at);
    }
  }

  /**
   * Tear the graph down.
   *
   * The island unmounting is the only time this happens: a screen change must not
   * take the music with it. A disposed engine is inert rather than broken — closing
   * twice is nothing, and nothing here throws.
   */
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    // Any bed or preview still in flight is stale from here.
    musicBed.token += 1;
    ambienceBed.token += 1;
    try {
      stopPreview(false);
    } catch {
      // A preview that will not stop is still a graph that is about to be closed.
    }
    previewing = null;
    previewToken += 1;
    if (previewElement) {
      try {
        previewElement.pause();
        previewElement.removeAttribute("src");
        previewElement.load();
      } catch {
        // Already stopped with the preview above.
      }
    }
    for (const element of elements.values()) {
      try {
        element.pause();
        element.removeAttribute("src");
        element.load();
      } catch {
        // One element that will not let go must not keep the rest alive.
      }
    }
    elements.clear();
    decoded.clear();
    decoding.clear();
    for (const slot of [musicBed, ambienceBed]) {
      slot.playing = null;
      slot.changing = null;
      slot.wanted = null;
    }
    wantedPreview = null;
    previewElement = null;
    if (previewNode) {
      try {
        previewNode.disconnect();
      } catch {
        // Already gone with the context.
      }
      previewNode = null;
    }
    for (const gain of channels.values()) {
      try {
        gain.disconnect();
      } catch {
        // Already gone with the context.
      }
    }
    channels.clear();
    if (master) {
      try {
        master.disconnect();
      } catch {
        // Already gone with the context.
      }
      master = null;
    }
    const closing = context;
    context = null;
    if (closing) {
      try {
        void closing.close().catch(() => undefined);
      } catch {
        // A context that will not close is a context that is already gone.
      }
    }
  }

  return {
    start() {
      if (disposed) return Promise.resolve();
      starting ??= (async () => {
        // Set before the first `await`, inside the gesture's own turn: the click that
        // follows this press is allowed to sound even if `resume()` has not settled.
        unlocked = true;
        try {
          context ??= build();
        } catch {
          // No Web Audio: a silent game, not a rejected gesture.
          return;
        }
        try {
          if (context.state === "suspended") await context.resume();
        } catch {
          // A context that will not resume is a game with no sound, not a broken one.
        }
        // Whatever was asked for before the gesture — the welcome's bed, usually. A
        // preview asked for takes the channel instead: the menu bed must not start
        // under it for a moment first. The room is not the music: it starts whatever
        // the music is doing.
        if (wantedPreview) preview(wantedPreview);
        else if (musicBed.wanted) await bed(musicBed.wanted);
        if (ambienceBed.wanted) await ambience(ambienceBed.wanted);
      })();
      return starting;
    },
    load(sounds) {
      if (disposed) return;
      // A manifest is re-read on a screen change, and the same bank is the same
      // playlist: rebuilding the picker would reset a track bank to its opening
      // piece and start the menu music over. Only a bank that has really changed
      // is dealt again.
      const sameIds =
        sounds.length === bank.length &&
        sounds.every((sound, at) => sound.id === bank[at]?.id);
      bank = sounds;
      if (!sameIds) picker = createPicker(sounds);
      // A press can arrive before the manifest does — the start listener is live
      // from the first frame — and the bed it asked for had nothing to deal. Now
      // there is a bank, so ask again rather than leaving the room silent until the
      // next screen.
      if (!unlocked) return;
      if (musicBed.wanted && !musicBed.playing && !musicBed.changing) {
        void bed(musicBed.wanted);
      }
      if (ambienceBed.wanted && !ambienceBed.playing && !ambienceBed.changing) {
        void ambience(ambienceBed.wanted);
      }
    },
    prepare,
    play,
    playMany,
    bed,
    ambience,
    preview,
    volume(next) {
      level = Math.max(0, Math.min(1, next));
      if (master) master.gain.value = level;
    },
    setLevels,
    dispose,
  };
}
