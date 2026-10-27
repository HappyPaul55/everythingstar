import { describe, expect, test } from "bun:test";
import { readUltraStar, type UltraStarInput } from "./ultrastar";

const read = (lines: string[], extra: Partial<UltraStarInput> = {}) =>
  readUltraStar({ text: lines.join("\n"), ...extra });

describe("readUltraStar", () => {
  test("uses the format's quadrupled BPM, relative C4 pitch and leading-space words", () => {
    const source = read([
      "#TITLE:Test Song",
      "#BPM:320",
      "#GAP:675",
      ": 0 6 -4 Code",
      ": 8 3 -4  Mon",
      ": 12 2 -6 key",
      ": 36 3 -8  co",
      ": 40 2 -6 ~f",
      ": 45 5 -11 fee",
      "* 52 4 -8  you",
      "- 60",
      ": 64 4 4  next",
      "E",
    ]);

    // 320 bpm is 46.875 ms per beat, not 187.5.
    expect(source.melody?.notes[0].timeMs).toBe(675);
    expect(source.melody?.notes[1].timeMs).toBe(1050);
    expect(source.melody?.lines[0].endMs).toBe(3301);

    // "Mon"+"key" is one word, "co"+"~f"+"fee" is one word, and the `*` is not a
    // line break.
    expect(source.melody?.lines).toHaveLength(2);
    expect(source.melody?.lines[0].words.map((word) => word.text)).toEqual([
      "Code",
      "Monkey",
      "coffee",
      "you",
    ]);

    // Negative pitch is a real pitch: -4 is MIDI 56, not silence.
    expect(source.melody?.hasPitch).toBe(true);
    expect(source.melody?.notes[0].row).not.toBeNull();
    expect(source.melody?.notes[0].row).toBe(7);
    expect(source.melody?.lines[0].words[3].hero).toBe(true);
    expect(source.melody?.notes.find((note) => note.timeMs === 3113)?.hero).toBe(true);
  });

  test("accepts a comma BPM and resolves #AUDIO against the chart folder", () => {
    const source = read(
      [
        "#TITLE:Space Invaders",
        "#BPM:315,08",
        "#GAP:2720",
        "#AUDIO:audio.mp3",
        "#MP3:wrong.mp3",
        ": 1 4 2 E",
        ": 9 2 14 v'ry",
        "E",
      ],
      { baseUrl: "folder://demo/Space%20Invaders/" },
    );

    // 315.08 bpm -> 47.6 ms per beat; beat 1 plus the 2720 ms gap.
    expect(source.melody?.notes[0].timeMs).toBe(2768);
    expect(source.melody?.notes[1].timeMs).toBe(3148);
    // Pitch 2 is MIDI 62, and 0 would be C4 rather than "unpitched".
    expect(source.melody?.notes[0].row).toBe(0);
    expect(source.melody?.hasPitch).toBe(true);
    expect(source.audio.stems[0].url).toBe(
      "folder://demo/Space%20Invaders/audio.mp3",
    );
  });

  test("maps golden, rap and freestyle notes", () => {
    const source = read([
      "#TITLE:Types",
      "#BPM:120",
      "#GAP:0",
      ": 0 4 4  normal",
      "* 4 4 6  golden",
      "R 8 4 0  rap",
      "G 12 4 0  golden rap",
      "F 16 4 0  (ad lib)",
      "E",
    ]);

    expect(source.melody?.lines[0].words.map((word) => word.text)).toEqual([
      "normal",
      "golden",
      "rap",
      "golden rap",
    ]);
    expect(source.melody?.lines[0].words.map((word) => word.hero)).toEqual([
      false,
      true,
      false,
      true,
    ]);
    expect(source.melody?.lines[0].words.some((word) => word.text.includes("ad lib"))).toBe(
      false,
    );
    expect(source.melody?.notes).toHaveLength(4);
    expect(source.melody?.notes.map((note) => note.row === null)).toEqual([
      false,
      false,
      true,
      true,
    ]);
    expect(source.melody?.notes.map((note) => note.hero)).toEqual([
      false,
      true,
      false,
      true,
    ]);
  });

  test("parses P1/P2 as two parts", () => {
    const source = read([
      "#TITLE:Duet",
      "#BPM:120",
      "#GAP:0",
      "P1",
      ": 0 4 0  one",
      "P2",
      ": 0 4 12  two",
      ": 4 4 12  three",
      "E",
    ]);

    expect(source.melody?.parts).toBe(2);
    // Both parts share one roll: the low voice at row 0, the high one twelve above.
    expect(source.melody?.rootMidi).toBe(60);
    expect(source.melody?.rows).toBe(13);
    expect(source.melody?.notes.map((note) => note.row)).toEqual([0, 12, 12]);
    expect(source.melody?.lines).toHaveLength(2);
    expect(source.melody?.lines[0].parts[0].part).toBe(0);
    expect(source.melody?.lines[1].parts[0].part).toBe(1);
    expect(source.melody?.lines[0].words.map((word) => word.text)).toEqual(["one"]);
    expect(source.melody?.lines[1].words.map((word) => word.text)).toEqual([
      "two",
      "three",
    ]);
    expect(source.melody?.notes.map((note) => note.part)).toEqual([0, 1, 1]);
  });

  test("supports #RELATIVE:yes offsets", () => {
    const source = read([
      "#TITLE:Relative",
      "#BPM:120",
      "#GAP:1000",
      "#RELATIVE:yes",
      ": 0 4 0  one",
      "- 10 20",
      ": 0 4 0  two",
      "E",
    ]);

    expect(source.melody?.notes.map((note) => note.timeMs)).toEqual([1000, 3500]);
    expect(source.melody?.lines).toHaveLength(2);
  });

  test("resolves #COVER and #VIDEO against the chart URL", () => {
    const source = read(
      [
        "#TITLE:Paths",
        "#BPM:120",
        "#GAP:0",
        "#COVER:cover.jpg",
        "#VIDEO:video.mp4",
        "E",
      ],
      { baseUrl: "https://example.test/songs/" },
    );

    expect(source.meta.art).toBe("https://example.test/songs/cover.jpg");
    expect(source.meta.video).toEqual({
      kind: "video",
      url: "https://example.test/songs/video.mp4",
    });
  });
});
