import { describe, expect, test } from "bun:test";
import {
  accentColour,
  bragSvg,
  bragText,
  BRAG_HEIGHT,
  BRAG_WIDTH,
  fontCss,
  starPoints,
  titleLines,
  toBase64,
  xmlEscape,
  type BragCard,
} from "./bragCard";

function card(over: Partial<BragCard> = {}): BragCard {
  return {
    game: "EverythingStar",
    title: "Electric Hearts",
    artist: "The Fixtures",
    score: 12_340,
    stars: 4,
    gold: false,
    accuracy: 92,
    bestCombo: 48,
    players: 2,
    at: Date.UTC(2026, 9, 28, 12),
    accent: "#22e0ff",
    ...over,
  };
}

describe("xmlEscape", () => {
  test("escapes the five characters that can end text or an attribute", () => {
    expect(xmlEscape(`<&>"'`)).toBe("&lt;&amp;&gt;&quot;&apos;");
  });

  test("escapes an ampersand once, not the entities that follow it", () => {
    expect(xmlEscape("AT&T &amp;")).toBe("AT&amp;T &amp;amp;");
  });
});

describe("bragSvg", () => {
  test("is a complete SVG of the card's own size", () => {
    const svg = bragSvg(card());
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
    expect(svg).toContain(`width="${BRAG_WIDTH}" height="${BRAG_HEIGHT}"`);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  test("is deterministic for the same card", () => {
    expect(bragSvg(card())).toBe(bragSvg(card()));
    // The date is UTC, so the card is the same document in every time zone.
    expect(bragSvg(card({ at: Date.UTC(2026, 9, 28, 23, 30) }))).toContain(
      "28 Oct 2026",
    );
  });

  test("carries the song, the score, the rating, the accuracy, the combo, the band and the date", () => {
    const svg = bragSvg(card());
    expect(svg).toContain("Electric Hearts");
    expect(svg).toContain("The Fixtures");
    expect(svg).toContain("12,340");
    expect(svg).toContain("4 / 5 STARS");
    expect(svg).toContain("92%");
    expect(svg).toContain("×48");
    expect(svg).toContain(">2<");
    expect(svg).toContain("28 Oct 2026");
    expect(svg).toContain("EverythingStar");
  });

  test("says gold when every note the part has was hit", () => {
    const svg = bragSvg(card({ stars: 5, gold: true }));
    expect(svg).toContain("GOLD · EVERY NOTE");
    expect(svg).not.toContain("4 / 5 STARS");
  });

  test("says no rating when there is none", () => {
    expect(bragSvg(card({ stars: 0 }))).toContain("NO RATING");
  });

  test("a title of markup cannot break out of its text element or inject one", () => {
    const title = `<script>alert("x")</script> & 'quoted'`;
    const svg = bragSvg(card({ title }));
    // The characters are text: no script element, no attribute ends early.
    expect(svg).not.toContain("<script");
    expect(svg).toContain("&lt;script&gt;");
    // Every text element the card has is still its own, and the document still
    // has its one closing tag.
    expect(svg.match(/<text\b/g)).toHaveLength(15);
    expect(svg.match(/<\/svg>/g)).toHaveLength(1);
  });

  test("an artist of markup is escaped the same way", () => {
    const svg = bragSvg(card({ artist: `AC/DC "Live" & <loud>` }));
    expect(svg).toContain("AC/DC &quot;Live&quot; &amp; &lt;loud&gt;");
    expect(svg).not.toContain("<loud>");
  });

  test("is valid with no fonts supplied, and carries them when it is", () => {
    const bare = bragSvg(card());
    expect(bare).toContain("system-ui, sans-serif");
    expect(bare).not.toContain("@font-face");

    const embedded = bragSvg(card(), {
      fontCss: fontCss({ display: "AAAA", mono: "BBBB", monoBold: "CCCC" }),
    });
    expect(embedded).toContain("@font-face");
    expect(embedded).toContain("data:font/woff2;base64,AAAA");
    expect(embedded).toContain("font-weight:700");
  });
});

describe("accentColour", () => {
  test("keeps a hex colour and refuses anything else", () => {
    expect(accentColour("#22e0ff")).toBe("#22e0ff");
    expect(accentColour("#abc")).toBe("#abc");
    expect(accentColour("red")).toBe("#ffd400");
    expect(accentColour("url(javascript:1)")).toBe("#ffd400");
    expect(accentColour(null)).toBe("#ffd400");
    expect(bragSvg(card({ accent: `"><script>` }))).not.toContain("<script");
  });
});

describe("titleLines", () => {
  test("wraps by words to the width it is given", () => {
    expect(titleLines("Nine Lives", 22, 2)).toEqual(["Nine Lives"]);
    expect(titleLines("A Very Long Song Title That Keeps Going", 16, 2)).toEqual([
      "A Very Long Song",
      "Title That…",
    ]);
  });

  test("splits a word with no spaces in it rather than overflowing", () => {
    const lines = titleLines("Supercalifragilisticexpialidocious", 12, 2);
    expect(lines).toHaveLength(2);
    expect(lines.every((line) => line.length <= 12)).toBe(true);
  });

  test("an empty title still has something to draw", () => {
    expect(titleLines("   ")).toEqual(["?"]);
  });
});

describe("starPoints", () => {
  test("is ten points and the same ten every time", () => {
    const points = starPoints(100, 100, 30);
    expect(points.split(" ")).toHaveLength(10);
    expect(points).toBe(starPoints(100, 100, 30));
  });
});

describe("toBase64", () => {
  test("round-trips bytes through the btoa the browser has", () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
    expect(atob(toBase64(bytes))).toBe("\x00\x01\x02\xfd\xfe\xff");
  });
});

describe("bragText", () => {
  test("is one line per fact, and says gold and the player count", () => {
    const text = bragText(card({ stars: 5, gold: true, players: 1 }));
    expect(text).toContain("Electric Hearts — The Fixtures");
    expect(text).toContain("12,340 points");
    expect(text).toContain("gold stars");
    expect(text).toContain("1 player");
    expect(text).toContain("28 Oct 2026");
  });
});
