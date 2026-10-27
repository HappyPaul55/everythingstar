import { describe, expect, test } from "bun:test";
import {
  controlledStems,
  createPartAudio,
  heldOutStems,
  partKeyOf,
  phraseEndAt,
  restoreRuleFor,
  unplayedStems,
} from "./parts";
import type { SourcePart, SourceSongDoc, SourceStem } from "../source";
import type { SongRole } from "../song";

const stem = (id: string, instrument: SongRole | null): SourceStem => ({
  id,
  name: id,
  url: `${id}.ogg`,
  instrument,
  defaultGainDb: 0,
  offsetMs: 0,
});

const part = (
  role: SongRole,
  stems: string[],
  restore: string | null = "next_hit",
): SourcePart => ({
  id: `part_${role}`,
  role,
  label: null,
  controllerTypes: [],
  audioControl:
    stems.length === 0
      ? null
      : {
          stems,
          onHit: { action: "unmute", fadeMs: 20, restore: null },
          onMiss: { action: "mute", fadeMs: 80, restore },
          onSustainBreak: null,
        },
  charts: [],
});

const doc = (
  stems: SourceStem[],
  parts: SourcePart[],
): Pick<SourceSongDoc, "parts" | "audio"> => ({
  parts,
  audio: { source: "stems", stems, mixPresets: [], preview: null },
});

describe("partKeyOf", () => {
  test("a guitar with a role is its own key, and every other kind is itself", () => {
    expect(partKeyOf("guitar", "lead")).toBe("guitar:lead");
    expect(partKeyOf("guitar", "rhythm")).toBe("guitar:rhythm");
    expect(partKeyOf("guitar")).toBe("guitar");
    expect(partKeyOf("bass")).toBe("bass");
    expect(partKeyOf("words")).toBe("words");
  });
});

describe("controlledStems", () => {
  test("a lead and a rhythm guitar are their own keys, and never the master", () => {
    const map = controlledStems(
      doc(
        [
          stem("stem_master", null),
          stem("stem_lead", "lead_guitar"),
          stem("stem_rhythm", "rhythm_guitar"),
        ],
        [
          part("lead_guitar", ["stem_master", "stem_lead"]),
          part("rhythm_guitar", ["stem_rhythm"]),
        ],
      ),
    );
    expect(map.get("guitar:lead")).toEqual(["stem_lead"]);
    expect(map.get("guitar:rhythm")).toEqual(["stem_rhythm"]);
    // The role keys do not also fill a roleless one: a roleless guitar must not
    // duck a second guitarist's stems.
    expect(map.has("guitar")).toBe(false);
  });

  test("a song that names a plain guitar part keys it as the guitar", () => {
    const map = controlledStems(
      doc(
        [stem("stem_guitar", "guitar"), stem("stem_master", null)],
        [part("guitar", ["stem_master", "stem_guitar"])],
      ),
    );
    expect(map.get("guitar")).toEqual(["stem_guitar"]);
  });

  test("the words take the vocals and the harmony", () => {
    const map = controlledStems(
      doc(
        [stem("stem_vocals", "vocals"), stem("stem_harmony", "vocals")],
        [part("vocals", ["stem_vocals", "stem_harmony"])],
      ),
    );
    expect(map.get("words")).toEqual(["stem_vocals", "stem_harmony"]);
  });

  test("each instrument keeps its own stems", () => {
    const map = controlledStems(
      doc(
        [
          stem("stem_bass", "bass"),
          stem("stem_drums_1", "drums"),
          stem("stem_drums_2", "drums"),
          stem("stem_keys", "keys"),
        ],
        [
          part("bass", ["stem_bass"]),
          part("drums", ["stem_drums_1", "stem_drums_2"]),
          part("keys", ["stem_keys"]),
        ],
      ),
    );
    expect(map.get("bass")).toEqual(["stem_bass"]);
    expect(map.get("drums")).toEqual(["stem_drums_1", "stem_drums_2"]);
    expect(map.get("keys")).toEqual(["stem_keys"]);
  });

  test("a song shipped as one master controls nothing, so a miss cannot silence it", () => {
    const map = controlledStems(
      doc([stem("stem_master", null)], [part("guitar", ["stem_master"])]),
    );
    expect(map.size).toBe(0);
  });

  test("a part with no audio rule controls nothing", () => {
    const map = controlledStems(
      doc([stem("stem_guitar", "lead_guitar")], [part("guitar", [])]),
    );
    expect(map.size).toBe(0);
  });

  test("two roles of one kind do not share a key", () => {
    const map = controlledStems(
      doc(
        [stem("stem_lead", "lead_guitar"), stem("stem_rhythm", "rhythm_guitar")],
        [part("lead_guitar", ["stem_lead"]), part("rhythm_guitar", ["stem_rhythm"])],
      ),
    );
    expect([...map.keys()].sort()).toEqual(["guitar:lead", "guitar:rhythm"]);
  });
});

describe("heldOutStems", () => {
  test("a miss takes its own stems, and the master is never one of them", () => {
    const d = doc(
      [stem("stem_master", null), stem("stem_vocals", "vocals"), stem("stem_guitar", "lead_guitar")],
      [part("vocals", ["stem_master", "stem_vocals"]), part("lead_guitar", ["stem_guitar"])],
    );
    expect([...heldOutStems(d, ["guitar:lead"])]).toEqual(["stem_guitar"]);
    expect([...heldOutStems(d, ["words"])]).toEqual(["stem_vocals"]);
  });

  test("a words miss ducks the voice too, which is the guide vocal on a lyrics song", () => {
    const d = doc(
      [stem("stem_vocals", "vocals"), stem("stem_guitar", "lead_guitar")],
      [part("vocals", ["stem_vocals"]), part("lead_guitar", ["stem_guitar"])],
    );
    expect([...heldOutStems(d, ["words"])]).toEqual(["stem_vocals"]);
  });

  test("a role key falls back to the roleless guitar part", () => {
    const d = doc(
      [stem("stem_guitar", "guitar")],
      [part("guitar", ["stem_guitar"])],
    );
    expect([...heldOutStems(d, ["guitar:lead"])]).toEqual(["stem_guitar"]);
    expect([...heldOutStems(d, ["guitar:rhythm"])]).toEqual(["stem_guitar"]);
  });

  test("a roleless key does not take a second guitarist's stems", () => {
    const d = doc(
      [stem("stem_lead", "lead_guitar"), stem("stem_rhythm", "rhythm_guitar")],
      [part("lead_guitar", ["stem_lead"]), part("rhythm_guitar", ["stem_rhythm"])],
    );
    expect([...heldOutStems(d, ["guitar"])]).toEqual([]);
  });
});

describe("unplayedStems", () => {
  const withVocals = () =>
    doc(
      [stem("stem_master", null), stem("stem_vocals", "vocals"), stem("stem_guitar", "lead_guitar")],
      [part("vocals", ["stem_vocals"]), part("lead_guitar", ["stem_guitar"])],
    );

  test("a singer never loads the guide vocal at all", () => {
    // Not a duck: with somebody on the words and the guide vocal off, the stem is
    // never heard, so it is never fetched — a stream nobody hears is a download, a
    // decoder and a clock the band does not need.
    expect([...unplayedStems(withVocals(), true)]).toEqual(["stem_vocals"]);
    expect([...unplayedStems(withVocals(), false)]).toEqual([]);
  });

  test("the master is never one of them, even when a part names it", () => {
    const d = doc(
      [stem("stem_master", null), stem("stem_vocals", "vocals")],
      [part("vocals", ["stem_master", "stem_vocals"])],
    );
    expect([...unplayedStems(d, true)]).toEqual(["stem_vocals"]);
  });

  test("a song with no words part has no guide vocal to leave out", () => {
    const d = doc([stem("stem_guitar", "lead_guitar")], [part("lead_guitar", ["stem_guitar"])]);
    expect([...unplayedStems(d, true)]).toEqual([]);
  });
});

describe("restoreRuleFor", () => {
  const withRule = (restore: string | null) =>
    doc([stem("stem_guitar", "lead_guitar")], [part("lead_guitar", ["stem_guitar"], restore)]);

  test("the song document's own rule, and nothing else", () => {
    expect(restoreRuleFor(withRule("next_hit"), "guitar:lead")).toBe("next_hit");
    expect(restoreRuleFor(withRule("phrase_end"), "guitar:lead")).toBe("phrase_end");
    // A part with no rule, or one we do not know, is the next hit.
    expect(restoreRuleFor(withRule(null), "guitar:lead")).toBe("next_hit");
    expect(restoreRuleFor(withRule("bar_end"), "guitar:lead")).toBe("next_hit");
  });

  test("a role key falls back to the roleless guitar part", () => {
    const d = doc(
      [stem("stem_guitar", "guitar")],
      [part("guitar", ["stem_guitar"], "phrase_end")],
    );
    expect(restoreRuleFor(d, "guitar:lead")).toBe("phrase_end");
  });

  test("a part the song does not carry waits for the next hit", () => {
    const d = doc([stem("stem_bass", "bass")], [part("bass", ["stem_bass"], "phrase_end")]);
    expect(restoreRuleFor(d, "drums")).toBe("next_hit");
  });
});

describe("phraseEndAt", () => {
  const spans = [
    { startMs: 0, endMs: 4_000 },
    { startMs: 4_000, endMs: 8_000 },
    { startMs: 12_000, endMs: 16_000 },
  ];

  test("the end of the phrase the moment falls in", () => {
    expect(phraseEndAt(spans, 1_000)).toBe(4_000);
    expect(phraseEndAt(spans, 5_500)).toBe(8_000);
    expect(phraseEndAt(spans, 12_000)).toBe(16_000);
  });

  test("a moment on a boundary belongs to the phrase that starts there", () => {
    expect(phraseEndAt(spans, 4_000)).toBe(8_000);
    expect(phraseEndAt(spans, 8_000)).toBeNull();
  });

  test("nothing containing it is nothing to wait for", () => {
    expect(phraseEndAt(spans, 9_000)).toBeNull();
    expect(phraseEndAt([], 1_000)).toBeNull();
  });

  test("nested spans come back at the earliest end still ahead", () => {
    expect(
      phraseEndAt(
        [
          { startMs: 0, endMs: 16_000 },
          { startMs: 2_000, endMs: 6_000 },
          { startMs: 3_000, endMs: 4_000 },
        ],
        3_500,
      ),
    ).toBe(4_000);
  });
});

describe("createPartAudio", () => {
  test("a miss takes a part out, and a hit puts it back", () => {
    const audio = createPartAudio();
    audio.set(0, "guitar:lead", true);
    expect([...audio.muted()]).toEqual(["guitar:lead"]);
    audio.set(0, "guitar:lead", false);
    expect([...audio.muted()]).toEqual([]);
  });

  test("two players on one instrument keep it out while either of them is out", () => {
    const audio = createPartAudio();
    audio.set(0, "guitar:lead", true);
    audio.set(1, "guitar:lead", true);
    audio.set(0, "guitar:lead", false);
    expect([...audio.muted()]).toEqual(["guitar:lead"]);
    audio.set(1, "guitar:lead", false);
    expect([...audio.muted()]).toEqual([]);
  });

  test("a lead and a rhythm guitar are different keys", () => {
    const audio = createPartAudio();
    audio.set(0, "guitar:lead", true);
    audio.set(1, "guitar:rhythm", true);
    expect([...audio.muted()].sort()).toEqual(["guitar:lead", "guitar:rhythm"]);
  });

  test("the set holds keys, not seats", () => {
    const audio = createPartAudio();
    audio.set(0, "guitar", true);
    audio.set(1, "drums", true);
    expect([...audio.muted()].sort()).toEqual(["drums", "guitar"]);
  });

  test("a next-hit mute waits for the seat, not for the clock", () => {
    const audio = createPartAudio();
    audio.set(0, "guitar", true);
    audio.tick(1_000_000);
    expect(audio.mute(0)).toEqual({ part: "guitar", restoreAtMs: null });
    expect([...audio.muted()]).toEqual(["guitar"]);
  });

  test("a phrase-end mute expires on the clock, and not before", () => {
    const audio = createPartAudio();
    audio.set(0, "words", true, 5_000);
    expect(audio.mute(0)).toEqual({ part: "words", restoreAtMs: 5_000 });
    audio.tick(4_999);
    expect([...audio.muted()]).toEqual(["words"]);
    audio.tick(5_000);
    expect([...audio.muted()]).toEqual([]);
    expect(audio.mute(0)).toBeNull();
  });

  test("a later miss moves the expiry to its own phrase", () => {
    const audio = createPartAudio();
    audio.set(0, "guitar:lead", true, 5_000);
    audio.set(0, "guitar:lead", true, 9_000);
    expect(audio.mute(0)?.restoreAtMs).toBe(9_000);
    audio.tick(5_000);
    expect([...audio.muted()]).toEqual(["guitar:lead"]);
    audio.tick(9_000);
    expect([...audio.muted()]).toEqual([]);
  });

  test("a seek clears every part, as a new attempt", () => {
    const audio = createPartAudio();
    audio.set(0, "guitar:lead", true, 5_000);
    audio.set(1, "drums", true);
    audio.clear();
    expect([...audio.muted()]).toEqual([]);
    expect(audio.mute(0)).toBeNull();
    expect(audio.mute(1)).toBeNull();
  });

  test("leaving the stage puts the seat's part back without touching another", () => {
    const audio = createPartAudio();
    audio.set(0, "guitar:lead", true, 5_000);
    audio.set(1, "words", true);
    // What `usePartMute`'s unmount cleanup does.
    audio.set(0, "guitar:lead", false);
    expect([...audio.muted()]).toEqual(["words"]);
  });

  test("a listener hears a change once, and nothing when nothing changed", () => {
    const audio = createPartAudio();
    let calls = 0;
    const stop = audio.subscribe(() => {
      calls += 1;
    });
    audio.set(0, "guitar", true);
    audio.set(0, "guitar", true);
    audio.set(1, "guitar", true);
    audio.set(0, "guitar", false);
    audio.set(0, "guitar", false);
    expect(calls).toBe(3);
    stop();
    audio.set(1, "guitar", false);
    expect(calls).toBe(3);
  });

  test("an expiry notifies once, and a tick with nothing due says nothing", () => {
    const audio = createPartAudio();
    let calls = 0;
    audio.subscribe(() => {
      calls += 1;
    });
    audio.set(0, "words", true, 2_000);
    audio.set(1, "words", true, 3_000);
    expect(calls).toBe(2);
    audio.tick(1_999);
    expect(calls).toBe(2);
    audio.tick(2_000);
    expect(calls).toBe(3);
    audio.tick(2_500);
    expect(calls).toBe(3);
    audio.tick(3_000);
    expect(calls).toBe(4);
  });
});
