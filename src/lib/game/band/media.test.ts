import { describe, expect, test } from "bun:test";
import { youtubeEmbedUrl } from "./media";

describe("youtubeEmbedUrl", () => {
  test("points at the video's embed", () => {
    const url = new URL(youtubeEmbedUrl("n_GFN3a0yj0"));
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://www.youtube.com/embed/n_GFN3a0yj0",
    );
  });

  test("mutes and autoplays, so it can run unattended as a backdrop", () => {
    const params = new URL(youtubeEmbedUrl("abc")).searchParams;
    expect(params.get("autoplay")).toBe("1");
    expect(params.get("mute")).toBe("1");
    expect(params.get("playsinline")).toBe("1");
  });

  test("loops a single video and hides the player chrome", () => {
    const params = new URL(youtubeEmbedUrl("abc")).searchParams;
    // A lone video only loops when it is also named as the playlist.
    expect(params.get("loop")).toBe("1");
    expect(params.get("playlist")).toBe("abc");
    expect(params.get("controls")).toBe("0");
  });
});
