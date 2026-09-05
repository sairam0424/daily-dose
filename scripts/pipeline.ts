/**
 * scripts/pipeline.ts
 *
 * daily-dose data pipeline: fetches today's Hacker News front page via the
 * free, keyless Algolia HN Search API, today's newest arXiv cs.AI/cs.LG/
 * cs.CL papers via arXiv's free, keyless public Atom API, today's newest
 * fast-rising GitHub repos via GitHub's free, keyless public Search API,
 * AND today's "hot right now" Dev.to articles via Dev.to's free, keyless
 * public Articles API, scores every item in ONE real Bedrock LLM call (see
 * ../src/lib/llmCuration.ts) when real credentials are configured,
 * validates the result against the shared DigestItemSchema, and writes one
 * file per item to a dated folder under src/data/digest/ (see the comment
 * above main() below for why one-file-per-item, not one array file per
 * day).
 *
 * If BEDROCK_ACCESS_KEY_ID/BEDROCK_SECRET_ACCESS_KEY are not set (e.g. local
 * dev without secrets), this falls back to the deterministic PLACEHOLDER
 * scoring functions in ../src/lib/curation.ts, with a loud console warning -
 * never silently. See CLAUDE.md's plan-mode gate before editing this file or
 * llmCuration.ts.
 *
 * All four sources run by default; use --sources to run a subset. See
 * docs/adr/0006-add-github-as-third-source.md for why GitHub surfaces
 * "trending-style" new repos (Search API, sort=stars, created recently,
 * fork:false) rather than a curated watchlist or scraped Trending page, and
 * docs/adr/0007-add-devto-as-fourth-source.md for why Dev.to surfaces
 * "hot right now" articles (top=1) with a real body-text excerpt rather than
 * Reddit, Lobste.rs, or Product Hunt.
 *
 * Run directly:
 *   npx tsx scripts/pipeline.ts [--output <path>] [--limit <n>] [--sources hn,arxiv,github,devto]
 */

import { writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { XMLParser } from "fast-xml-parser";
import { DigestItemSchema, type DigestItem } from "../src/lib/digestSchema.js";
import {
  scoreStoryPlaceholder,
  scoreArxivPlaceholder,
  scoreGithubPlaceholder,
  scoreDevtoPlaceholder,
  type RawHnStory,
  type RawArxivPaper,
  type RawGithubRepo,
  type RawDevtoArticle,
} from "../src/lib/curation.js";
import {
  scoreItemsWithLLM,
  isLlmConfigured,
  type ScorableItem,
  type ScoreResult,
} from "../src/lib/llmCuration.js";
import { recordAndCheckCost } from "../src/lib/costTracking.js";
import {
  resolveItemImage,
  type ResolvedImage,
} from "../src/lib/imageResolution.js";

export type { RawHnStory, RawArxivPaper, RawGithubRepo, RawDevtoArticle };

interface AlgoliaHnHit {
  title: string | null;
  url: string | null;
  points: number | null;
  num_comments: number | null;
  objectID: string;
  author: string | null;
}

interface AlgoliaHnResponse {
  hits: AlgoliaHnHit[];
}

const HN_ALGOLIA_SEARCH_URL = "https://hn.algolia.com/api/v1/search";

/**
 * Fetches the current Hacker News front page from the free, keyless Algolia
 * Search API (no API key required, no auth headers needed).
 *
 * Ask HN / text posts often have a null `url` in the Algolia response since
 * they have no external link — in that case we fall back to the story's own
 * HN discussion thread URL so every item always has a valid, non-null URL.
 */
export async function fetchHnFrontPage(limit = 5): Promise<RawHnStory[]> {
  const url = `${HN_ALGOLIA_SEARCH_URL}?tags=front_page&hitsPerPage=${limit}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `HN Algolia API request failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as AlgoliaHnResponse;

  return data.hits.map((hit) => {
    const hnId = Number.parseInt(hit.objectID, 10);
    const discussionUrl = `https://news.ycombinator.com/item?id=${hnId}`;

    return {
      title: hit.title ?? `HN discussion ${hnId}`,
      url: hit.url && hit.url.trim().length > 0 ? hit.url : discussionUrl,
      points: hit.points ?? 0,
      num_comments: hit.num_comments ?? 0,
      hn_id: hnId,
      author: hit.author,
    };
  });
}

const ARXIV_API_URL = "https://export.arxiv.org/api/query";
// AI/ML/NLP categories only — see Context.md's roadmap for why these three.
const ARXIV_SEARCH_QUERY = "cat:cs.AI+OR+cat:cs.LG+OR+cat:cs.CL";

/** Shape of one `<entry>` in the arXiv Atom feed, after fast-xml-parser. */
interface ArxivFeedEntry {
  id: string;
  title: string;
  published: string;
  summary?: string;
  author?: { name?: string } | Array<{ name?: string }>;
  category?: { "@_term"?: string } | Array<{ "@_term"?: string }>;
}

interface ArxivFeed {
  feed?: {
    entry?: ArxivFeedEntry | ArxivFeedEntry[];
  };
}

/** Normalizes a value that fast-xml-parser may return as a single object or
 * an array (depending on how many sibling elements were present) into an
 * array. */
function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Fetches the newest AI/ML/NLP papers from arXiv's free, keyless public API
 * (export.arxiv.org/api/query, no API key required). This endpoint returns
 * an Atom/XML feed, not JSON — parsed here with fast-xml-parser rather than
 * hand-rolled regexes, since real Atom XML has nested elements, an XML
 * namespace, and multiple <author> entries per <entry>.
 */
export async function fetchArxivPapers(limit = 5): Promise<RawArxivPaper[]> {
  const url = `${ARXIV_API_URL}?search_query=${ARXIV_SEARCH_QUERY}&sortBy=submittedDate&sortOrder=descending&max_results=${limit}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `arXiv API request failed: ${response.status} ${response.statusText}`,
    );
  }

  const xml = await response.text();
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });
  const parsed = parser.parse(xml) as ArxivFeed;
  const entries = toArray(parsed.feed?.entry);

  return entries.map((entry) => {
    // Entry ids look like "http://arxiv.org/abs/2409.12345v1" — strip the
    // leading .../abs/ prefix and the trailing version suffix (vN) to get
    // the stable arXiv ID.
    const arxivId = entry.id.replace(/^.*\/abs\//, "").replace(/v\d+$/, "");

    // Atom feeds often indent/wrap <title> content across lines — collapse
    // all whitespace runs (including newlines) to single spaces and trim.
    const title = entry.title.replace(/\s+/g, " ").trim();

    const authors = toArray(entry.author)
      .map((author) => author.name)
      .filter((name): name is string => Boolean(name));

    const categories = toArray(entry.category)
      .map((category) => category["@_term"])
      .filter((term): term is string => Boolean(term));

    // Same whitespace-collapsing as title above - arXiv abstracts are
    // indented/wrapped across many lines in the raw XML.
    const summary = (entry.summary ?? "").replace(/\s+/g, " ").trim();

    return {
      title,
      url: `https://arxiv.org/abs/${arxivId}`,
      arxivId,
      publishedDate: entry.published,
      authors,
      categories,
      summary,
    };
  });
}

/** Filesystem-safe arXiv ID: some arXiv IDs contain a slash (old-style
 * "archive/YYMMNNN" IDs, e.g. "cs.AI/0601001") — replace slash or colon with
 * a hyphen so it's always safe to use as part of a filename. */
function sanitizeArxivId(arxivId: string): string {
  return arxivId.replace(/[/:]/g, "-");
}

const GITHUB_SEARCH_URL = "https://api.github.com/search/repositories";
// How far back "recently created" reaches - see ADR 0006 for why 7 days
// (a large-enough pool of real candidates without reaching so far back that
// "new" stops meaning anything).
const GITHUB_TRENDING_WINDOW_DAYS = 7;

/** Shape of one item in the GitHub Search API's repository search response.
 * Only fields we actually use downstream are kept. */
interface GithubSearchItem {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  created_at: string;
}

interface GithubSearchResponse {
  items: GithubSearchItem[];
}

function isoDateDaysAgo(days: number): string {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

/**
 * Fetches recently-created, fast-rising GitHub repos from GitHub's free,
 * keyless public Search API (no API key required - unauthenticated search
 * is rate-limited to 10 requests/minute, comfortably enough for a once-daily
 * job). `fork:false` excludes forks so a fork of an existing popular
 * project never gets surfaced as if it were a genuinely new project -
 * confirmed via a real live query during research that GitHub's search
 * qualifier actually filters this, not just an unverified assumption.
 */
export async function fetchGithubTrendingRepos(
  limit = 5,
): Promise<RawGithubRepo[]> {
  const sinceDate = isoDateDaysAgo(GITHUB_TRENDING_WINDOW_DAYS);
  const query = `created:>${sinceDate} fork:false`;
  const url = `${GITHUB_SEARCH_URL}?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${limit}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "daily-dose-pipeline",
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `GitHub Search API request failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as GithubSearchResponse;

  return data.items.map((item) => ({
    fullName: item.full_name,
    url: item.html_url,
    description: item.description ?? "",
    stars: item.stargazers_count,
    forks: item.forks_count,
    language: item.language,
    createdAt: item.created_at,
  }));
}

/** Filesystem-safe GitHub repo id: full_name is "owner/repo" - replace the
 * slash with a hyphen so it's always safe to use as part of a filename. */
function sanitizeGithubId(fullName: string): string {
  return fullName.replace(/\//g, "-");
}

/** Standard 200 words-per-minute reading speed, rounded, floored at 1 minute
 * so a very short abstract/excerpt never reports "0 min". Used only for
 * arXiv abstracts and Dev.to excerpts - HN and GitHub items never get a
 * reading_minutes value since no body text is ever fetched for either. */
const WORDS_PER_MINUTE = 200;

export function computeReadingMinutes(text: string): number {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE));
}

const DEVTO_ARTICLES_URL = "https://dev.to/api/articles";

// Real, live-verified research (see docs/adr/0007-add-devto-as-fourth-source.md):
// Dev.to's API self-identifies via a response "warning" header as "V0
// (beta)" and recommends this Accept header to use V1 - sent proactively on
// every request even though V0's response shape is confirmed still working
// today. This project should not assume V0 stays supported forever.
const DEVTO_HEADERS = {
  "User-Agent": "daily-dose-pipeline",
  Accept: "application/vnd.forem.api-v1+json",
};

// Bounds how much of an article's real body_markdown ever reaches a prompt
// or gets stored. An uncapped article body can run 7000+ characters - in a
// SINGLE batched LLM prompt scoring many items at once (see llmCuration.ts),
// one uncapped item would dominate the whole call's token cost. Title plus
// a bounded excerpt is enough for genuine judgment - the same reason arXiv
// abstracts (naturally short) and GitHub descriptions (naturally short)
// never needed a cap, but a full long-form article body does.
const DEVTO_BODY_EXCERPT_LENGTH = 1500;

/** Shape of one item in Dev.to's Articles list response (`?top=1`). Only
 * fields we actually use downstream are kept - the list endpoint's own
 * `description` is real but too thin (~85-100 chars) for genuine judgment,
 * which is why fetchDevtoArticles below makes a further per-article call. */
interface DevtoListItem {
  id: number;
  title: string;
  url: string;
  comments_count: number;
  public_reactions_count: number;
  tag_list: string[];
  published_timestamp: string;
  cover_image: string | null;
}

/** Shape of the Dev.to Articles detail response (`/articles/{id}`) - only
 * the one field this pipeline actually needs beyond the list response. */
interface DevtoDetailItem {
  body_markdown: string | null;
}

/**
 * Fetches today's "hot right now" Dev.to articles from Dev.to's free,
 * keyless public Articles API (`?top=1` - ranked server-side by Forem over
 * the last 1 day, not something this pipeline computes itself), then makes
 * ONE FURTHER call per article to the detail endpoint to fetch its real
 * `body_markdown` - the list endpoint's own `description` field is only
 * ~85-100 chars, too thin for genuine LLM judgment, the same reason
 * fetchArxivPapers always captures the real abstract rather than relying on
 * a title alone. The body text is truncated to DEVTO_BODY_EXCERPT_LENGTH
 * before it is ever returned - see that constant's comment for why. See
 * docs/adr/0007-add-devto-as-fourth-source.md for the full source research.
 */
export async function fetchDevtoArticles(
  limit = 5,
): Promise<RawDevtoArticle[]> {
  const url = `${DEVTO_ARTICLES_URL}?top=1&per_page=${limit}`;
  const response = await fetch(url, { headers: DEVTO_HEADERS });

  if (!response.ok) {
    throw new Error(
      `Dev.to API request failed: ${response.status} ${response.statusText}`,
    );
  }

  const items = (await response.json()) as DevtoListItem[];

  return Promise.all(
    items.map(async (item) => {
      const detailUrl = `${DEVTO_ARTICLES_URL}/${item.id}`;
      const detailResponse = await fetch(detailUrl, {
        headers: DEVTO_HEADERS,
      });

      if (!detailResponse.ok) {
        throw new Error(
          `Dev.to article detail request failed for id ${item.id}: ${detailResponse.status} ${detailResponse.statusText}`,
        );
      }

      const detail = (await detailResponse.json()) as DevtoDetailItem;
      const fullBodyText = (detail.body_markdown ?? "").trim();

      return {
        id: item.id,
        title: item.title,
        url: item.url,
        bodyText: fullBodyText.slice(0, DEVTO_BODY_EXCERPT_LENGTH),
        reactions: item.public_reactions_count,
        comments: item.comments_count,
        tags: item.tag_list,
        publishedAt: item.published_timestamp,
        coverImage: item.cover_image ?? undefined,
      };
    }),
  );
}

function todayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const KNOWN_SOURCES = ["hn", "arxiv", "github", "devto"] as const;
type KnownSource = (typeof KNOWN_SOURCES)[number];

interface ParsedArgs {
  output: string;
  limit: number;
  sources: KnownSource[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const today = todayIsoDate();
  const defaults: ParsedArgs = {
    output: `src/data/digest/${today}`,
    limit: 5,
    sources: [...KNOWN_SOURCES],
  };

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--output" && argv[i + 1]) {
      defaults.output = argv[i + 1];
      i += 1;
    } else if (argv[i] === "--limit" && argv[i + 1]) {
      const parsed = Number.parseInt(argv[i + 1], 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        defaults.limit = parsed;
      }
      i += 1;
    } else if (argv[i] === "--sources" && argv[i + 1]) {
      const requested = argv[i + 1]
        .split(",")
        .map((source) => source.trim().toLowerCase());
      const valid = requested.filter((source): source is KnownSource =>
        (KNOWN_SOURCES as readonly string[]).includes(source),
      );
      if (valid.length > 0) {
        defaults.sources = valid;
      }
      i += 1;
    }
  }

  return defaults;
}

/**
 * Astro's `glob()` content loader (used by src/content.config.ts) treats
 * EACH MATCHED FILE as one collection entry whose entire parsed content must
 * match the schema — it does not flatten a JSON array into multiple entries
 * (only the `file()` loader does that, and only for a single named file, not
 * a directory of dated files). So each story is written as its own file
 * containing a single DigestItem object, grouped under a per-day directory —
 * this is also what the reference project (arpitbbhayani/the-daily-diff)
 * actually does: one file per story under a dated folder, not one array file
 * per day.
 *
 * Each item's on-disk filename is source-specific: HN items keep the
 * existing `hn-<hn_id>.json`; arXiv items use
 * `arxiv-<sanitized-arxiv-id>.json` (slashes/colons replaced with hyphens —
 * see sanitizeArxivId above). This is why we track the filename alongside
 * the validated item rather than deriving it generically from `item`.
 */
interface WritableDigestFile {
  item: DigestItem;
  filename: string;
}

/**
 * Builds the real-LLM scoring request for one item, tagging it with the
 * exact same id used for its output filename so the returned score map can
 * be joined back to the right item unambiguously.
 */
function toScorableHnItem(story: RawHnStory): ScorableItem {
  return {
    id: `hn-${story.hn_id}`,
    source: "hn",
    title: story.title,
    points: story.points,
    numComments: story.num_comments,
  };
}

function toScorableArxivItem(paper: RawArxivPaper): ScorableItem {
  return {
    id: `arxiv-${sanitizeArxivId(paper.arxivId)}`,
    source: "arxiv",
    title: paper.title,
    summary: paper.summary,
    categories: paper.categories,
  };
}

function toScorableGithubItem(repo: RawGithubRepo): ScorableItem {
  return {
    id: `github-${sanitizeGithubId(repo.fullName)}`,
    source: "github",
    title: repo.fullName,
    stars: repo.stars,
    forks: repo.forks,
    language: repo.language,
    description: repo.description,
  };
}

function toScorableDevtoItem(article: RawDevtoArticle): ScorableItem {
  return {
    id: `devto-${article.id}`,
    source: "devto",
    title: article.title,
    reactions: article.reactions,
    comments: article.comments,
    bodyText: article.bodyText,
  };
}

/**
 * Determines which items need the generic OG-image/favicon fetch, tagging
 * each with the exact same id used for its output filename so the returned
 * resolution map can be joined back to the right item unambiguously (same
 * pattern as toScorableHnItem etc. above for the LLM scoring map).
 *
 * Dev.to items that already carry a native cover_image skip the generic
 * OG-image fetch entirely - no reason to pay for a second HTTP round-trip
 * for a source that already gives a real image for free. Accepted
 * trade-off: such an item also gets no favicon_url (resolveItemImage does
 * both in one fetch) - fine, since favicon_url is fully optional everywhere
 * it's rendered.
 */
/** Runs `items` through `fn` with at most `limit` in flight at once.
 * Order of the returned array matches `items`' order regardless of
 * completion order. No new dependency - a ~10-line helper was chosen
 * over a package for this. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

export function buildImageableItems(
  stories: RawHnStory[],
  papers: RawArxivPaper[],
  repos: RawGithubRepo[],
  articles: RawDevtoArticle[],
): Array<{ id: string; url: string }> {
  return [
    ...stories.map((story) => ({ id: `hn-${story.hn_id}`, url: story.url })),
    ...papers.map((paper) => ({
      id: `arxiv-${sanitizeArxivId(paper.arxivId)}`,
      url: paper.url,
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

export async function main(): Promise<void> {
  const { output, limit, sources } = parseArgs(process.argv.slice(2));
  const today = todayIsoDate();

  const stories = sources.includes("hn") ? await fetchHnFrontPage(limit) : [];
  const papers = sources.includes("arxiv") ? await fetchArxivPapers(limit) : [];
  const repos = sources.includes("github")
    ? await fetchGithubTrendingRepos(limit)
    : [];
  const articles = sources.includes("devto")
    ? await fetchDevtoArticles(limit)
    : [];

  // Real LLM curation when configured; a deterministic, clearly-labeled
  // placeholder otherwise - never silently, always a loud console notice
  // either way so it is always obvious which mode produced a given digest.
  let llmScores: Map<string, ScoreResult> | undefined;
  if (isLlmConfigured()) {
    const scorableItems: ScorableItem[] = [
      ...stories.map(toScorableHnItem),
      ...papers.map(toScorableArxivItem),
      ...repos.map(toScorableGithubItem),
      ...articles.map(toScorableDevtoItem),
    ];

    if (scorableItems.length > 0) {
      const outcome = await scoreItemsWithLLM(scorableItems);
      llmScores = outcome.scores;

      const statsEntry = await recordAndCheckCost(
        today,
        outcome.modelUsed,
        outcome.inputTokens,
        outcome.outputTokens,
        scorableItems.length,
      );

      console.log(
        `Scored ${scorableItems.length} items via real Bedrock LLM call (${outcome.modelUsed}): ` +
          `${outcome.inputTokens} input / ${outcome.outputTokens} output tokens, ` +
          `$${statsEntry.costUsd.toFixed(4)}${statsEntry.flaggedAnomalous ? " [FLAGGED ANOMALOUS - see warning above]" : ""}.`,
      );
    }
  } else {
    console.warn(
      "BEDROCK_ACCESS_KEY_ID/BEDROCK_SECRET_ACCESS_KEY not set - using deterministic placeholder scoring, not real LLM curation. This is expected for local dev without secrets; it should never be true in CI once real credentials are configured there.",
    );
  }

  // Generic OG-image/favicon enrichment - decorative, never blocks or fails
  // the pipeline (see imageResolution.ts's documented exception to the
  // fail-loud rule). Bounded to a 5s worst-case wall time per batch by
  // resolveItemImage's own internal timeout; capped at 6 concurrent
  // fetches so a normal day's item count doesn't open a burst of
  // simultaneous connections to as many distinct external hosts.
  const imageableItems = buildImageableItems(stories, papers, repos, articles);
  const resolvedImages = new Map<string, ResolvedImage>(
    await mapWithConcurrency(
      imageableItems,
      6,
      async ({ id, url }) => [id, await resolveItemImage(url)] as const,
    ),
  );

  const files: WritableDigestFile[] = [];

  for (const story of stories) {
    const id = `hn-${story.hn_id}`;
    const fromLlm = llmScores?.get(id);
    if (fromLlm?.exclude) {
      console.warn(
        `[curation] Excluding ${id} from the digest - the real LLM flagged it as harmful/inappropriate content.`,
      );
      continue;
    }
    if (llmScores && !fromLlm) {
      console.warn(
        `[curation] LLM response did not include a score for ${id} - falling back to placeholder scoring for this one item only.`,
      );
    }
    const { interest_score, why_read } =
      fromLlm ?? scoreStoryPlaceholder(story);
    const analysis = fromLlm?.analysis;
    const resolvedImage = resolvedImages.get(id) ?? {};

    const candidate = {
      title: story.title,
      source: "hn" as const,
      url: story.url,
      date: today,
      tags: [],
      interest_score,
      why_read,
      analysis,
      authors: story.author ? [story.author] : [],
      hn_id: story.hn_id,
      points: story.points,
      image_url: resolvedImage.image_url,
      favicon_url: resolvedImage.favicon_url,
    };

    // Validate every item — let this throw with a clear error if a story
    // doesn't conform to the shared schema rather than silently skipping it.
    const item = DigestItemSchema.parse(candidate);
    files.push({ item, filename: `hn-${item.hn_id}.json` });
  }

  for (const paper of papers) {
    const id = `arxiv-${sanitizeArxivId(paper.arxivId)}`;
    const fromLlm = llmScores?.get(id);
    if (fromLlm?.exclude) {
      console.warn(
        `[curation] Excluding ${id} from the digest - the real LLM flagged it as harmful/inappropriate content.`,
      );
      continue;
    }
    if (llmScores && !fromLlm) {
      console.warn(
        `[curation] LLM response did not include a score for ${id} - falling back to placeholder scoring for this one item only.`,
      );
    }
    const { interest_score, why_read } =
      fromLlm ?? scoreArxivPlaceholder(paper);
    const analysis = fromLlm?.analysis;
    const resolvedImage = resolvedImages.get(id) ?? {};

    const candidate = {
      title: paper.title,
      source: "arxiv" as const,
      url: paper.url,
      date: today,
      tags: paper.categories,
      interest_score,
      why_read,
      analysis,
      authors: paper.authors,
      reading_minutes: computeReadingMinutes(paper.summary),
      image_url: resolvedImage.image_url,
      favicon_url: resolvedImage.favicon_url,
    };

    // Same validate-before-write guarantee as the HN branch above.
    const item = DigestItemSchema.parse(candidate);
    files.push({
      item,
      filename: `arxiv-${sanitizeArxivId(paper.arxivId)}.json`,
    });
  }

  for (const repo of repos) {
    const id = `github-${sanitizeGithubId(repo.fullName)}`;
    const fromLlm = llmScores?.get(id);
    if (fromLlm?.exclude) {
      console.warn(
        `[curation] Excluding ${id} from the digest - the real LLM flagged it as harmful/inappropriate content.`,
      );
      continue;
    }
    if (llmScores && !fromLlm) {
      console.warn(
        `[curation] LLM response did not include a score for ${id} - falling back to placeholder scoring for this one item only.`,
      );
    }
    const { interest_score, why_read } =
      fromLlm ?? scoreGithubPlaceholder(repo);
    const analysis = fromLlm?.analysis;
    const resolvedImage = resolvedImages.get(id) ?? {};

    const candidate = {
      title: repo.fullName,
      source: "github" as const,
      url: repo.url,
      date: today,
      tags: repo.language ? [repo.language] : [],
      interest_score,
      why_read,
      analysis,
      authors: [],
      stars: repo.stars,
      image_url: resolvedImage.image_url,
      favicon_url: resolvedImage.favicon_url,
    };

    // Same validate-before-write guarantee as the HN branch above.
    const item = DigestItemSchema.parse(candidate);
    files.push({
      item,
      filename: `${id}.json`,
    });
  }

  for (const article of articles) {
    const id = `devto-${article.id}`;
    const fromLlm = llmScores?.get(id);
    if (fromLlm?.exclude) {
      console.warn(
        `[curation] Excluding ${id} from the digest - the real LLM flagged it as harmful/inappropriate content.`,
      );
      continue;
    }
    if (llmScores && !fromLlm) {
      console.warn(
        `[curation] LLM response did not include a score for ${id} - falling back to placeholder scoring for this one item only.`,
      );
    }
    const { interest_score, why_read } =
      fromLlm ?? scoreDevtoPlaceholder(article);
    const analysis = fromLlm?.analysis;
    const resolvedImage = resolvedImages.get(id) ?? {};

    const candidate = {
      title: article.title,
      source: "devto" as const,
      url: article.url,
      date: today,
      tags: article.tags,
      interest_score,
      why_read,
      analysis,
      authors: [],
      reactions: article.reactions,
      reading_minutes: computeReadingMinutes(article.bodyText),
      image_url: article.coverImage ?? resolvedImage.image_url,
      favicon_url: resolvedImage.favicon_url,
    };

    // Same validate-before-write guarantee as the HN branch above.
    const item = DigestItemSchema.parse(candidate);
    files.push({ item, filename: `${id}.json` });
  }

  const outputDir = resolve(process.cwd(), output);
  await mkdir(outputDir, { recursive: true });

  // Clean up stale files from an EARLIER run on the same day, scoped only to
  // the sources actually fetched this run. Without this, running the
  // pipeline more than once on the same day (which will happen in practice -
  // manual re-runs, this project's own testing, a future retry after a
  // partial failure) silently accumulates orphaned files: HN's front page
  // composition shifts throughout the day, so a story that was in the top N
  // an hour ago but has since fallen out never gets removed, and the day's
  // folder grows past N items instead of staying a clean "current top N"
  // snapshot. Deliberately scoped per source prefix so a single-source run
  // (--sources hn) never deletes the other source's already-committed data
  // from an earlier run that covered both.
  const newFilenames = new Set(files.map((f) => f.filename));
  const existingEntries = await readdir(outputDir).catch(() => [] as string[]);
  const stalePrefixes = sources.map((source) => `${source}-`);
  const staleFiles = existingEntries.filter(
    (name) =>
      stalePrefixes.some((prefix) => name.startsWith(prefix)) &&
      !newFilenames.has(name),
  );
  await Promise.all(staleFiles.map((name) => unlink(resolve(outputDir, name))));
  if (staleFiles.length > 0) {
    console.log(
      `Removed ${staleFiles.length} stale item(s) from an earlier run today (no longer in the current top ${limit}): ${staleFiles.join(", ")}`,
    );
  }

  await Promise.all(
    files.map(({ item, filename }) => {
      const itemPath = resolve(outputDir, filename);
      return writeFile(itemPath, JSON.stringify(item, null, 2) + "\n", "utf-8");
    }),
  );

  const countsBySource = files.reduce<Record<string, number>>(
    (acc, { item }) => {
      acc[item.source] = (acc[item.source] ?? 0) + 1;
      return acc;
    },
    {},
  );

  console.log(
    `Wrote ${files.length} items to ${outputDir}/ (sources: ${sources.join(", ")}; per-source counts: ${JSON.stringify(countsBySource)})`,
  );
}

// Only run main() when this file is executed directly (e.g. `npx tsx
// scripts/pipeline.ts`), not when fetchHnFrontPage/scoreStoryPlaceholder are
// imported in isolation by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Pipeline failed:", error);
    process.exitCode = 1;
  });
}
