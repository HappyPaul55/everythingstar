import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { makeBand, type BandSlot } from "../band/types";
import { HYPE_LENGTH_MS, hypeCues, hypeEntranceMs, type HypeType } from "./hype";

/** A slot with the level every one of these tests can ignore. */
function slot(kind: BandSlot["kind"], extra: Partial<BandSlot> = {}): BandSlot {
  return { kind, difficulty: "normal", ...extra };
}

function band(...slots: BandSlot[]) {
  return makeBand({ slots });
}

describe("hypeCues", () => {
  test("one part is centre", () => {
    expect(hypeCues(band(slot("guitar")), false)).toEqual([
      { type: "hype_guitar", pan: 0 },
    ]);
  });

  test("three guitars are still one guitar entrance", () => {
    const cues = hypeCues(
      band(slot("guitar"), slot("guitar", { role: "rhythm" }), slot("guitar")),
      false,
    );
    expect(cues).toEqual([{ type: "hype_guitar", pan: 0 }]);
  });

  test("two different parts go a quarter left and a quarter right", () => {
    const cues = hypeCues(band(slot("guitar"), slot("bass")), false);
    expect(cues).toEqual([
      { type: "hype_guitar", pan: -0.25 },
      { type: "hype_bass", pan: 0.25 },
    ]);
  });

  test("three parts add a centre point", () => {
    const cues = hypeCues(
      band(slot("guitar"), slot("bass"), slot("drums")),
      false,
    );
    expect(cues.map((cue) => cue.type)).toEqual([
      "hype_guitar",
      "hype_bass",
      "hype_drums",
    ]);
    expect(cues.map((cue) => cue.pan)).toEqual([-0.25, 0, 0.25]);
  });

  test("four parts spread inside the same quarter-width field", () => {
    const cues = hypeCues(
      band(slot("guitar"), slot("bass"), slot("drums"), slot("words", { wordsMode: "sing" })),
      true,
    );
    expect(cues.map((cue) => cue.type)).toEqual([
      "hype_guitar",
      "hype_bass",
      "hype_drums",
      "hype_vocals",
    ]);
    expect(cues[0]?.pan).toBeCloseTo(-0.25);
    expect(cues[1]?.pan).toBeCloseTo(-1 / 12);
    expect(cues[2]?.pan).toBeCloseTo(1 / 12);
    expect(cues[3]?.pan).toBeCloseTo(0.25);
  });

  test("the band's order decides left from right", () => {
    const cues = hypeCues(band(slot("drums"), slot("guitar")), false);
    expect(cues).toEqual([
      { type: "hype_drums", pan: -0.25 },
      { type: "hype_guitar", pan: 0.25 },
    ]);
  });

  test("keys borrow the guitar entrance and share it", () => {
    expect(hypeCues(band(slot("keys")), false)).toEqual([
      { type: "hype_guitar", pan: 0 },
    ]);
    expect(hypeCues(band(slot("guitar"), slot("keys")), false)).toEqual([
      { type: "hype_guitar", pan: 0 },
    ]);
  });

  test("dance borrows the drum entrance and shares it", () => {
    expect(hypeCues(band(slot("dance")), false)).toEqual([
      { type: "hype_drums", pan: 0 },
    ]);
    expect(hypeCues(band(slot("drums"), slot("dance")), false)).toEqual([
      { type: "hype_drums", pan: 0 },
    ]);
  });

  test("a singer on a pitched song brings the microphone tap", () => {
    expect(hypeCues(band(slot("words", { wordsMode: "sing" })), true)).toEqual([
      { type: "hype_vocals", pan: 0 },
    ]);
  });

  test("a typist is not a voice", () => {
    expect(hypeCues(band(slot("words", { wordsMode: "type" })), true)).toEqual([]);
  });

  test("words with no pitch never bring the microphone tap", () => {
    expect(hypeCues(band(slot("words")), false)).toEqual([]);
    expect(hypeCues(band(slot("words", { wordsMode: "sing" })), false)).toEqual([]);
  });

  test("a duet of singers is one microphone tap", () => {
    const cues = hypeCues(
      band(
        slot("words", { wordsMode: "sing" }),
        slot("words", { wordsMode: "sing" }),
      ),
      true,
    );
    expect(cues).toEqual([{ type: "hype_vocals", pan: 0 }]);
  });

  test("an empty band (Listen) has no entrance", () => {
    expect(hypeCues(band(), true)).toEqual([]);
  });
});

describe("hypeEntranceMs", () => {
  test("Listen waits only for the quiet beat, the slide and its breath", () => {
    // 1200ms with the room and score alone + 650ms slide + 250ms before the song.
    expect(hypeEntranceMs([])).toBe(2100);
  });

  test("the longest cue decides how long the song waits", () => {
    expect(hypeEntranceMs([{ type: "hype_guitar", pan: 0 }])).toBe(4870);
    expect(hypeEntranceMs([{ type: "hype_drums", pan: 0 }])).toBe(3474);
    expect(hypeEntranceMs([{ type: "hype_vocals", pan: 0 }])).toBe(3904);
  });

  test("a band with several cues waits for the longest, not for all of them", () => {
    expect(
      hypeEntranceMs([
        { type: "hype_drums", pan: -0.25 },
        { type: "hype_bass", pan: 0.25 },
      ]),
    ).toBe(4846);
  });
});

/**
 * `HYPE_LENGTH_MS` is the pause the song makes for each entrance, so it is only
 * ever right if it is the shipped file's own length. These read the Ogg files that
 * ship: the manifest says which file each type is, and the file's last granule
 * position, over the rate its identification header states, is what a decoder
 * would call the duration.
 */
const AUDIO = new URL("../../../../public/audio/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("sounds.json", AUDIO), "utf8")) as {
  sounds: { type: string; file?: string }[];
};

/** Each Ogg page's granule and where its packet body starts, in file order. */
function oggPages(bytes: Uint8Array): { granule: number; payload: number }[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pages: { granule: number; payload: number }[] = [];
  let at = 0;
  while (
    at + 27 <= bytes.length &&
    bytes[at] === 0x4f &&
    bytes[at + 1] === 0x67 &&
    bytes[at + 2] === 0x67 &&
    bytes[at + 3] === 0x53
  ) {
    const segments = view.getUint8(at + 26);
    let size = 27 + segments;
    for (let i = 0; i < segments; i += 1) size += view.getUint8(at + 27 + i);
    pages.push({
      // The field is little-endian and unsigned; time is the low 53 bits.
      granule: Number(view.getBigUint64(at + 6, true)),
      payload: at + 27 + segments,
    });
    at += size;
  }
  return pages;
}

/** The rate in the Vorbis identification header, which is what a granule counts in. */
function sampleRate(bytes: Uint8Array): number {
  const first = oggPages(bytes)[0];
  if (!first) throw new Error("not an Ogg file");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(first.payload + 12, true);
}

describe("the entrance files that ship", () => {
  test("each declared length is its file's own, within 20 ms", () => {
    for (const type of Object.keys(HYPE_LENGTH_MS) as HypeType[]) {
      const entry = manifest.sounds.find((sound) => sound.type === type);
      const file = entry?.file;
      if (!file) throw new Error(`${type}: no file in the manifest`);
      const bytes = new Uint8Array(readFileSync(new URL(file, AUDIO)));
      const pages = oggPages(bytes);
      const last = pages[pages.length - 1];
      if (!last) throw new Error(`${type}: no Ogg pages in ${file}`);
      const rate = sampleRate(bytes);
      const measured = (last.granule / rate) * 1000;
      expect(Math.abs(measured - HYPE_LENGTH_MS[type])).toBeLessThanOrEqual(20);
    }
  });
});
