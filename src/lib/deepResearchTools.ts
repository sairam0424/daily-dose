/**
 * src/lib/deepResearchTools.ts
 *
 * Real, read-only, source-scoped tools for scripts/deepResearchItem.ts's
 * turn loop. Every fetch target is derived from the item's own known url/
 * hn_id - never a model-controlled arbitrary URL or repo. See
 * docs/superpowers/specs/2026-09-09-deep-research-item-design.md.
 */
export type ToolResult =
  { ok: true; content: string } | { ok: false; error: string };

const FETCH_TIMEOUT_MS = 5000;
const TOOL_FETCH_HEADERS = { "User-Agent": "daily-dose-deep-research" };

function stripHtmlTags(text: string): string {
  return text.replace(/<[^>]*>/g, "").trim();
}

const HN_ITEM_URL = "https://hn.algolia.com/api/v1/items/";
const MAX_COMMENTS = 8;
const MAX_COMMENT_CHARS = 400;

interface HnAlgoliaItem {
  id: number;
  title?: string;
  url?: string;
  points?: number;
  children?: HnAlgoliaItem[];
  text?: string;
  author?: string;
}

export async function fetchHnThread(hnId: number): Promise<ToolResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${HN_ITEM_URL}${hnId}`, {
      signal: controller.signal,
      headers: TOOL_FETCH_HEADERS,
    });
    if (!response.ok) {
      return {
        ok: false,
        error: `HN Algolia item request failed for ${hnId}: ${response.status} ${response.statusText}`,
      };
    }
    const item = (await response.json()) as HnAlgoliaItem;
    const comments = (item.children ?? [])
      .filter((child): child is HnAlgoliaItem & { text: string } =>
        Boolean(child.text),
      )
      .slice(0, MAX_COMMENTS)
      .map(
        (child) =>
          `${child.author ?? "unknown"}: ${stripHtmlTags(child.text).slice(0, MAX_COMMENT_CHARS)}`,
      )
      .join("\n");
    const content = [
      `Title: ${item.title ?? "(no title)"}`,
      item.url ? `Linked URL: ${item.url}` : null,
      `Points: ${item.points ?? 0}`,
      comments ? `Top comments:\n${comments}` : "No comments available.",
    ]
      .filter((line): line is string => line !== null)
      .join("\n");
    return { ok: true, content };
  } catch (error) {
    return {
      ok: false,
      error: `Failed to fetch/parse HN thread ${hnId}: ${(error as Error).message}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

const AR5IV_BASE_URL = "https://ar5iv.labs.arxiv.org/html/";
const MAX_ARXIV_CHARS = 6000;

export async function fetchArxivFulltext(arxivId: string): Promise<ToolResult> {
  const url = `${AR5IV_BASE_URL}${arxivId}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      return {
        ok: false,
        error: `ar5iv request failed for ${arxivId}: ${response.status} ${response.statusText}`,
      };
    }
    const html = await response.text();
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const bodyHtml = bodyMatch ? bodyMatch[1] : html;
    const text = bodyHtml
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return { ok: true, content: text.slice(0, MAX_ARXIV_CHARS) };
  } catch (error) {
    return {
      ok: false,
      error: `Failed to fetch/parse ar5iv page for ${arxivId}: ${(error as Error).message}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}
