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

import type { DigestItem } from "./digestSchema.js";

const GITHUB_CONTENTS_HEADERS = {
  "User-Agent": "daily-dose-deep-research",
  Accept: "application/vnd.github+json",
};
const MAX_GITHUB_FILE_CHARS = 6000;

export async function fetchGithubRepoFile(
  owner: string,
  repo: string,
  path: string,
): Promise<ToolResult> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: GITHUB_CONTENTS_HEADERS,
    });
    if (!response.ok) {
      return {
        ok: false,
        error: `GitHub contents request failed for ${owner}/${repo}/${path}: ${response.status} ${response.statusText}`,
      };
    }
    const data = (await response.json()) as
      | { type: "file"; content: string; encoding: string }
      | Array<{ name: string; type: string; path: string }>;
    if (Array.isArray(data)) {
      const listing = data
        .map((entry) => `${entry.type === "dir" ? "[dir] " : ""}${entry.path}`)
        .join("\n");
      return {
        ok: true,
        content: `Directory listing for "${path || "/"}":\n${listing}`,
      };
    }
    if (data.encoding !== "base64") {
      return {
        ok: false,
        error: `Unexpected encoding "${data.encoding}" for ${owner}/${repo}/${path}`,
      };
    }
    const decoded = Buffer.from(data.content, "base64").toString("utf-8");
    return { ok: true, content: decoded.slice(0, MAX_GITHUB_FILE_CHARS) };
  } catch (error) {
    return {
      ok: false,
      error: `Failed to fetch/parse ${owner}/${repo}/${path}: ${(error as Error).message}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

const DEVTO_ARTICLES_URL = "https://dev.to/api/articles";
const DEVTO_HEADERS = {
  "User-Agent": "daily-dose-deep-research",
  Accept: "application/vnd.forem.api-v1+json",
};

export async function fetchDevtoFulltext(devtoId: string): Promise<ToolResult> {
  const url = `${DEVTO_ARTICLES_URL}/${devtoId}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: DEVTO_HEADERS,
    });
    if (!response.ok) {
      return {
        ok: false,
        error: `Dev.to article detail request failed for id ${devtoId}: ${response.status} ${response.statusText}`,
      };
    }
    const article = (await response.json()) as {
      body_markdown?: string;
      title?: string;
    };
    return {
      ok: true,
      content: article.body_markdown
        ? `Title: ${article.title ?? "(no title)"}\n\n${article.body_markdown}`
        : "No article body available.",
    };
  } catch (error) {
    return {
      ok: false,
      error: `Failed to fetch/parse Dev.to article ${devtoId}: ${(error as Error).message}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function extractArxivId(url: string): string | undefined {
  const match = url.match(/arxiv\.org\/abs\/(.+)$/);
  return match ? match[1] : undefined;
}

export function extractGithubOwnerRepo(
  url: string,
): { owner: string; repo: string } | undefined {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  return match ? { owner: match[1], repo: match[2] } : undefined;
}

export const SUBMIT_FINDINGS_TOOL_NAME = "submit_findings";

const FETCH_HN_THREAD_TOOL = {
  name: "fetch_hn_thread",
  description:
    "Fetch the real Hacker News discussion thread for this item, including its top comments.",
  input_schema: { type: "object" as const, properties: {}, required: [] },
};

const FETCH_ARXIV_FULLTEXT_TOOL = {
  name: "fetch_arxiv_fulltext",
  description:
    "Fetch the real full text of this arXiv paper via its ar5iv HTML rendering.",
  input_schema: { type: "object" as const, properties: {}, required: [] },
};

const FETCH_GITHUB_REPO_FILE_TOOL = {
  name: "fetch_github_repo_file",
  description:
    "Read one file's content from this item's own GitHub repository, or list a directory's contents if given an empty or directory path.",
  input_schema: {
    type: "object" as const,
    properties: {
      path: {
        type: "string" as const,
        description:
          "File or directory path within the repo, e.g. 'README.md' or '' for the repo root.",
      },
    },
    required: ["path"],
  },
};

const FETCH_DEVTO_FULLTEXT_TOOL = {
  name: "fetch_devto_fulltext",
  description:
    "Fetch the real, uncapped full body text of this Dev.to article.",
  input_schema: { type: "object" as const, properties: {}, required: [] },
};

export const SUBMIT_FINDINGS_TOOL = {
  name: SUBMIT_FINDINGS_TOOL_NAME,
  description:
    "Submit your final deep-research findings for this item and end the research loop.",
  input_schema: {
    type: "object" as const,
    properties: {
      deepAnalysis: {
        type: "string" as const,
        description:
          "A thorough, multi-sentence analysis based on what you researched.",
      },
      sourcesConsulted: {
        type: "array" as const,
        items: { type: "string" as const },
        description: "Which tool(s) you actually used.",
      },
      confidence: { type: "string" as const, enum: ["high", "medium", "low"] },
    },
    required: ["deepAnalysis", "sourcesConsulted", "confidence"],
  },
};

export const TOOLS_BY_SOURCE: Record<
  DigestItem["source"],
  { name: string; description: string; input_schema: object }
> = {
  hn: FETCH_HN_THREAD_TOOL,
  arxiv: FETCH_ARXIV_FULLTEXT_TOOL,
  github: FETCH_GITHUB_REPO_FILE_TOOL,
  devto: FETCH_DEVTO_FULLTEXT_TOOL,
};

export async function dispatchTool(
  toolName: string,
  input: Record<string, unknown>,
  itemId: string,
  item: DigestItem,
): Promise<ToolResult> {
  switch (toolName) {
    case "fetch_hn_thread": {
      if (item.hn_id === undefined) {
        return {
          ok: false,
          error: "Item has no hn_id; cannot fetch its thread.",
        };
      }
      return fetchHnThread(item.hn_id);
    }
    case "fetch_arxiv_fulltext": {
      const arxivId = extractArxivId(item.url);
      if (!arxivId) {
        return {
          ok: false,
          error: `Could not extract an arXiv id from ${item.url}`,
        };
      }
      return fetchArxivFulltext(arxivId);
    }
    case "fetch_github_repo_file": {
      const repoInfo = extractGithubOwnerRepo(item.url);
      if (!repoInfo) {
        return {
          ok: false,
          error: `Could not extract owner/repo from ${item.url}`,
        };
      }
      const path = typeof input.path === "string" ? input.path : "";
      return fetchGithubRepoFile(repoInfo.owner, repoInfo.repo, path);
    }
    case "fetch_devto_fulltext": {
      const devtoId = itemId.replace(/^devto-/, "");
      if (devtoId === itemId) {
        return {
          ok: false,
          error: `Item id "${itemId}" does not look like a devto- id.`,
        };
      }
      return fetchDevtoFulltext(devtoId);
    }
    default:
      return { ok: false, error: `Unknown tool: ${toolName}` };
  }
}
