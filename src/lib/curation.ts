/**
 * src/lib/curation.ts
 *
 * ============================================================================
 * PLACEHOLDER CURATION STEP — THIS IS NOT A REAL LLM CALL.
 * ============================================================================
 * No Anthropic/OpenAI API keys are available in this environment. A real
 * "curation" step would send each story to an LLM to judge genuine technical
 * interest and write a human-quality summary of why it's worth reading. That
 * does not happen here.
 *
 * Instead, this function deterministically derives an interest_score (0-10)
 * and a why_read string PURELY from real, already-fetched HN fields (points,
 * num_comments). It never fabricates content, opinions, or summaries that
 * aren't directly computable from those two numbers. This is documented as
 * the single biggest deferred item in this walking skeleton — swapping this
 * function for a real LLM call (once API keys exist) is the fast-follow, and
 * this file is exactly where that change will land — see CLAUDE.md's
 * plan-mode gate before editing this file.
 * ============================================================================
 */

/**
 * Raw shape mapped from a single Algolia HN Search API "hit" on the
 * front_page tag. Only fields we actually use downstream are kept.
 */
export interface RawHnStory {
  title: string;
  url: string;
  points: number;
  num_comments: number;
  hn_id: number;
  author: string | null;
}

export function scoreStoryPlaceholder(story: RawHnStory): {
  interest_score: number;
  why_read: string;
} {
  // Log-scale both signals so a handful of viral outliers (e.g. 2000 points)
  // don't blow the 0-10 range, then combine with a simple weighted average.
  // Points weighted higher than comments as a (crude, deterministic) proxy
  // for overall community interest.
  const pointsComponent = Math.log10(story.points + 1) * 3.2;
  const commentsComponent = Math.log10(story.num_comments + 1) * 2.4;
  const rawScore = pointsComponent + commentsComponent;

  const interest_score = Math.min(
    10,
    Math.max(0, Math.round(rawScore * 10) / 10),
  );

  const why_read = `Currently at ${story.points} point${story.points === 1 ? "" : "s"} and ${story.num_comments} comment${story.num_comments === 1 ? "" : "s"} on Hacker News — deterministic placeholder score derived from those two real, fetched values (not an LLM summary).`;

  return { interest_score, why_read };
}

/**
 * Raw shape mapped from a single arXiv Atom API `<entry>` element (see
 * scripts/pipeline.ts's fetchArxivPapers). Only fields we actually use
 * downstream are kept.
 */
export interface RawArxivPaper {
  title: string;
  /** arXiv abstract page URL, e.g. https://arxiv.org/abs/PAPERID */
  url: string;
  arxivId: string;
  /** ISO date string, e.g. "2026-09-01T12:34:56Z" */
  publishedDate: string;
  authors: string[];
  /** Category tags such as "cs.AI" or "cs.LG" */
  categories: string[];
}

/**
 * ============================================================================
 * PLACEHOLDER ARXIV SCORING — THIS IS NOT A REAL LLM CALL EITHER.
 * ============================================================================
 * Same constraint as scoreStoryPlaceholder above: no LLM keys, no real
 * editorial judgment. But arXiv is a strictly weaker signal source than HN —
 * HN gives us points and num_comments, a real (if crude) proxy for community
 * interest. arXiv's public API gives us NO engagement signal at all: no
 * citation count, no downloads, no votes. The only real, fetched signal
 * available here is recency (publishedDate).
 *
 * Because recency alone says nothing about whether a paper is actually
 * good — a same-day submission could be trivial, and a two-week-old paper
 * could be a landmark result — this function deliberately caps its output
 * well below the 9-10 "must read" range that a viral HN story can reach via
 * real community engagement. The score decays from a ceiling of 8 down to a
 * floor of 3 as the paper ages, on an exponential half-life curve, and never
 * leaves that [3, 8] band. This asymmetry (HN can hit 10, arXiv tops out at
 * 8) is intentional and documented here so a future reader doesn't "fix" it
 * into a symmetric scale — recency is simply a much weaker signal than real
 * engagement, and the score should reflect that honestly.
 * ============================================================================
 */
export function scoreArxivPlaceholder(paper: RawArxivPaper): {
  interest_score: number;
  why_read: string;
} {
  const CEILING = 8;
  const FLOOR = 3;
  const HALF_LIFE_DAYS = 5;

  const publishedAt = new Date(paper.publishedDate);
  const msSincePublished = Date.now() - publishedAt.getTime();
  const daysSincePublished = Math.max(
    0,
    msSincePublished / (1000 * 60 * 60 * 24),
  );

  // Exponential decay from CEILING toward FLOOR: a same-day submission
  // scores near CEILING; after one HALF_LIFE_DAYS period it's halfway to
  // FLOOR; it never drops below FLOOR no matter how old the paper is.
  const decayFactor = Math.pow(0.5, daysSincePublished / HALF_LIFE_DAYS);
  const rawScore = FLOOR + (CEILING - FLOOR) * decayFactor;

  const interest_score = Math.min(
    CEILING,
    Math.max(FLOOR, Math.round(rawScore * 10) / 10),
  );

  const categoryList =
    paper.categories.length > 0
      ? paper.categories.join(", ")
      : "no listed categories";
  const publishedDateOnly = paper.publishedDate.slice(0, 10);
  const why_read = `Submitted to arXiv on ${publishedDateOnly} under ${categoryList} — recency-based placeholder score (arXiv exposes no engagement signal like HN's points/comments, so this is deliberately capped below the must-read range; not an LLM summary of the paper's content).`;

  return { interest_score, why_read };
}
