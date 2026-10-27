import { describe, expect, test } from "bun:test";
import { decodeText } from "./bytes";
import {
  ART_NAMES,
  audioFromFiles,
  findName,
  folderAttribution,
  mixPresetsFor,
} from "./files";

/** The same text written the three ways a chart collection writes it. */
const utf8 = (text: string) => new TextEncoder().encode(text);

function utf16(text: string, bom: boolean): Uint8Array {
  const bytes = new Uint8Array((bom ? 2 : 0) + text.length * 2);
  let at = 0;
  if (bom) {
    bytes[at++] = 0xff;
    bytes[at++] = 0xfe;
  }
  for (const char of text) {
    const code = char.charCodeAt(0);
    bytes[at++] = code & 0xff;
    bytes[at++] = code >> 8;
  }
  return bytes;
}

/** CP-1252: the same code points, one byte each. */
const cp1252 = (text: string) => Uint8Array.from([...text].map((c) => c.charCodeAt(0) & 0xff));

describe("decodeText", () => {
  const text = "[song]\nname = Zürich\nartist = Zürich\n";

  test("reads UTF-8 as itself", () => {
    expect(decodeText(utf8(text))).toBe(text);
  });

  test("reads the Windows code page rather than a name full of question marks", () => {
    expect(decodeText(cp1252(text))).toBe(text);
  });

  test("reads UTF-16, with a byte-order mark", () => {
    expect(decodeText(utf16(text, true))).toBe(text);
  });

  test("reads UTF-16 without one, from the NUL bytes alone", () => {
    expect(decodeText(utf16(text, false))).toBe(text);
  });

  test("reads ASCII UTF-16 without a mark", () => {
    expect(decodeText(utf16("name = Zürich\n", false))).toBe("name = Zürich\n");
  });

  test("reads a CJK UTF-16 title without a mark, from where the zeros fall", () => {
    // The old look-ahead was 64 bytes and this file's first 64 are all CJK, so it had
    // no NUL to notice. The ASCII keys after it still put the zeros on one parity.
    const head = "雨夜花".repeat(12);
    const song = `${head}\n[song]\nname = 雨夜花\nartist = 林俊杰\nsong_length = 210000\ncharter = Someone\n`;
    expect(decodeText(utf16(song, false))).toBe(song);
  });

  test("does not mistake UTF-8 CJK for UTF-16", () => {
    const song = "雨夜花受风雨吹落地无人看见每日怨嗟花谢落土不再回";
    expect(decodeText(utf8(song))).toBe(song);
  });

  test("drops a byte-order mark from UTF-8", () => {
    expect(decodeText(utf8(`\uFEFF${text}`))).toBe(text);
  });
});

describe("findName", () => {
  test("finds a file by any of its names, whatever the case", () => {
    expect(findName(["Album.PNG", "notes.mid"], ART_NAMES)).toBe("Album.PNG");
    expect(findName(["album_alt.png"], ART_NAMES)).toBe("album_alt.png");
    expect(findName(["notes.mid"], ART_NAMES)).toBeNull();
  });

  test("prefers the convention when a folder has more than one cover", () => {
    expect(findName(["album_alt.png", "album.png"], ART_NAMES)).toBe("album.png");
  });
});

describe("audioFromFiles", () => {
  const full = (audio: ReturnType<typeof audioFromFiles>) =>
    audio.mixPresets.find((preset) => preset.id === "full")?.stemIds ?? [];

  test("a chart folder that shipped a multitrack plays its parts: its `song.ogg` is a bed", () => {
    // Multitrack chart folders: `song.ogg` measures 22–88% present against parts at ~95%,
    // so the parts are the song and the master is the room.
    const audio = audioFromFiles({
      master: "song.ogg",
      lead_guitar: "guitar.ogg",
      bass: "bass.ogg",
      drums: "drums_1.ogg",
      vocals: "vocals.ogg",
    });
    expect(full(audio)).toEqual([
      "stem_lead_guitar",
      "stem_bass",
      "stem_drums",
      "stem_vocals",
    ]);
  });

  test("one or two files beside a mix are its parts: the master is the backing", () => {
    // Measured: `song.ogg` shares nothing with `guitar.ogg` (r ≈ 0.01), so it is the
    // mix with the guitars taken out — the backing a miss mutes — and the song is all
    // three together. Playing the master alone is the song without its guitar.
    const audio = audioFromFiles({
      master: "song.ogg",
      lead_guitar: "guitar.ogg",
      rhythm_guitar: "rhythm.ogg",
    });
    expect(full(audio)).toEqual([
      "stem_master",
      "stem_lead_guitar",
      "stem_rhythm_guitar",
    ]);
  });

  test("a song with no mix plays its parts, and one with no parts plays its mix", () => {
    expect(full(audioFromFiles({ lead_guitar: "guitar.ogg", bass: "bass.ogg" }))).toEqual([
      "stem_lead_guitar",
      "stem_bass",
    ]);
    expect(full(audioFromFiles({ master: "song.ogg" }))).toEqual(["stem_master"]);
  });

  test("the crowd is nobody's part: it is never in the mix of the song", () => {
    const audio = audioFromFiles({
      master: "song.ogg",
      lead_guitar: "guitar.ogg",
      bass: "bass.ogg",
      drums: "drums_1.ogg",
      crowd: "crowd.ogg",
    });
    expect(full(audio)).not.toContain("stem_crowd");
    expect(audio.stems.map((stem) => stem.id)).toContain("stem_crowd");
  });

  test("a song with no audio has no presets at all rather than empty ones", () => {
    expect(audioFromFiles({}).mixPresets).toEqual([]);
  });

  test("a kit cut into four files is one instrument, not a multitrack", () => {
    // `drums.ogg` + `drums_1..4.ogg` is one player's part: counting files would take
    // the master out of `full` and make one missed drum note mute the whole kit.
    const audio = audioFromFiles({
      master: "song.ogg",
      drums: "drums.ogg",
      drums_2: "drums_2.ogg",
      drums_3: "drums_3.ogg",
      drums_4: "drums_4.ogg",
    });
    expect(full(audio)).toEqual([
      "stem_master",
      "stem_drums",
      "stem_drums_2",
      "stem_drums_3",
      "stem_drums_4",
    ]);
  });

  test("vocals and a harmony are still one instrument beside the guitar", () => {
    const audio = audioFromFiles({
      master: "song.ogg",
      vocals: "vocals.ogg",
      harmony: "harmony.ogg",
      lead_guitar: "guitar.ogg",
    });
    expect(full(audio)).toEqual([
      "stem_master",
      "stem_lead_guitar",
      "stem_vocals",
      "stem_harmony",
    ]);
  });

  test("three instruments are a multitrack, and the master is the bed", () => {
    const audio = audioFromFiles({
      master: "song.ogg",
      lead_guitar: "guitar.ogg",
      bass: "bass.ogg",
      drums: "drums.ogg",
    });
    expect(full(audio)).toEqual(["stem_lead_guitar", "stem_bass", "stem_drums"]);
  });
});

describe("mixPresetsFor", () => {
  const stems = (ids: [string, string | null][]) =>
    ids.map(([id, instrument]) => ({ id, instrument })) as Parameters<typeof mixPresetsFor>[0];

  test("three parts or more is a multitrack", () => {
    const presets = mixPresetsFor(
      stems([
        ["stem_master", null],
        ["stem_guitar", "lead_guitar"],
        ["stem_bass", "bass"],
        ["stem_drums", "drums"],
      ]),
    );
    expect(presets.find((preset) => preset.id === "full")?.stemIds).toEqual([
      "stem_guitar",
      "stem_bass",
      "stem_drums",
    ]);
  });

  test("two parts are played with the master, which is what holds the rest of the band", () => {
    const presets = mixPresetsFor(
      stems([
        ["stem_master", null],
        ["stem_guitar", "lead_guitar"],
        ["stem_bass", "bass"],
      ]),
    );
    expect(presets.find((preset) => preset.id === "full")?.stemIds).toEqual([
      "stem_master",
      "stem_guitar",
      "stem_bass",
    ]);
  });

  test("one part is played with the master too, or the song has no lead instrument", () => {
    const presets = mixPresetsFor(
      stems([
        ["stem_master", null],
        ["stem_guitar", "lead_guitar"],
      ]),
    );
    expect(presets.find((preset) => preset.id === "full")?.stemIds).toEqual([
      "stem_master",
      "stem_guitar",
    ]);
    // The parts alone are still offered, for the fallback and the per-part mixing.
    expect(presets.find((preset) => preset.id === "stems")?.stemIds).toEqual(["stem_guitar"]);
  });
});

describe("folders and names", () => {
  test("splits the `Artist - Title` every chart folder names its folder by", () => {
    expect(folderAttribution("Machine Head - Beautiful Mourning")).toEqual({
      artist: "Machine Head",
      title: "Beautiful Mourning",
    });
  });

  test("keeps a title that has a dash of its own", () => {
    expect(folderAttribution("Artist - Title - Live")).toEqual({
      artist: "Artist",
      title: "Title - Live",
    });
  });

  test("says nothing about a folder that is not named that way", () => {
    expect(folderAttribution("All of This")).toBeNull();
  });
});
