import { describe, expect, test } from "bun:test";
import { iniFlag, iniNumber, iniText, readIni } from "./ini";

describe("readIni", () => {
  test("reads a real song.ini, colour markup and all", () => {
    const values = readIni(
      [
        "[song]",
        "name = Sad But True",
        "artist = Metallica",
        "album = Metallica",
        "year = 1991",
        "charter=<color=orange>Neversoft</color>",
        "song_length = 331251",
        "diff_guitar = 4",
        "preview_start_time = -1",
        "",
      ].join("\n"),
    );
    expect(iniText(values, "name")).toBe("Sad But True");
    expect(iniText(values, "charter")).toBe("<color=orange>Neversoft</color>");
    expect(iniNumber(values, "song_length", 0)).toBe(331251);
    expect(iniNumber(values, "diff_guitar", -1)).toBe(4);
    expect(iniNumber(values, "preview_start_time", -1)).toBe(-1);
    expect(iniNumber(values, "missing", 7)).toBe(7);
  });

  test("is tolerant: blank lines, comments, quotes, and a `=` inside a value", () => {
    const values = readIni(
      ["; a comment", "", "title = \"A = B\"", "loading_phrase = 'was released in 1992'"].join(
        "\n",
      ),
    );
    expect(iniText(values, "title")).toBe("A = B");
    expect(iniText(values, "loading_phrase")).toBe("was released in 1992");
  });

  test("keys are case-insensitive and the last write wins", () => {
    const values = readIni("Name = one\nname = two");
    expect(iniText(values, "NAME")).toBe("two");
  });

  test("reads a file written on an old Mac, whose lines end in a bare CR", () => {
    // `split(/\r?\n/)` saw this as one line, so nothing at all was read.
    const values = readIni(
      "[song]\rname = A Song\rartist = Someone\rsong_length = 210000\r",
    );
    expect(iniText(values, "name")).toBe("A Song");
    expect(iniText(values, "artist")).toBe("Someone");
    expect(iniNumber(values, "song_length", 0)).toBe(210000);
  });

  test("a byte-order mark is not part of the first key", () => {
    // A caller that passed decoded text may leave the mark on the front of it.
    const values = readIni("\uFEFFname = A Song\nartist = Someone");
    expect(iniText(values, "name")).toBe("A Song");
    expect(iniText(values, "artist")).toBe("Someone");
  });

  test("flags understand the ways these files say yes", () => {
    const values = readIni("pro_drums = False\nfive_lane_drums = True\narmor = 1\nx = yes");
    expect(iniFlag(values, "pro_drums")).toBe(false);
    expect(iniFlag(values, "five_lane_drums")).toBe(true);
    expect(iniFlag(values, "armor")).toBe(true);
    expect(iniFlag(values, "x")).toBe(true);
    expect(iniFlag(values, "missing")).toBe(false);
  });

  test("an empty or missing value reads as nothing", () => {
    const values = readIni("video =\nlink_name_b =");
    expect(iniText(values, "video")).toBeNull();
    expect(iniText(values, "link_name_b")).toBeNull();
  });
});
