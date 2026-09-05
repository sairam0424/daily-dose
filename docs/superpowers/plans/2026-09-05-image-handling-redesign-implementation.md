# Image Handling Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three real production image bugs — arXiv's identical repeated logo, a whitespace-in-`og:image` 404, and CSS crop-cutting non-16:9 images — by sanitizing scraped URLs, rejecting generic images, adding an arXiv-specific `ar5iv` figure fallback, and switching the card image CSS to letterbox instead of crop.

**Architecture:** All four fixes live in the existing decorative image-enrichment layer (`src/lib/imageResolution.ts`, wired through `scripts/pipeline.ts`'s existing `mapWithConcurrency` batch) plus one CSS rule in `StoryCard.astro`. Nothing here touches the LLM/curation path.

**Tech Stack:** TypeScript, Vitest (fetch fully mocked, never real), Astro/CSS.

**Spec:** `docs/superpowers/specs/2026-09-05-image-handling-redesign-design.md` (merged to `main` at commit `46a34cd`, PR #72) — this plan argues from that spec; read both. One deliberate refinement of the spec's illustrative code: the spec's `extractOgImage` sketch only checked the FIRST candidate (`og:image` ?? `twitter:image` ?? `twitter:image:src`) for genericness, which would give up entirely if `og:image` exists but is generic even when `twitter:image` might be a real, good image. Task 1 below instead tries each candidate in priority order, skipping any that's missing, unresolvable, or generic, until one succeeds — same intent (reject generic images), corrected fallback behavior.

**Mid-execution amendment (recorded ruling, added after Task 1 landed):** Task 1's implementer and the controller both independently confirmed, against the real live `statichost.eu` page, that the spec's motivating Statichost bug was misdiagnosed — the real `content` attribute is `"/%20preview.png"`, a literal `%20` already baked into the source site's own HTML, not a whitespace character our scraper mishandles. `.trim()` (Task 1) is still real, valid, independently-justified defensive code (matches documented best practice for a real bug *class*), but does not close this specific site's own bug — none of the originally-planned 4 tasks did. Confirmed with the user via `AskUserQuestion`: add a new Task 3 (below) that verifies a resolved candidate image URL is actually reachable (HTTP 200) before accepting it, closing this gap generally rather than special-casing one site. Tasks 3-5 below were Tasks 3-4 before this amendment; renumbered.

## Global Constraints

- Never make a real network call from any test — `fetch` stays fully mocked in `tests/imageResolution.test.ts`, exactly as today.
- `GENERIC_IMAGE_URL_PATTERN` — `/\b(logo|favicon|sprite|wordmark|placeholder|badge|avatar|icon)\b/i` — exact value from the spec, deliberately including `logo`/`avatar` even though this can reject a legitimate single-use company logo (documented tradeoff in the spec, not a bug to "fix").
- `resolveArxivFigureImage`'s ar5iv URL must use the **raw** arXiv id (e.g. `2609.04190` or old-style `cs.AI/0601001`) — never `scripts/pipeline.ts`'s filename-sanitized `sanitizeArxivId` version.
- The "no image" case renders nothing (no placeholder, no icon) — this already works via `StoryCard.astro`'s existing `{entry.data.image_url && (...)}` conditional; no task here changes that conditional.
- No AI-generated per-item images, no perceptual/fuzzy image hashing, no templated/screenshot-generated placeholder cards — all explicitly out of scope per the spec.
- Ship as **one branch, one PR**, atomic commits per task in the order below (this is one cohesive fix, not independently-shippable phases).
- (Added by the mid-execution amendment) Every accepted `image_url` — from the OG scrape or the arXiv `ar5iv` fallback — must pass a real HTTP HEAD reachability check before being returned; a candidate that 404s, errors, or times out is treated exactly like "no image found," never returned as `image_url`. This adds one more real HTTP request per item that has ANY resolved candidate (not just arXiv items) — still decorative/non-blocking, still bounded by the same `FETCH_TIMEOUT_MS`, still inside the same `mapWithConcurrency` cap of 6.

---

## Before you start

```bash
git checkout main
git pull
git checkout -b fix/image-handling-redesign
```

---

### Task 1: Sanitize scraped URLs and reject generic images

**Files:**
- Modify: `src/lib/imageResolution.ts`
- Test: `tests/imageResolution.test.ts`

**Interfaces:**
- Produces: `isGenericImageUrl(url: string): boolean` (new export). `extractOgImage`'s existing signature is unchanged, but its behavior now trims scraped content and skips generic matches, trying each candidate in order.

- [ ] **Step 1: Write the failing tests**

Add to `tests/imageResolution.test.ts`, right after the existing `describe("extractOgImage", ...)` block's last test (`"returns undefined when baseUrl is malformed..."`) but still inside that same `describe` block, before its closing `});`:

```ts
  it("(regression) trims a leading-whitespace relative content value before resolving (reproduces the real Statichost.eu 404 bug: a leading space survived into the URL as a literal %20)", () => {
    const html = `<meta property="og:image" content=" /preview.png">`;
    expect(extractOgImage(html, "https://www.statichost.eu/")).toBe(
      "https://www.statichost.eu/preview.png",
    );
  });

  it("rejects a generic/blocklisted image (arXiv's real, confirmed repeated site logo) and returns undefined", () => {
    const html = `<meta property="og:image" content="https://arxiv.org/static/browse/0.3.4/images/arxiv-logo-fb.png">`;
    expect(extractOgImage(html, "https://arxiv.org/abs/2609.04190")).toBeUndefined();
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
```

Then add a new top-level `describe` block for the new export, anywhere after the `extractOgImage` block:

```ts
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
    expect(isGenericImageUrl("https://example.com/sprite-sheet.png")).toBe(true);
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
```

Add the new import at the top of the file:

```ts
import {
  extractOgImage,
  extractFavicon,
  isGenericImageUrl,
  resolveItemImage,
} from "../src/lib/imageResolution.js";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/imageResolution.test.ts`

Expected: the regression test fails (whitespace survives into the URL, producing `https://www.statichost.eu/%20preview.png` not the expected clean URL); the "rejects a generic" test fails (no rejection logic exists yet, so it returns the arxiv-logo URL unchanged instead of `undefined`); the "falls through" test fails (og:image wins unconditionally today); every `isGenericImageUrl` test fails (the function doesn't exist — import error).

- [ ] **Step 3: Implement the fix**

In `src/lib/imageResolution.ts`, change `extractMetaContent` to trim (and skip empty-after-trim) values:

```ts
function extractMetaContent(
  html: string,
  attrName: "property" | "name",
  attrValue: string,
): string | undefined {
  const metaTagRe = /<meta\s+[^>]*>/gi;
  const nameRe = new RegExp(`${attrName}\\s*=\\s*["']${attrValue}["']`, "i");
  for (const tagMatch of html.matchAll(metaTagRe)) {
    const tag = tagMatch[0];
    if (!nameRe.test(tag)) continue;
    const contentMatch = tag.match(/content\s*=\s*["']([^"']*)["']/i);
    if (contentMatch?.[1]) {
      const trimmed = contentMatch[1].trim();
      if (trimmed) return trimmed;
    }
  }
  return undefined;
}
```

Add the new constant and function (place after `resolveUrl`, before `extractMetaContent` or anywhere at module scope):

```ts
/** Cheap, verified-real-world heuristic (not perceptual hashing) for
 * rejecting a scraped image that is near-certainly a site-wide generic
 * asset rather than a genuinely per-item image: arXiv's shared logo,
 * favicons, sprites, tracking pixels, etc. Deliberate tradeoff, not an
 * oversight: this also rejects a legitimate single-use "company's own
 * press logo as their OG image" case - accepted because the far more
 * common and damaging failure mode is a generic image being IDENTICALLY
 * repeated across many different items (arXiv's case), which this same
 * keyword set reliably catches. */
export const GENERIC_IMAGE_URL_PATTERN =
  /\b(logo|favicon|sprite|wordmark|placeholder|badge|avatar|icon)\b/i;

export function isGenericImageUrl(url: string): boolean {
  return GENERIC_IMAGE_URL_PATTERN.test(url);
}
```

Replace `extractOgImage` to try each candidate in priority order, skipping any that's missing, unresolvable, or generic:

```ts
export function extractOgImage(
  html: string,
  pageUrl: string,
): string | undefined {
  const candidates = [
    extractMetaContent(html, "property", "og:image"),
    extractMetaContent(html, "name", "twitter:image"),
    extractMetaContent(html, "name", "twitter:image:src"),
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const resolved = resolveUrl(raw, pageUrl);
    if (resolved && !isGenericImageUrl(resolved)) return resolved;
  }
  return undefined;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/imageResolution.test.ts`

Expected: all tests in this file pass, including the new ones. Double-check the pre-existing tests still pass unmodified (e.g. `"prefers og:image over twitter:image when both are present"` — still true, since og:image there isn't generic, so the loop returns it on the first iteration).

- [ ] **Step 5: Commit**

```bash
git add src/lib/imageResolution.ts tests/imageResolution.test.ts
git commit -m "fix(images): sanitize scraped URLs and reject generic images"
```

---

### Task 2: arXiv-specific `ar5iv` figure fallback

**Files:**
- Modify: `src/lib/imageResolution.ts`
- Test: `tests/imageResolution.test.ts`

**Interfaces:**
- Consumes: `isGenericImageUrl`, `resolveUrl` (Task 1, both already in this file).
- Produces: `extractFirstFigureImage(html, baseUrl): string | undefined` (exported, pure). `resolveArxivFigureImage(arxivId): Promise<string | undefined>` (exported, async, network). `resolveItemImage(pageUrl, arxivId?)` gains an optional second parameter — Task 3 (below) wraps this same function's final output; Task 4 relies on this exact signature.

- [ ] **Step 1: Write the failing tests**

Add to `tests/imageResolution.test.ts`, as new top-level `describe` blocks (anywhere after the `isGenericImageUrl` block added in Task 1):

```ts
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
      text: async () => `<figure><img src="/html/2609.04190/fig1.png"></figure>`,
    });

    const result = await resolveArxivFigureImage("2609.04190");
    expect(result).toBe("https://ar5iv.labs.arxiv.org/html/2609.04190/fig1.png");
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
    await expect(resolveArxivFigureImage("2609.04190")).resolves.toBeUndefined();
  });

  it("returns undefined and does not throw when fetch rejects", async () => {
    (fetch as any).mockRejectedValueOnce(new Error("network down"));
    await expect(resolveArxivFigureImage("2609.04190")).resolves.toBeUndefined();
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
        text: async () => `<figure><img src="/html/2609.04190/fig1.png"></figure>`,
      });

    const result = await resolveItemImage(
      "https://arxiv.org/abs/2609.04190",
      "2609.04190",
    );
    expect(result.image_url).toBe(
      "https://ar5iv.labs.arxiv.org/html/2609.04190/fig1.png",
    );
  });

  it("does not attempt the arXiv fallback when no arxivId is given", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      text: async () =>
        `<meta property="og:image" content="https://arxiv.org/static/browse/0.3.4/images/arxiv-logo-fb.png">`,
    });

    const result = await resolveItemImage("https://arxiv.org/abs/2609.04190");
    expect(result.image_url).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("still returns undefined image_url when the arXiv fallback also finds nothing", async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<meta property="og:image" content="https://arxiv.org/static/browse/0.3.4/images/arxiv-logo-fb.png">`,
      })
      .mockResolvedValueOnce({ ok: true, text: async () => "<html></html>" });

    const result = await resolveItemImage(
      "https://arxiv.org/abs/2609.04190",
      "2609.04190",
    );
    expect(result.image_url).toBeUndefined();
  });
});
```

Update the import at the top of the file to add the two new names:

```ts
import {
  extractOgImage,
  extractFavicon,
  extractFirstFigureImage,
  isGenericImageUrl,
  resolveArxivFigureImage,
  resolveItemImage,
} from "../src/lib/imageResolution.js";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/imageResolution.test.ts`

Expected: all new tests fail — `extractFirstFigureImage`/`resolveArxivFigureImage` don't exist yet (import error), and `resolveItemImage` doesn't yet accept a second argument or attempt any fallback.

- [ ] **Step 3: Implement the fix**

In `src/lib/imageResolution.ts`, add the base URL constant, the pure figure extractor, and the async resolver (place after `extractFavicon`, before `ResolvedImage`):

```ts
const AR5IV_BASE_URL = "https://ar5iv.labs.arxiv.org/html/";

export function extractFirstFigureImage(
  html: string,
  baseUrl: string,
): string | undefined {
  const figureMatch = html.match(
    /<figure[^>]*>[\s\S]*?<img\s+[^>]*\bsrc\s*=\s*["']([^"']+)["'][\s\S]*?<\/figure>/i,
  );
  if (!figureMatch?.[1]) return undefined;
  return resolveUrl(figureMatch[1], baseUrl);
}

/**
 * arXiv-specific fallback: every arXiv abstract page shares the same
 * generic og:image (rejected by isGenericImageUrl), so this fetches the
 * paper's ar5iv HTML rendering and extracts its own first real figure
 * instead - a genuinely per-paper image, not a repeated logo. arxivId
 * must be the REAL arXiv id (e.g. "2609.04190" or the old-style
 * "cs.AI/0601001") - NOT scripts/pipeline.ts's filename-sanitized version
 * (sanitizeArxivId), which replaces the slash old-style IDs need intact.
 */
export async function resolveArxivFigureImage(
  arxivId: string,
): Promise<string | undefined> {
  const ar5ivUrl = `${AR5IV_BASE_URL}${arxivId}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(ar5ivUrl, {
      signal: controller.signal,
      headers: IMAGE_FETCH_HEADERS,
    });

    if (!response.ok) {
      console.warn(
        `[imageResolution] Non-OK response (${response.status}) fetching ${ar5ivUrl} for arXiv figure enrichment - skipping.`,
      );
      return undefined;
    }

    const html = await response.text();
    return extractFirstFigureImage(html, ar5ivUrl);
  } catch (error) {
    console.warn(
      `[imageResolution] Failed to fetch/parse ${ar5ivUrl} for arXiv figure enrichment (${(error as Error).message}) - skipping.`,
    );
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}
```

Replace `resolveItemImage` with the version that accepts an optional `arxivId` and tries the fallback whenever the primary path yields no image:

```ts
export async function resolveItemImage(
  pageUrl: string,
  arxivId?: string,
): Promise<ResolvedImage> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(pageUrl, {
      signal: controller.signal,
      headers: IMAGE_FETCH_HEADERS,
    });

    if (!response.ok) {
      console.warn(
        `[imageResolution] Non-OK response (${response.status}) fetching ${pageUrl} for image enrichment - skipping image/favicon for this item only.`,
      );
      return arxivId
        ? { image_url: await resolveArxivFigureImage(arxivId) }
        : {};
    }

    const html = await response.text();
    const ogImage = extractOgImage(html, pageUrl);
    const image_url =
      ogImage ?? (arxivId ? await resolveArxivFigureImage(arxivId) : undefined);
    return { image_url, favicon_url: extractFavicon(html, pageUrl) };
  } catch (error) {
    console.warn(
      `[imageResolution] Failed to fetch/parse ${pageUrl} for image enrichment (${(error as Error).message}) - skipping image/favicon for this item only.`,
    );
    return arxivId
      ? { image_url: await resolveArxivFigureImage(arxivId) }
      : {};
  } finally {
    clearTimeout(timeout);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/imageResolution.test.ts`

Expected: all tests in this file pass, including every pre-existing `resolveItemImage` test (they call it with one argument; `arxivId` is `undefined`, so the fallback branch is never entered — behavior unchanged for non-arXiv callers).

- [ ] **Step 5: Commit**

```bash
git add src/lib/imageResolution.ts tests/imageResolution.test.ts
git commit -m "feat(images): add arXiv ar5iv figure fallback for the shared-logo problem"
```

---

### Task 3: Verify a resolved image URL is reachable before accepting it

**Files:**
- Modify: `src/lib/imageResolution.ts`
- Test: `tests/imageResolution.test.ts`

**Interfaces:**
- Consumes: nothing new — wraps `resolveItemImage`'s existing internal candidate (from `extractOgImage` or `resolveArxivFigureImage`, Tasks 1-2) right before it's returned.
- Produces: no new exported names required by later tasks; `resolveItemImage`'s public signature (`pageUrl`, optional `arxivId`) is unchanged — only its internal behavior changes (a candidate URL that 404s/errors on a HEAD check is now treated the same as no image found at all).

This task closes the real gap found while executing Task 1: the spec's motivating Statichost.eu bug (a candidate URL that resolves successfully as a string but 404s when actually requested) is not caught by trimming or the generic-image keyword blocklist — those operate on the URL string, not on whether the URL actually serves anything. This task adds a general reachability check that catches this case and any other broken/expired/hotlink-blocked image, not just this one site.

- [ ] **Step 1: Write the failing tests**

Add to `tests/imageResolution.test.ts`, as a new top-level `describe` block (anywhere after the `resolveItemImage` block):

```ts
describe("resolveItemImage rejects an unreachable resolved image", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("(regression) drops a resolved og:image that 404s when actually requested (reproduces the real statichost.eu bug: content=\"/%20preview.png\" resolves to a syntactically valid but dead URL)", async () => {
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<meta property="og:image" content="https://www.statichost.eu/%20preview.png">`,
      })
      .mockResolvedValueOnce({ ok: false, status: 404 }); // the HEAD check on the resolved image URL

    const result = await resolveItemImage("https://www.statichost.eu/");
    expect(result.image_url).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
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
      .mockResolvedValueOnce({ ok: true }); // the HEAD check

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
      .mockRejectedValueOnce(new Error("network down during HEAD check"));

    await expect(
      resolveItemImage("https://example.com/article"),
    ).resolves.toEqual(
      expect.objectContaining({ image_url: undefined }),
    );
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
        text: async () => `<figure><img src="/html/2609.04190/fig1.png"></figure>`,
      })
      .mockResolvedValueOnce({ ok: false, status: 404 }); // the HEAD check on the ar5iv figure

    const result = await resolveItemImage(
      "https://arxiv.org/abs/2609.04190",
      "2609.04190",
    );
    expect(result.image_url).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/imageResolution.test.ts`

Expected: all four new tests fail — today, `resolveItemImage` returns whatever `extractOgImage`/`resolveArxivFigureImage` resolved without any further check, so `fetch` is only called once (or twice for the arXiv case) instead of the expected extra HEAD-check call, and the dead/flaky URLs are returned as real `image_url` values instead of being dropped.

- [ ] **Step 3: Implement the fix**

In `src/lib/imageResolution.ts`, add a reachability-check helper (place after `resolveArxivFigureImage`, before `ResolvedImage`):

```ts
/** Verifies a resolved candidate image URL actually serves something
 * before it's accepted - catches the real, confirmed case where a
 * scraped og:image resolves to a syntactically valid URL that 404s (the
 * statichost.eu bug: their own HTML has content="/%20preview.png", a
 * literal %20 baked into the source, not a whitespace character this
 * file's trimming can fix) as well as any other broken/expired/
 * hotlink-blocked image, generally. A HEAD request, not GET - no need to
 * download the image body just to check it exists. Never throws; a
 * network error during the check is treated the same as "not
 * reachable," matching this file's established fail-safe convention. */
async function isImageUrlReachable(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      headers: IMAGE_FETCH_HEADERS,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyImageReachable(
  candidate: string | undefined,
): Promise<string | undefined> {
  if (!candidate) return undefined;
  return (await isImageUrlReachable(candidate)) ? candidate : undefined;
}
```

Replace `resolveItemImage` to route every candidate through `verifyImageReachable` before returning:

```ts
export async function resolveItemImage(
  pageUrl: string,
  arxivId?: string,
): Promise<ResolvedImage> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(pageUrl, {
      signal: controller.signal,
      headers: IMAGE_FETCH_HEADERS,
    });

    if (!response.ok) {
      console.warn(
        `[imageResolution] Non-OK response (${response.status}) fetching ${pageUrl} for image enrichment - skipping image/favicon for this item only.`,
      );
      const fallback = arxivId ? await resolveArxivFigureImage(arxivId) : undefined;
      return { image_url: await verifyImageReachable(fallback) };
    }

    const html = await response.text();
    const ogImage = extractOgImage(html, pageUrl);
    const candidate =
      ogImage ?? (arxivId ? await resolveArxivFigureImage(arxivId) : undefined);
    const image_url = await verifyImageReachable(candidate);
    return { image_url, favicon_url: extractFavicon(html, pageUrl) };
  } catch (error) {
    console.warn(
      `[imageResolution] Failed to fetch/parse ${pageUrl} for image enrichment (${(error as Error).message}) - skipping image/favicon for this item only.`,
    );
    const fallback = arxivId ? await resolveArxivFigureImage(arxivId) : undefined;
    return { image_url: await verifyImageReachable(fallback) };
  } finally {
    clearTimeout(timeout);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/imageResolution.test.ts`

Expected: all tests in this file pass, including every pre-existing test — a pre-existing test like `"resolves image_url and favicon_url from a successful fetch"` only ever mocks ONE `fetch` call today; since `mockResolvedValueOnce` is only set up once, the SECOND call (the new HEAD check) falls through to the mock's default (`undefined`) return, which `await fetch(...)` would then try to call `.ok` on `undefined` and throw — check each pre-existing test in this file that calls `resolveItemImage` and add a second `.mockResolvedValueOnce({ ok: true })` (for the HEAD check) wherever the test expects a real `image_url` to survive; tests that already expect `image_url` to be absent (e.g. non-OK primary response, network error, no og:image tag at all) need no change, since `verifyImageReachable` short-circuits on `undefined` without calling `fetch` again.

- [ ] **Step 5: Commit**

```bash
git add src/lib/imageResolution.ts tests/imageResolution.test.ts
git commit -m "fix(images): verify a resolved image URL is reachable before accepting it"
```

---

### Task 4: Wire `arxivId` through `scripts/pipeline.ts`

**Files:**
- Modify: `scripts/pipeline.ts`
- Test: `tests/pipeline.test.ts`

**Interfaces:**
- Consumes: `resolveItemImage(url, arxivId?)` (Task 2).
- Produces: `buildImageableItems`'s return type gains an optional `arxivId` field, populated only for arXiv entries.

- [ ] **Step 1: Write the failing test**

Add to `tests/pipeline.test.ts`, inside the existing `describe("buildImageableItems", ...)` block, after its second (last) existing test:

```ts
  it("includes arxivId only for arxiv entries, using the real (unsanitized) arXiv id", () => {
    const paper: RawArxivPaper = {
      title: "A real paper",
      url: "https://arxiv.org/abs/2609.04190",
      arxivId: "2609.04190",
      publishedDate: "2026-09-01T00:00:00Z",
      authors: ["Someone"],
      categories: ["cs.AI"],
      summary: "An abstract.",
    };

    const items = buildImageableItems([lowEngagementStory], [paper], [], []);
    const arxivItem = items.find((item) => item.id.startsWith("arxiv-"));
    const hnItem = items.find((item) => item.id.startsWith("hn-"));

    expect(arxivItem?.arxivId).toBe("2609.04190");
    expect(hnItem?.arxivId).toBeUndefined();
  });

  it("keeps arxivId as the real id even when it needs sanitizing for the item's own id/filename (old-style id with a slash)", () => {
    const oldStylePaper: RawArxivPaper = {
      title: "An old-style-id paper",
      url: "https://arxiv.org/abs/cs.AI/0601001",
      arxivId: "cs.AI/0601001",
      publishedDate: "2006-01-01T00:00:00Z",
      authors: ["Someone"],
      categories: ["cs.AI"],
      summary: "An abstract.",
    };

    const items = buildImageableItems([], [oldStylePaper], [], []);
    const arxivItem = items.find((item) => item.id.startsWith("arxiv-"));

    expect(arxivItem?.id).toBe("arxiv-cs.AI-0601001");
    expect(arxivItem?.arxivId).toBe("cs.AI/0601001");
  });
```

Add the `RawArxivPaper` type import at the top of the file:

```ts
import {
  scoreStoryPlaceholder,
  scoreGithubPlaceholder,
  scoreDevtoPlaceholder,
  type RawHnStory,
  type RawGithubRepo,
  type RawDevtoArticle,
} from "../src/lib/curation.js";
import type { RawArxivPaper } from "../scripts/pipeline.js";
```

(`RawArxivPaper` is already exported from `scripts/pipeline.ts` via its existing `export type { RawHnStory, RawArxivPaper, RawGithubRepo, RawDevtoArticle };` line — no export change needed.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/pipeline.test.ts`

Expected: both new tests fail — `arxivItem?.arxivId` is `undefined` in the first test (the field doesn't exist yet on the returned objects).

- [ ] **Step 3: Implement the fix**

Replace `buildImageableItems`:

```ts
export function buildImageableItems(
  stories: RawHnStory[],
  papers: RawArxivPaper[],
  repos: RawGithubRepo[],
  articles: RawDevtoArticle[],
): Array<{ id: string; url: string; arxivId?: string }> {
  return [
    ...stories.map((story) => ({ id: `hn-${story.hn_id}`, url: story.url })),
    ...papers.map((paper) => ({
      id: `arxiv-${sanitizeArxivId(paper.arxivId)}`,
      url: paper.url,
      arxivId: paper.arxivId,
    })),
    ...repos.map((repo) => ({
      id: `github-${sanitizeGithubId(repo.fullName)}`,
      url: repo.url,
    })),
    ...articles
      .filter((article) => !article.coverImage)
      .map((article) => ({ id: `devto-${article.id}`, url: article.url })),
  ];
}
```

Update the batched resolution call inside `main()` to pass `arxivId` through:

```ts
  const imageableItems = buildImageableItems(stories, papers, repos, articles);
  const resolvedImages = new Map<string, ResolvedImage>(
    await mapWithConcurrency(
      imageableItems,
      6,
      async ({ id, url, arxivId }) =>
        [id, await resolveItemImage(url, arxivId)] as const,
    ),
  );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/pipeline.test.ts`

Expected: all tests in this file pass, including the two new ones.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add scripts/pipeline.ts tests/pipeline.test.ts
git commit -m "feat(pipeline): pass arxivId through to resolveItemImage"
```

---

### Task 5: CSS fix — letterbox instead of crop

**Files:**
- Modify: `src/components/StoryCard.astro`
- Test: `tests/build-output.test.ts`

**Interfaces:** none new — pure CSS value change.

- [ ] **Step 1: Write the failing test**

In `tests/build-output.test.ts`, locate the existing test `"(Phase 3) defines a hero/feature image slot and a feature-tile grid span for imaged items"` (its `.story-image` assertion is `/\.story-image(\[[^\]]*\])?\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9/`). Add two new assertions to that SAME test, right after the existing `expect(style).toMatch(...)` call for `.story-image`'s aspect-ratio:

```ts
    expect(style).toMatch(
      /\.story-image(\[[^\]]*\])?\s*\{[^}]*object-fit:\s*contain/,
    );
    expect(style).toMatch(
      /\.story-image(\[[^\]]*\])?\s*\{[^}]*background:\s*var\(--bg-surface\)/,
    );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && npm test -- tests/build-output.test.ts -t "hero/feature image slot"`

Expected: fails — the current CSS has `object-fit: cover`, not `contain`, and no `background` property at all.

- [ ] **Step 3: Implement the fix**

In `src/components/StoryCard.astro`, replace the `.story-image` rule:

```css
  .story-image {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: contain;
    background: var(--bg-surface);
    border-radius: 6px;
    margin-bottom: 0.6rem;
  }
```

(`.lead-story .story-image { aspect-ratio: 16 / 8; }` stays unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && npm test -- tests/build-output.test.ts -t "hero/feature image slot"`

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/components/StoryCard.astro tests/build-output.test.ts
git commit -m "fix(story-card): letterbox story images instead of cropping them"
```

---

### Task 6: Whole-feature verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm test`

Expected: all tests pass, including every test added in Tasks 1-4.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`

Expected: succeeds.

- [ ] **Step 4: Confirm no real network call happened anywhere in the test run**

Re-read the `npm test` output from Step 1 — `fetch` stays fully mocked in `tests/imageResolution.test.ts`; `scripts/pipeline.ts`'s `main()` is never invoked by any test.

- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin fix/image-handling-redesign
gh pr create --title "fix: redesign image handling (arXiv logo, URL sanitization, crop)" --body-file /tmp/pr-body-image-handling-redesign.md
```

(Write the PR body to `/tmp/pr-body-image-handling-redesign.md` first — summarize the four tasks, link the spec, and note this is presentation/decorative-layer only, no LLM cost impact.)

---

## Self-Review Notes (for whoever executes this plan)

- **Spec coverage:** all four parts of the spec (sanitize, reject-generic, arXiv `ar5iv` fallback, CSS letterbox) map to Tasks 1-4. The "no image → show nothing" requirement needs no task since it's already correct in `StoryCard.astro`'s existing conditional — confirmed explicitly in the spec's own text, not silently skipped.
- **Type consistency:** `buildImageableItems`'s new `arxivId?: string` field (Task 4) matches `resolveItemImage`'s new `arxivId?: string` second parameter (Task 2) and `resolveArxivFigureImage`'s `arxivId: string` parameter (Task 2) — verified consistent across all three.
- **Deviation from the spec's illustrative code, recorded here rather than silently:** Task 1's `extractOgImage` tries every candidate in priority order (see the plan header's note) rather than the spec's simpler single-candidate sketch — a strict improvement toward the spec's own stated intent (prefer a real image over showing nothing, when one exists among the OG/Twitter candidates).
