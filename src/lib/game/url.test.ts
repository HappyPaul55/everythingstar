import { describe, expect, test } from "bun:test";
import {
  MAX_URL_CHARS,
  fetchableUrl,
  hostOf,
  isInsecure,
  mixedContentBlocked,
} from "./url";

describe("fetchableUrl", () => {
  test("accepts absolute http and https addresses with a host", () => {
    expect(fetchableUrl("https://example.com/playlist.json")).toBe(
      "https://example.com/playlist.json",
    );
    expect(fetchableUrl("http://example.com/playlist.json")).toBe(
      "http://example.com/playlist.json",
    );
    // The address is the browser's: the host is lower-cased, the spaces encoded.
    expect(fetchableUrl("  HTTPS://Example.COM/a b  ")).toBe("https://example.com/a%20b");
    expect(fetchableUrl("https://example.com:8443/playlist.json")).toBe(
      "https://example.com:8443/playlist.json",
    );
  });

  test("refuses every scheme that is not a download", () => {
    expect(fetchableUrl("javascript:alert(1)")).toBeNull();
    expect(fetchableUrl("data:application/json,{}")).toBeNull();
    expect(fetchableUrl("file:///tmp/playlist.json")).toBeNull();
    expect(fetchableUrl("blob:https://example.com/2f8c")).toBeNull();
    expect(fetchableUrl("ftp://example.com/playlist.json")).toBeNull();
    expect(fetchableUrl("mailto:someone@example.com")).toBeNull();
  });

  test("refuses a relative, empty or hostless address", () => {
    expect(fetchableUrl("")).toBeNull();
    expect(fetchableUrl("   ")).toBeNull();
    expect(fetchableUrl("/playlist.json")).toBeNull();
    expect(fetchableUrl("playlist.json")).toBeNull();
    expect(fetchableUrl("example.com/playlist.json")).toBeNull();
    expect(fetchableUrl("//example.com/playlist.json")).toBeNull();
    expect(fetchableUrl("https://")).toBeNull();
  });

  test("refuses an address that carries credentials", () => {
    // `fetch` throws an opaque TypeError for these, so the policy is where they stop.
    expect(fetchableUrl("https://user:pass@example.com/playlist.json")).toBeNull();
    expect(fetchableUrl("https://user@example.com/playlist.json")).toBeNull();
    expect(fetchableUrl("http://user:pass@example.com:8080/a.json")).toBeNull();
  });

  test("an @ that is not a credential is still a path", () => {
    expect(fetchableUrl("https://example.com/@someone/playlist.json")).toBe(
      "https://example.com/@someone/playlist.json",
    );
    expect(fetchableUrl("https://example.com/find?q=a@b")).toBe(
      "https://example.com/find?q=a@b",
    );
  });

  test("an address past the ceiling is refused, one exactly at it is not", () => {
    const base = "https://example.com/";
    const exact = base + "a".repeat(MAX_URL_CHARS - base.length);
    expect(exact.length).toBe(MAX_URL_CHARS);
    expect(fetchableUrl(exact)).toBe(exact);
    // A pasted playlist is held to the same size a link is, so it cannot be stored,
    // drawn on a row and used as a cache key by being a hundred kilobytes long.
    expect(fetchableUrl(`${exact}a`)).toBeNull();
    expect(hostOf(`${exact}a`)).toBeNull();
  });
});

describe("hostOf", () => {
  test("shows the host the browser would reach, port included", () => {
    expect(hostOf("https://www.example.com/a/b.json")).toBe("www.example.com");
    expect(hostOf("http://example.com:8080/playlist.json")).toBe("example.com:8080");
  });

  test("keeps `www.` rather than showing a host that is not in the URL", () => {
    expect(hostOf("https://www.example.com/")).toBe("www.example.com");
  });

  test("has no host to show for anything we would not fetch", () => {
    expect(hostOf("javascript:alert(1)")).toBeNull();
    expect(hostOf("data:text/plain,hi")).toBeNull();
    expect(hostOf("example.com/playlist.json")).toBeNull();
    expect(hostOf("https://user:pass@example.com/playlist.json")).toBeNull();
    expect(hostOf("")).toBeNull();
  });
});

describe("insecure addresses", () => {
  test("only http is insecure", () => {
    expect(isInsecure("http://example.com/a.json")).toBe(true);
    expect(isInsecure("https://example.com/a.json")).toBe(false);
    expect(isInsecure("javascript:alert(1)")).toBe(false);
  });

  test("an https page blocks an http address, and an http page does not", () => {
    expect(mixedContentBlocked("http://example.com/a.json", "https:")).toBe(true);
    expect(mixedContentBlocked("http://example.com/a.json", "https")).toBe(true);
    expect(mixedContentBlocked("http://example.com/a.json", "HTTP:")).toBe(false);
    expect(mixedContentBlocked("https://example.com/a.json", "https:")).toBe(false);
  });

  test("nothing else is mixed content", () => {
    expect(mixedContentBlocked("javascript:alert(1)", "https:")).toBe(false);
    expect(mixedContentBlocked("not a url", "https:")).toBe(false);
  });
});
