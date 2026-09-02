/**
 * scripts/pipeline.ts
 *
 * daily-dose data pipeline: fetches today's Hacker News front page via the
 * free, keyless Algolia HN Search API AND today's newest arXiv cs.AI/cs.LG/
 * cs.CL papers via arXiv's free, keyless public Atom API, scores each item
 * with a deterministic PLACEHOLDER curation function (see
 * ../src/lib/curation.ts), validates the result against the shared
 * DigestItemSchema, and writes one file per item to a dated folder under
 * src/data/digest/ (see the comment above main() below for why
 * one-file-per-item, not one array file per day).
 *
 * Both sources run by default; use --sources to run just one. GitHub
 * sourcing remains a documented, not-yet-started fast-follow — see
 * README / Context.md.
 *
 * Run directly:
 *   npx tsx scripts/pipeline.ts [--output <path>] [--limit <n>] [--sources hn,arxiv]
 */

import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { XMLParser } from "fast-xml-parser";
import { DigestItemSchema, type DigestItem } from "../src/lib/digestSchema.js";
import {
  scoreStoryPlaceholder,
  scoreArxivPlaceholder,
  type RawHnStory,
  type RawArxivPaper,
} from "../src/lib/curation.js";

export type { RawHnStory, RawArxivPaper };

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

    return {
      title,
      url: `https://arxiv.org/abs/${arxivId}`,
      arxivId,
      publishedDate: entry.published,
      authors,
      categories,
    };
  });
}

/** Filesystem-safe arXiv ID: some arXiv IDs contain a slash (old-style
 * "archive/YYMMNNN" IDs, e.g. "cs.AI/0601001") — replace slash or colon with
 * a hyphen so it's always safe to use as part of a filename. */
function sanitizeArxivId(arxivId: string): string {
  return arxivId.replace(/[/:]/g, "-");
}

function todayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const KNOWN_SOURCES = ["hn", "arxiv"] as const;
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

export async function main(): Promise<void> {
  const { output, limit, sources } = parseArgs(process.argv.slice(2));
  const today = todayIsoDate();

  const files: WritableDigestFile[] = [];

  if (sources.includes("hn")) {
    const stories = await fetchHnFrontPage(limit);

    for (const story of stories) {
      const { interest_score, why_read } = scoreStoryPlaceholder(story);

      const candidate = {
        title: story.title,
        source: "hn" as const,
        url: story.url,
        date: today,
        tags: [],
        interest_score,
        why_read,
        authors: story.author ? [story.author] : [],
        hn_id: story.hn_id,
        points: story.points,
      };

      // Validate every item — let this throw with a clear error if a story
      // doesn't conform to the shared schema rather than silently skipping it.
      const item = DigestItemSchema.parse(candidate);
      files.push({ item, filename: `hn-${item.hn_id}.json` });
    }
  }

  if (sources.includes("arxiv")) {
    const papers = await fetchArxivPapers(limit);

    for (const paper of papers) {
      const { interest_score, why_read } = scoreArxivPlaceholder(paper);

      const candidate = {
        title: paper.title,
        source: "arxiv" as const,
        url: paper.url,
        date: today,
        tags: paper.categories,
        interest_score,
        why_read,
        authors: paper.authors,
      };

      // Same validate-before-write guarantee as the HN branch above.
      const item = DigestItemSchema.parse(candidate);
      files.push({
        item,
        filename: `arxiv-${sanitizeArxivId(paper.arxivId)}.json`,
      });
    }
  }

  const outputDir = resolve(process.cwd(), output);
  await mkdir(outputDir, { recursive: true });

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
