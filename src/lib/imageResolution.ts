/**
 * src/lib/imageResolution.ts
 *
 * Per-item image/favicon enrichment for the digest — DECORATIVE, NOT CORE
 * DATA. A failed fetch here is caught and logged, never thrown, per the
 * deliberate, documented exception to AGENTS.md's fail-loud rule (that
 * rule governs core content). extractOgImage/extractFavicon are pure and
 * network-free - they only ever operate on an HTML string already
 * fetched elsewhere.
 */

const FETCH_TIMEOUT_MS = 5000;
const IMAGE_FETCH_HEADERS = { "User-Agent": "daily-dose-pipeline" };

function resolveUrl(
  maybeRelative: string,
  baseUrl: string,
): string | undefined {
  try {
    const url = new URL(maybeRelative, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

/** Extracts one attribute's value from the first <meta> tag matching
 * name/property=attrValue, tolerant of either attribute order. */
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

/** Priority-ordered OG-image extraction (verified recipe): og:image, then
 * twitter:image, then twitter:image:src - tries each candidate in order,
 * skipping any that's missing, unresolvable, or a generic/site-wide image
 * (see isGenericImageUrl). Relative URLs are resolved against the source
 * page's own URL. */
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

function extractFaviconLinkHref(html: string): string | undefined {
  const linkTagRe = /<link\s+[^>]*>/gi;
  for (const tagMatch of html.matchAll(linkTagRe)) {
    const tag = tagMatch[0];
    if (!/rel\s*=\s*["'](?:shortcut icon|icon)["']/i.test(tag)) continue;
    const hrefMatch = tag.match(/href\s*=\s*["']([^"']+)["']/i);
    if (hrefMatch?.[1]) return hrefMatch[1];
  }
  return undefined;
}

/** Two-tier favicon resolution (verified recipe): parse a real <link
 * rel="icon"|"shortcut icon"> from the fetched HTML first; if absent,
 * fall back to Google's public favicon service keyed by hostname. */
export function extractFavicon(
  html: string,
  pageUrl: string,
): string | undefined {
  const rawHref = extractFaviconLinkHref(html);
  if (rawHref) {
    const resolved = resolveUrl(rawHref, pageUrl);
    if (resolved) return resolved;
  }
  try {
    const hostname = new URL(pageUrl).hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`;
  } catch {
    return undefined;
  }
}

const AR5IV_BASE_URL = "https://ar5iv.labs.arxiv.org/html/";

export function extractFirstFigureImage(
  html: string,
  baseUrl: string,
): string | undefined {
  const figureMatch = html.match(
    /<figure[^>]*>[\s\S]*?<img\s+[^>]*\bsrc\s*=\s*["']([^"']+)["'][\s\S]*?<\/figure>/i,
  );
  if (!figureMatch?.[1]) return undefined;
  // ar5iv page URLs (e.g. ".../html/2609.04190") have no trailing slash, but
  // relative figure srcs are meant to resolve as if that ID were a directory -
  // without normalizing, the WHATWG URL resolver treats "2609.04190" as a file
  // segment and drops it entirely.
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return resolveUrl(figureMatch[1], normalizedBase);
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

export interface ResolvedImage {
  image_url?: string;
  favicon_url?: string;
}

/**
 * Fetches pageUrl's HTML and extracts an image/favicon. Bounded by a 5s
 * AbortController timeout (none existed anywhere in this codebase before
 * this function). Never throws - any failure is caught, warned, and
 * resolves to {}, matching this phase's documented enrichment-vs-core-data
 * exception.
 */
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
      const fallback = arxivId
        ? await resolveArxivFigureImage(arxivId)
        : undefined;
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
    const fallback = arxivId
      ? await resolveArxivFigureImage(arxivId)
      : undefined;
    return { image_url: await verifyImageReachable(fallback) };
  } finally {
    clearTimeout(timeout);
  }
}
