/**
 * scripts/pipeline.ts
 *
 * daily-dose data pipeline: fetches today's Hacker News front page via the
 * free, keyless Algolia HN Search API, scores each story with a deterministic
 * PLACEHOLDER curation function (see ../src/lib/curation.ts), validates the
 * result against the shared DigestItemSchema, and writes one file per story
 * to a dated folder under src/data/digest/ (see the comment above main()
 * below for why one-file-per-story, not one array file per day).
 *
 * Single source (hn) in this walking skeleton. arXiv/GitHub sourcing is a
 * documented fast-follow, not a silent omission — see README / Context.md.
 *
 * Run directly:
 *   npx tsx scripts/pipeline.ts [--output <path>] [--limit <n>]
 */

import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { DigestItemSchema, type DigestItem } from "../src/lib/digestSchema.js";
import { scoreStoryPlaceholder, type RawHnStory } from "../src/lib/curation.js";

export type { RawHnStory };

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

function todayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

interface ParsedArgs {
  output: string;
  limit: number;
}

function parseArgs(argv: string[]): ParsedArgs {
  const today = todayIsoDate();
  const defaults: ParsedArgs = {
    output: `src/data/digest/${today}`,
    limit: 5,
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
 */
export async function main(): Promise<void> {
  const { output, limit } = parseArgs(process.argv.slice(2));
  const today = todayIsoDate();

  const stories = await fetchHnFrontPage(limit);

  const items: DigestItem[] = stories.map((story) => {
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
    return DigestItemSchema.parse(candidate);
  });

  const outputDir = resolve(process.cwd(), output);
  await mkdir(outputDir, { recursive: true });

  await Promise.all(
    items.map((item) => {
      const itemPath = resolve(outputDir, `hn-${item.hn_id}.json`);
      return writeFile(itemPath, JSON.stringify(item, null, 2) + "\n", "utf-8");
    }),
  );

  console.log(`Wrote ${items.length} items to ${outputDir}/`);
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
