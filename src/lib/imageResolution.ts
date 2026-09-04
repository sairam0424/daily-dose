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
    return new URL(maybeRelative, baseUrl).toString();
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
    if (contentMatch?.[1]) return contentMatch[1];
  }
  return undefined;
}

/** Priority-ordered OG-image extraction (verified recipe): og:image, then
 * twitter:image, then twitter:image:src - first match wins. Relative URLs
 * are resolved against the source page's own URL. */
export function extractOgImage(
  html: string,
  pageUrl: string,
): string | undefined {
  const raw =
    extractMetaContent(html, "property", "og:image") ??
    extractMetaContent(html, "name", "twitter:image") ??
    extractMetaContent(html, "name", "twitter:image:src");
  return raw ? resolveUrl(raw, pageUrl) : undefined;
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
      return {};
    }

    const html = await response.text();
    return {
      image_url: extractOgImage(html, pageUrl),
      favicon_url: extractFavicon(html, pageUrl),
    };
  } catch (error) {
    console.warn(
      `[imageResolution] Failed to fetch/parse ${pageUrl} for image enrichment (${(error as Error).message}) - skipping image/favicon for this item only.`,
    );
    return {};
  } finally {
    clearTimeout(timeout);
  }
}
