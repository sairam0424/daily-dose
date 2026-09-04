import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractOgImage,
  extractFavicon,
  resolveItemImage,
} from "../src/lib/imageResolution.js";

describe("extractOgImage", () => {
  it("extracts og:image when present", () => {
    const html = `<meta property="og:image" content="https://example.com/cover.png">`;
    expect(extractOgImage(html, "https://example.com/article")).toBe(
      "https://example.com/cover.png",
    );
  });

  it("falls back to twitter:image when og:image is absent", () => {
    const html = `<meta name="twitter:image" content="https://example.com/tw.png">`;
    expect(extractOgImage(html, "https://example.com/article")).toBe(
      "https://example.com/tw.png",
    );
  });

  it("falls back to twitter:image:src when og:image and twitter:image are both absent", () => {
    const html = `<meta name="twitter:image:src" content="https://example.com/src.png">`;
    expect(extractOgImage(html, "https://example.com/article")).toBe(
      "https://example.com/src.png",
    );
  });

  it("prefers og:image over twitter:image when both are present", () => {
    const html = `
      <meta name="twitter:image" content="https://example.com/tw.png">
      <meta property="og:image" content="https://example.com/og.png">
    `;
    expect(extractOgImage(html, "https://example.com/article")).toBe(
      "https://example.com/og.png",
    );
  });

  it("resolves a relative image URL against the page's own URL", () => {
    const html = `<meta property="og:image" content="/static/cover.png">`;
    expect(extractOgImage(html, "https://example.com/blog/post")).toBe(
      "https://example.com/static/cover.png",
    );
  });

  it("handles attribute order (content before property/name)", () => {
    const html = `<meta content="https://example.com/og2.png" property="og:image">`;
    expect(extractOgImage(html, "https://example.com")).toBe(
      "https://example.com/og2.png",
    );
  });

  it("returns undefined when no image meta tag is present", () => {
    expect(
      extractOgImage("<html></html>", "https://example.com"),
    ).toBeUndefined();
  });
});

describe("extractFavicon", () => {
  it("extracts <link rel='icon'> when present", () => {
    const html = `<link rel="icon" href="/favicon.ico">`;
    expect(extractFavicon(html, "https://example.com/page")).toBe(
      "https://example.com/favicon.ico",
    );
  });

  it("extracts <link rel='shortcut icon'> when present", () => {
    const html = `<link rel="shortcut icon" href="https://cdn.example.com/fav.png">`;
    expect(extractFavicon(html, "https://example.com/page")).toBe(
      "https://cdn.example.com/fav.png",
    );
  });

  it("falls back to Google's public favicon service when no <link> icon tag is present", () => {
    expect(extractFavicon("<html></html>", "https://example.com/page")).toBe(
      "https://www.google.com/s2/favicons?domain=example.com&sz=32",
    );
  });
});

describe("resolveItemImage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves image_url and favicon_url from a successful fetch", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      text: async () =>
        `<meta property="og:image" content="https://example.com/cover.png"><link rel="icon" href="/f.ico">`,
    });

    const result = await resolveItemImage("https://example.com/article");
    expect(result.image_url).toBe("https://example.com/cover.png");
    expect(result.favicon_url).toBe("https://example.com/f.ico");
  });

  it("returns {} and does not throw on a non-OK response", async () => {
    (fetch as any).mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(
      resolveItemImage("https://example.com/broken"),
    ).resolves.toEqual({});
  });

  it("returns {} and does not throw when fetch rejects (network error/timeout)", async () => {
    (fetch as any).mockRejectedValueOnce(new Error("network down"));
    await expect(
      resolveItemImage("https://example.com/unreachable"),
    ).resolves.toEqual({});
  });
});
