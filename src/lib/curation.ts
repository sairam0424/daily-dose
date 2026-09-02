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
