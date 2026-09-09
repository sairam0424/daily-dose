import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractOgImage,
  extractFavicon,
  extractFirstFigureImage,
  isGenericImageUrl,
  resolveArxivFigureImage,
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

  it("rejects javascript: scheme URLs", () => {
    const html = `<meta property="og:image" content="javascript:alert('xss')">`;
    expect(extractOgImage(html, "https://example.com/article")).toBeUndefined();
  });

  it("rejects data: scheme URLs", () => {
    const html = `<meta property="og:image" content="data:image/png;base64,iVBORw0KGgo=">`;
    expect(extractOgImage(html, "https://example.com/article")).toBeUndefined();
  });

  it("returns undefined when baseUrl is malformed and URL constructor throws", () => {
    // Pass a truly malformed baseUrl that will cause URL constructor to throw
    const html = `<meta property="og:image" content="https://image.example.com/cover.png">`;
    expect(extractOgImage(html, "not a valid url at all")).toBeUndefined();
  });

  it("(regression) trims a leading-whitespace relative content value before resolving (reproduces the real Statichost.eu 404 bug: a leading space survived into the URL as a literal %20)", () => {
    const html = `<meta property="og:image" content=" /preview.png">`;
    expect(extractOgImage(html, "https://www.statichost.eu/")).toBe(
      "https://www.statichost.eu/preview.png",
    );
  });

  it("rejects a generic/blocklisted image (arXiv's real, confirmed repeated site logo) and returns undefined", () => {
    const html = `<meta property="og:image" content="https://arxiv.org/static/browse/0.3.4/images/arxiv-logo-fb.png">`;
    expect(
      extractOgImage(html, "https://arxiv.org/abs/2609.04190"),
    ).toBeUndefined();
  });

  it("falls through to twitter:image when og:image is present but rejected as generic", () => {
    const html = `
      <meta property="og:image" content="https://example.com/site-logo.png">
      <meta name="twitter:image" content="https://example.com/real-cover.png">
    `;
    expect(extractOgImage(html, "https://example.com/article")).toBe(
      "https://example.com/real-cover.png",
    );
  });
});

describe("isGenericImageUrl", () => {
  it("rejects arXiv's known generic site-wide logo URL", () => {
    expect(
      isGenericImageUrl(
        "https://arxiv.org/static/browse/0.3.4/images/arxiv-logo-fb.png",
      ),
    ).toBe(true);
  });

  it("rejects URLs containing favicon/sprite/placeholder/badge/wordmark/avatar/icon", () => {
    expect(isGenericImageUrl("https://example.com/favicon.png")).toBe(true);
    expect(isGenericImageUrl("https://example.com/sprite-sheet.png")).toBe(
      true,
    );
    expect(isGenericImageUrl("https://example.com/placeholder.jpg")).toBe(true);
    expect(isGenericImageUrl("https://example.com/badge.svg")).toBe(true);
    expect(isGenericImageUrl("https://example.com/wordmark.png")).toBe(true);
    expect(isGenericImageUrl("https://example.com/avatar.png")).toBe(true);
    expect(isGenericImageUrl("https://example.com/icon-192.png")).toBe(true);
  });

  it("accepts a genuinely per-item GitHub opengraph card URL", () => {
    expect(
      isGenericImageUrl("https://opengraph.githubassets.com/abc123/owner/repo"),
    ).toBe(false);
  });

  it("accepts a genuinely per-item Dev.to cover-image proxy URL", () => {
    expect(
      isGenericImageUrl(
        "https://media2.dev.to/dynamic/image/width=1000,height=420,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.us-east-2.amazonaws.com%2Fuploads%2Farticles%2Fabc.jpg",
      ),
    ).toBe(false);
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

  it("falls back to Google favicon when link href resolves to non-http(s) scheme", () => {
    const html = `<link rel="icon" href="file:///etc/passwd">`;
    expect(extractFavicon(html, "https://example.com/page")).toBe(
      "https://www.google.com/s2/favicons?domain=example.com&sz=32",
    );
  });

  it("returns undefined when pageUrl is malformed and cannot be parsed", () => {
    const html = `<html></html>`;
    expect(extractFavicon(html, "ht!tp://in valid")).toBeUndefined();
  });

  it("rejects javascript: scheme in favicon link href and falls back to Google", () => {
    const html = `<link rel="icon" href="javascript:alert('xss')">`;
    expect(extractFavicon(html, "https://example.com/page")).toBe(
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
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<meta property="og:image" content="https://example.com/cover.png"><link rel="icon" href="/f.ico">`,
      })
      .mockResolvedValueOnce({ ok: true, headers: { get: () => null } }) // the image HEAD check
      .mockResolvedValueOnce({ ok: true, headers: { get: () => null } }); // the favicon HEAD check

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

  it("calls fetch with an abort signal and the expected User-Agent header", async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => "<html></html>",
      })
      .mockResolvedValueOnce({ ok: true, headers: { get: () => null } }); // the favicon (Google fallback) HEAD check

    await resolveItemImage("https://example.com/article");

    expect(fetch).toHaveBeenCalledWith(
      "https://example.com/article",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        headers: { "User-Agent": "daily-dose-pipeline" },
      }),
    );
  });

  it("(audit fix) rejects a reachable favicon URL that carries a same-origin CORP header", async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `<link rel="icon" href="/f.ico">`,
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) =>
            name === "cross-origin-resource-policy" ? "same-origin" : null,
        },
      }); // the favicon HEAD check, blocked by CORP

    const result = await resolveItemImage("https://example.com/article");
    expect(result.favicon_url).toBeUndefined();
  });

  it("(audit fix) rejects a favicon URL that fails its own reachability check, same as image_url", async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `<link rel="icon" href="/f.ico">`,
      })
      .mockResolvedValueOnce({ ok: false, status: 404 }); // the favicon HEAD check

    const result = await resolveItemImage("https://example.com/article");
    expect(result.favicon_url).toBeUndefined();
  });

  it("(seo fix) rejects an otherwise-reachable image that exceeds the size ceiling via a real Content-Length header", async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          '<meta property="og:image" content="https://example.com/huge.png">',
      }) // the page fetch
      .mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) => (name === "content-length" ? "600000" : null),
        },
      }) // the image HEAD check - 600KB, over the ceiling
      .mockResolvedValueOnce({ ok: true, headers: { get: () => null } }); // the favicon HEAD check

    const result = await resolveItemImage("https://example.com/article");

    expect(result.image_url).toBeUndefined();
  });
});

describe("extractFirstFigureImage", () => {
  it("extracts the first <figure><img src> from HTML", () => {
    const html = `<article><figure><img src="/html/2609.04190/figure1.png" alt="fig1"></figure></article>`;
    expect(
      extractFirstFigureImage(
        html,
        "https://ar5iv.labs.arxiv.org/html/2609.04190",
      ),
    ).toBe("https://ar5iv.labs.arxiv.org/html/2609.04190/figure1.png");
  });

  it("returns undefined when no <figure><img> exists", () => {
    expect(
      extractFirstFigureImage(
        "<html><body>No figures here.</body></html>",
        "https://ar5iv.labs.arxiv.org/html/2609.04190",
      ),
    ).toBeUndefined();
  });

  it("resolves a relative figure image URL against the ar5iv page URL", () => {
    const html = `<figure><img src="figure2.png"></figure>`;
    expect(
      extractFirstFigureImage(
        html,
        "https://ar5iv.labs.arxiv.org/html/2609.04190",
      ),
    ).toBe("https://ar5iv.labs.arxiv.org/html/2609.04190/figure2.png");
  });
});

describe("resolveArxivFigureImage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches the ar5iv rendering and extracts the first figure image", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      text: async () =>
        `<figure><img src="/html/2609.04190/fig1.png"></figure>`,
    });

    const result = await resolveArxivFigureImage("2609.04190");
    expect(result).toBe(
      "https://ar5iv.labs.arxiv.org/html/2609.04190/fig1.png",
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://ar5iv.labs.arxiv.org/html/2609.04190",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        headers: { "User-Agent": "daily-dose-pipeline" },
      }),
    );
  });

  it("returns undefined and does not throw on a non-OK response", async () => {
    (fetch as any).mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(
      resolveArxivFigureImage("2609.04190"),
    ).resolves.toBeUndefined();
  });

  it("returns undefined and does not throw when fetch rejects", async () => {
    (fetch as any).mockRejectedValueOnce(new Error("network down"));
    await expect(
      resolveArxivFigureImage("2609.04190"),
    ).resolves.toBeUndefined();
  });

  it("handles old-style arXiv IDs with a slash correctly in the URL", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      text: async () => "<html></html>",
    });
    await resolveArxivFigureImage("cs.AI/0601001");
    expect(fetch).toHaveBeenCalledWith(
      "https://ar5iv.labs.arxiv.org/html/cs.AI/0601001",
      expect.anything(),
    );
  });
});

describe("resolveItemImage with arxivId fallback", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to the arXiv figure when the primary og:image is rejected as generic", async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<meta property="og:image" content="https://arxiv.org/static/browse/0.3.4/images/arxiv-logo-fb.png">`,
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<figure><img src="/html/2609.04190/fig1.png"></figure>`,
      })
      .mockResolvedValueOnce({ ok: true, headers: { get: () => null } }) // the ar5iv figure's HEAD check
      .mockResolvedValueOnce({ ok: true, headers: { get: () => null } }); // the favicon (Google fallback) HEAD check

    const result = await resolveItemImage(
      "https://arxiv.org/abs/2609.04190",
      "2609.04190",
    );
    expect(result.image_url).toBe(
      "https://ar5iv.labs.arxiv.org/html/2609.04190/fig1.png",
    );
  });

  it("does not attempt the arXiv fallback when no arxivId is given", async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<meta property="og:image" content="https://arxiv.org/static/browse/0.3.4/images/arxiv-logo-fb.png">`,
      })
      .mockResolvedValueOnce({ ok: true, headers: { get: () => null } }); // the favicon (Google fallback) HEAD check

    const result = await resolveItemImage("https://arxiv.org/abs/2609.04190");
    expect(result.image_url).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("still returns undefined image_url when the arXiv fallback also finds nothing", async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<meta property="og:image" content="https://arxiv.org/static/browse/0.3.4/images/arxiv-logo-fb.png">`,
      })
      .mockResolvedValueOnce({ ok: true, text: async () => "<html></html>" })
      .mockResolvedValueOnce({ ok: true, headers: { get: () => null } }); // the favicon (Google fallback) HEAD check

    const result = await resolveItemImage(
      "https://arxiv.org/abs/2609.04190",
      "2609.04190",
    );
    expect(result.image_url).toBeUndefined();
  });
});

describe("resolveItemImage rejects an unreachable resolved image", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('(regression) drops a resolved og:image that 404s when actually requested (reproduces the real statichost.eu bug: content="/%20preview.png" resolves to a syntactically valid but dead URL)', async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<meta property="og:image" content="https://www.statichost.eu/%20preview.png">`,
      })
      .mockResolvedValueOnce({ ok: false, status: 404 }) // the HEAD check on the resolved image URL
      .mockResolvedValueOnce({ ok: true, headers: { get: () => null } }); // the favicon (Google fallback) HEAD check

    const result = await resolveItemImage("https://www.statichost.eu/");
    expect(result.image_url).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "https://www.statichost.eu/%20preview.png",
      expect.objectContaining({ method: "HEAD" }),
    );
  });

  it("keeps a resolved og:image that passes the reachability check", async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<meta property="og:image" content="https://example.com/real-cover.png">`,
      })
      .mockResolvedValueOnce({ ok: true, headers: { get: () => null } }) // the image HEAD check
      .mockResolvedValueOnce({ ok: true, headers: { get: () => null } }); // the favicon (Google fallback) HEAD check

    const result = await resolveItemImage("https://example.com/article");
    expect(result.image_url).toBe("https://example.com/real-cover.png");
  });

  it("treats a reachability-check network error the same as unreachable (drops the image, does not throw)", async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<meta property="og:image" content="https://example.com/flaky.png">`,
      })
      .mockRejectedValueOnce(new Error("network down during HEAD check"))
      .mockResolvedValueOnce({ ok: true, headers: { get: () => null } }); // the favicon (Google fallback) HEAD check

    await expect(
      resolveItemImage("https://example.com/article"),
    ).resolves.toEqual(expect.objectContaining({ image_url: undefined }));
  });

  it("also verifies the arXiv ar5iv fallback figure's reachability before accepting it", async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<meta property="og:image" content="https://arxiv.org/static/browse/0.3.4/images/arxiv-logo-fb.png">`,
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<figure><img src="/html/2609.04190/fig1.png"></figure>`,
      })
      .mockResolvedValueOnce({ ok: false, status: 404 }) // the HEAD check on the ar5iv figure
      .mockResolvedValueOnce({ ok: true, headers: { get: () => null } }); // the favicon (Google fallback) HEAD check

    const result = await resolveItemImage(
      "https://arxiv.org/abs/2609.04190",
      "2609.04190",
    );
    expect(result.image_url).toBeUndefined();
  });
});
