# Image Handling Redesign — Design Spec

## Context

Real production use surfaced three concrete image problems on daily-dose's story cards:

1. **arXiv items all show the identical generic image.** Every arXiv abstract page's `og:image` is the same site-wide logo (`https://arxiv.org/static/browse/0.3.4/images/arxiv-logo-fb.png`) — confirmed against a real pipeline run where all 5 arXiv items resolved to this exact URL. Several arXiv items appearing together makes the digest look broken/repetitive.
2. **A scraped `og:image` with a leading whitespace character 404s.** Confirmed real case: `Statichost.eu`'s `og:image` meta content had a leading space, which survived into the resolved URL as a literal `%20`, producing `https://www.statichost.eu/%20preview.png` (404) instead of the real `https://www.statichost.eu/preview.png` (200, real PNG).
3. **Non-16:9 real images get cropped awkwardly.** `.story-image`'s `object-fit: cover` crops any image that isn't natively close to 16:9 to fill the box, which can cut off the meaningful part of a real, legitimate source image.

This spec was written after two parallel research passes: (a) direct investigation of `arpitbbhayani/the-daily-diff` (tdd.cat, the project's direct reference) — both its live deployment and GitHub source — and (b) a broader deep-research pass on industry best practices for per-item imagery in content-curation products. Findings from both are grounded below; see the "Research findings" section for evidence and sourcing.

This spec was approved via direct `AskUserQuestion` confirmation: **add the arXiv `ar5iv`-figure fallback** (not just reject-and-show-nothing), and the overall 4-part design below was confirmed as a match to what the user wants.

## Research findings (grounding this design)

**tdd.cat** uses a private, closed-source pipeline that selectively generates AI illustrations for a minority of stories (confirmed: own CDN at `tdd-edge.b-cdn.net/infographics/...`, never hotlinked to sources), and shows **nothing** — no placeholder, no icon — for every story without one (confirmed directly in `EditionPage.astro`'s `hasImage ? 'has-image' : 'no-image'` branching). The actual generation logic isn't in the public repo.

**Broader verified industry practice** (TLDR.tech, GitHub's own engineering blog, and several real open-source scrapers — see deep-research report) says something more directly actionable for us:
- Real, comparable products **scrape real per-item images**; no verified example of AI-generating per-item illustrations for a news/paper digest exists.
- GitHub's own answer to "no good native image" was a **templated auto-generated card** (their `opengraph.githubassets.com` system) — infrastructure we don't have and aren't building here.
- For **arXiv specifically**, a real open-source project (`ai-digest`) bypasses the shared logo by rewriting the URL to arXiv's `ar5iv` HTML rendering and extracting the paper's own first `<figure><img>`.
- Real generic-image rejection uses cheap heuristics — a URL-substring/keyword regex blocklist (`logo|favicon|sprite|placeholder|badge|avatar|icon|...`) — not perceptual image hashing (which was investigated and found unverified as real practice).
- The exact whitespace-in-scraped-content bug is a well-documented, easy-to-miss class — even Next.js's own official OG-image resolver skips this trim step.
- `object-fit: contain` (letterbox, never crops) is the documented, MDN-verified alternative to `cover` (crop-to-fill) for displaying images of unpredictable aspect ratio.

**Decision: no AI-generated per-item images.** No verified precedent for this in any comparable product; it would add real per-item cost/latency to a pipeline that already makes one real paid LLM call per item, for unproven payoff. Explicitly out of scope.

## Real current state (grounds every change below)

- `src/lib/imageResolution.ts` — `extractMetaContent` extracts a meta tag's `content` attribute via regex, with no trimming. `extractOgImage` tries `og:image` → `twitter:image` → `twitter:image:src`, first match wins, resolved via `resolveUrl(raw, pageUrl)`. `resolveItemImage(pageUrl)` fetches one page, returns `{image_url, favicon_url}`, never throws (all failures caught, warned, resolve to `{}`).
- `scripts/pipeline.ts` — `buildImageableItems(stories, papers, repos, articles)` returns `Array<{id, url}>`, one entry per fetchable item (Dev.to items with a native `coverImage` are excluded). `main()` batches all of these through `mapWithConcurrency(imageableItems, 6, ({id, url}) => resolveItemImage(url))` into a `resolvedImages: Map<string, ResolvedImage>`, then each per-source loop does `resolvedImages.get(id) ?? {}`. `sanitizeArxivId(arxivId)` replaces `/`/`:` with `-` for **filenames only** — the raw `paper.arxivId` (e.g. `2609.04190`, or old-style `cs.AI/0601001`) is what a real arXiv/ar5iv URL needs.
- `src/components/StoryCard.astro` — `.story-image { aspect-ratio: 16/9; object-fit: cover; ...}` (lines 107-114), `.lead-story .story-image { aspect-ratio: 16/8; }` (line 116-118). The image `<img>` only renders at all when `entry.data.image_url` is truthy — the "no image" case already renders nothing (no placeholder), matching the agreed design; no change needed to this conditional.

## Design

### 1. Sanitize before resolving (fixes the Statichost 404)

In `extractMetaContent` (`src/lib/imageResolution.ts`), trim the captured `content` value before returning it:

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

The `if (trimmed)` guard (not just `contentMatch?.[1]`) means a `content=""` or whitespace-only value now correctly falls through to the next candidate (`twitter:image`, etc.) instead of being treated as a non-empty match.

### 2. Reject generic/junk images (fixes arXiv's repeated logo, generalizes to any domain)

New exported constant and check in `src/lib/imageResolution.ts`:

```ts
/** Cheap, verified-real-world heuristic (not perceptual hashing - see the
 * design spec's research section) for rejecting a scraped image that is
 * near-certainly a site-wide generic asset rather than a genuinely
 * per-item image: arXiv's shared logo, favicons, sprites, tracking
 * pixels, etc. Deliberate tradeoff, not an oversight: this also rejects a
 * legitimate single-use "company's own press logo as their OG image"
 * case (e.g. a press-release page whose og:image is the company's own
 * logo) - accepted because the far more common and damaging failure mode
 * is a generic image being IDENTICALLY repeated across many different
 * items (arXiv's case), which this same keyword set reliably catches. */
export const GENERIC_IMAGE_URL_PATTERN =
  /\b(logo|favicon|sprite|wordmark|placeholder|badge|avatar|icon)\b/i;

export function isGenericImageUrl(url: string): boolean {
  return GENERIC_IMAGE_URL_PATTERN.test(url);
}
```

`extractOgImage` applies this after resolving the URL, rejecting a match by returning `undefined` (so `resolveItemImage`'s caller sees no image, exactly the same as if scraping had found nothing at all):

```ts
export function extractOgImage(
  html: string,
  pageUrl: string,
): string | undefined {
  const raw =
    extractMetaContent(html, "property", "og:image") ??
    extractMetaContent(html, "name", "twitter:image") ??
    extractMetaContent(html, "name", "twitter:image:src");
  if (!raw) return undefined;
  const resolved = resolveUrl(raw, pageUrl);
  if (!resolved || isGenericImageUrl(resolved)) return undefined;
  return resolved;
}
```

### 3. arXiv-specific `ar5iv` figure fallback

New function in `src/lib/imageResolution.ts`, following the exact same timeout/never-throw/warn-and-return-undefined convention as `resolveItemImage`:

```ts
const AR5IV_BASE_URL = "https://ar5iv.labs.arxiv.org/html/";

function extractFirstFigureImage(
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
 * generic og:image (rejected by isGenericImageUrl above), so this fetches
 * the paper's ar5iv HTML rendering and extracts its own first real
 * figure instead - a genuinely per-paper image, not a repeated logo. Only
 * called when the generic og-image path came up empty (see pipeline.ts
 * wiring). arxivId must be the REAL arXiv id (e.g. "2609.04190" or the
 * old-style "cs.AI/0601001") - NOT scripts/pipeline.ts's
 * filename-sanitized version (sanitizeArxivId), which replaces the slash
 * old-style IDs need to stay intact for a real ar5iv URL.
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

`resolveItemImage` gains an optional second parameter, tried only when the generic og-image path returned nothing:

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
      return arxivId ? { image_url: await resolveArxivFigureImage(arxivId) } : {};
    }

    const html = await response.text();
    const ogImage = extractOgImage(html, pageUrl);
    const image_url = ogImage ?? (arxivId ? await resolveArxivFigureImage(arxivId) : undefined);
    return { image_url, favicon_url: extractFavicon(html, pageUrl) };
  } catch (error) {
    console.warn(
      `[imageResolution] Failed to fetch/parse ${pageUrl} for image enrichment (${(error as Error).message}) - skipping image/favicon for this item only.`,
    );
    return arxivId ? { image_url: await resolveArxivFigureImage(arxivId) } : {};
  } finally {
    clearTimeout(timeout);
  }
}
```

(The non-OK and catch branches also try the arXiv fallback — an arXiv abstract-page fetch failing entirely shouldn't forfeit the chance to still get a real figure from `ar5iv`, a completely separate host/request.)

### 4. Pipeline wiring (`scripts/pipeline.ts`)

`buildImageableItems` gains an optional `arxivId` per entry, populated only for arXiv items, using the **raw** `paper.arxivId` (not `sanitizeArxivId`'s filename-safe version):

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

The batched resolution call passes the new field through:

```ts
const resolvedImages = new Map<string, ResolvedImage>(
  await mapWithConcurrency(
    imageableItems,
    6,
    async ({ id, url, arxivId }) =>
      [id, await resolveItemImage(url, arxivId)] as const,
  ),
);
```

No other change to `main()` — every per-source loop already does `resolvedImages.get(id) ?? {}` unchanged; the arXiv loop's `resolvedImage.image_url` now naturally carries either a real per-paper figure or `undefined` (never the old repeated logo).

### 5. CSS fix (`src/components/StoryCard.astro`)

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

(`object-fit: cover` → `contain`; add `background: var(--bg-surface)` — an existing design token already used elsewhere in this file — to fill the letterbox space instead of leaving it transparent/black. `.lead-story .story-image`'s `aspect-ratio: 16/8` override is unchanged.)

## No-image fallback (confirmed, unchanged)

When `image_url` is `undefined` — because nothing was scraped, or a scraped image was rejected as generic, or (for arXiv) both the OG scrape and the `ar5iv` fallback came up empty — `StoryCard.astro`'s existing `{entry.data.image_url && (<img .../>)}` conditional already renders nothing: no placeholder box, no icon, no broken-image indicator. This matches both tdd.cat's confirmed behavior and the absence of any verified counter-example in the broader research. No code change needed for this case — it already works correctly; the bug was never "no fallback exists," it was "a bad `image_url` (generic or 404) makes it past the point where the same nothing-fallback would have applied."

## Cost/complexity impact

One additional real network fetch per arXiv item, only when the generic OG scrape returns nothing (which, after the generic-image rejection lands, will be **every** arXiv item, since arXiv's OG image always gets rejected as generic). Each fetch shares the same `FETCH_TIMEOUT_MS` (5s) and non-blocking/decorative treatment as the existing OG scrape, run sequentially after it for arXiv items only — worst-case per-arXiv-item wall time roughly doubles (up to ~10s: 5s for the primary fetch, then 5s for the `ar5iv` fallback), still bounded, still inside the same `mapWithConcurrency` cap of 6 so it doesn't block other items' concurrency slots. This does not change the pipeline's real, paid LLM cost (`llmCuration.ts` is untouched) or its concurrency ceiling — only arXiv items' own worst-case enrichment time.

## Testing strategy

- `tests/imageResolution.test.ts` — new tests: `extractMetaContent`/`extractOgImage` trims a leading/trailing-whitespace `content` value and still resolves it correctly (regression test reproducing the exact Statichost bug shape); `isGenericImageUrl` true/false cases (arXiv logo URL, GitHub OG URL, Dev.to proxy URL, a plain unrelated image URL); `extractFirstFigureImage` finds a `<figure><img>` in a synthetic HTML fixture and returns `undefined` when none exists; `resolveArxivFigureImage` mocked-fetch tests (success, non-OK, network error — mirroring `resolveItemImage`'s existing test pattern); `resolveItemImage` with an `arxivId` argument falls back to the arXiv path when the primary fetch's OG image is rejected as generic.
- `tests/pipeline.test.ts` — `buildImageableItems` includes `arxivId` only for arxiv entries (extend the existing test in this file).
- `tests/build-output.test.ts` — CSS assertion updated to check `object-fit: contain` (not `cover`) on `.story-image`, matching this file's existing `readAllPageCss` pattern.

## Out of scope

- AI-generated per-item illustrations (see "Decision" above — explicitly rejected, not deferred silently).
- Perceptual/fuzzy image hashing for generic-image detection (investigated in research, found unverified as real practice — the keyword blocklist is the evidence-grounded choice).
- A templated/auto-generated branded card for items with no image at all (GitHub's own solution to this problem, requiring a screenshot/render pipeline this project doesn't have — not proposed here).
- Blurred-background letterboxing or dynamically-matched aspect-ratio containers for the CSS fix (no verified production example found in research; plain `object-fit: contain` with a solid background is the evidence-grounded choice).
- Per-source icons on story badges (a separate, already-identified, unrelated future item from an earlier session).
