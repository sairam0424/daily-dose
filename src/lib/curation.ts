/**
 * src/lib/curation.ts
 *
 * ============================================================================
 * PLACEHOLDER CURATION — FALLBACK ONLY, NOT THE DEFAULT PATH.
 * ============================================================================
 * Real LLM curation via AWS Bedrock (src/lib/llmCuration.ts) is the default
 * scoring path as of ADR 0003. The functions in this file are used only
 * when Bedrock credentials aren't configured (e.g. local dev) or the LLM's
 * response omits a specific item's score — always with a loud console
 * warning, never silently, per scripts/pipeline.ts's main().
 *
 * Each function deterministically derives an interest_score (0-10) and a
 * why_read string PURELY from real, already-fetched fields for that source
 * (points/num_comments for HN, stars/forks for GitHub, recency for arXiv).
 * They never fabricate content, opinions, or summaries that aren't directly
 * computable from those real values. See CLAUDE.md's plan-mode gate before
 * editing this file.
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
  /** The paper's actual abstract text, from the Atom feed's <summary> element.
   * Real content, not fabricated — required for any genuine LLM judgment
   * about whether a paper is worth reading (title + categories alone is too
   * thin, which is exactly why the placeholder below can only ever use
   * recency, not real judgment). */
  summary: string;
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

/**
 * Raw shape mapped from a single GitHub Search API "repository" result (see
 * scripts/pipeline.ts's fetchGithubTrendingRepos). Only fields we actually
 * use downstream are kept.
 */
export interface RawGithubRepo {
  /** "owner/repo" — GitHub's own full_name field. */
  fullName: string;
  /** Repository page URL, e.g. https://github.com/owner/repo */
  url: string;
  /** Real, already-fetched description text — may be an empty string if the
   * repo has none. Never fabricated. */
  description: string;
  stars: number;
  forks: number;
  language: string | null;
  createdAt: string;
}

/**
 * ============================================================================
 * PLACEHOLDER GITHUB SCORING — THIS IS NOT A REAL LLM CALL EITHER.
 * ============================================================================
 * Unlike arXiv (which has no engagement signal at all), GitHub's search
 * results carry two real, comparable signals — stargazers_count and
 * forks_count — the same shape as HN's points/num_comments pair. So this
 * placeholder reuses scoreStoryPlaceholder's exact weighting (stars weighted
 * like points, forks weighted like comments) rather than arXiv's weaker
 * recency-only formula: GitHub is a strong-signal source, not a weak one.
 * ============================================================================
 */
export function scoreGithubPlaceholder(repo: RawGithubRepo): {
  interest_score: number;
  why_read: string;
} {
  const starsComponent = Math.log10(repo.stars + 1) * 3.2;
  const forksComponent = Math.log10(repo.forks + 1) * 2.4;
  const rawScore = starsComponent + forksComponent;

  const interest_score = Math.min(
    10,
    Math.max(0, Math.round(rawScore * 10) / 10),
  );

  const why_read = `New repository with ${repo.stars} star${repo.stars === 1 ? "" : "s"} and ${repo.forks} fork${repo.forks === 1 ? "" : "s"} on GitHub — deterministic placeholder score derived from those two real, fetched values (not an LLM summary).`;

  return { interest_score, why_read };
}

/**
 * Raw shape mapped from a single Dev.to Articles API list item (see
 * scripts/pipeline.ts's fetchDevtoArticles), augmented with a real,
 * already-fetched excerpt of the article's own body text (from a follow-up
 * call to the detail endpoint — the list endpoint's `description` field is
 * only ~85-100 chars, too thin for genuine judgment). Only fields we
 * actually use downstream are kept.
 */
export interface RawDevtoArticle {
  id: number;
  title: string;
  url: string;
  /** Real, already-fetched excerpt of the article's body_markdown, already
   * truncated to a bounded length by fetchDevtoArticles before it ever
   * reaches here — never fabricated, never the full uncapped body. */
  bodyText: string;
  reactions: number;
  comments: number;
  tags: string[];
  publishedAt: string;
}

/**
 * ============================================================================
 * PLACEHOLDER DEV.TO SCORING — THIS IS NOT A REAL LLM CALL EITHER.
 * ============================================================================
 * Like GitHub (and unlike arXiv), Dev.to's Articles API carries two real,
 * comparable engagement signals — public_reactions_count and
 * comments_count — the same shape as HN's points/num_comments pair. So this
 * placeholder reuses scoreStoryPlaceholder's exact weighting (reactions
 * weighted like points, comments weighted like comments) rather than
 * arXiv's weaker recency-only formula: Dev.to is a strong-signal source,
 * not a weak one. See docs/adr/0007-add-devto-as-fourth-source.md.
 * ============================================================================
 */
export function scoreDevtoPlaceholder(article: RawDevtoArticle): {
  interest_score: number;
  why_read: string;
} {
  const reactionsComponent = Math.log10(article.reactions + 1) * 3.2;
  const commentsComponent = Math.log10(article.comments + 1) * 2.4;
  const rawScore = reactionsComponent + commentsComponent;

  const interest_score = Math.min(
    10,
    Math.max(0, Math.round(rawScore * 10) / 10),
  );

  const why_read = `New Dev.to article with ${article.reactions} reaction${article.reactions === 1 ? "" : "s"} and ${article.comments} comment${article.comments === 1 ? "" : "s"} — deterministic placeholder score derived from those two real, fetched values (not an LLM summary).`;

  return { interest_score, why_read };
}
