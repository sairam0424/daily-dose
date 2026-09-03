# ADR 0007: Add Dev.to as a fourth ingestion source

**Status:** Accepted, 2026-09-03

## Context and Problem Statement

`DigestItemSchema` has modeled `source: "hn" | "arxiv" | "github"` since ADR
0006 shipped GitHub as the third source. `Context.md`'s roadmap flagged a
fourth source as "research/framing phase only" — unlike GitHub (which had an
obvious "trending repos" framing), no candidate had a strong "what should
this actually surface" answer yet. This ADR is that research pass, applied
to the strongest candidate found, plus its technical execution.

## Decision Drivers

- Real, live data only — no scraping, no fabricated/hardcoded content,
  matching this project's load-bearing no-fake-data constraint.
- Prefer a source with a genuine two-signal engagement proxy (like HN's
  points/comments, or GitHub's stars/forks) over a weak single-signal one
  (like arXiv's recency-only), if a real option exists.
- Keep the credential surface unchanged — the fourth source must not require
  any new secret, matching every source added so far.
- A content shape genuinely distinct from the existing three (HN's links,
  arXiv's papers, GitHub's repos) is preferred over a source that would just
  be a smaller, quieter echo of one already shipped.

## Considered Options

1. **Dev.to Articles API, `top=1` ("hot right now"), plus a per-article
   detail call for the real body text (chosen).** `GET
   https://dev.to/api/articles?top=1&per_page=N` — official, free, fully
   keyless, zero rate-limit headers observed across 10 rapid sequential
   requests in live testing. `top=1` means "top articles from the last 1
   day," ranked server-side by Forem, not something this pipeline computes
   itself. The list response's real fields include `id`,
   `public_reactions_count`, and `comments_count` — a genuine two-signal
   engagement pair, the same shape as HN's points/comments and GitHub's
   stars/forks. Its `description` field is real but only ~85-100 chars, too
   thin for genuine LLM judgment (this project's own precedent with
   arXiv/GitHub requires real substantive text, not just a title), so
   `fetchDevtoArticles()` makes one further call per article to `GET
   https://dev.to/api/articles/{id}` for the real `body_markdown` — long-form,
   first-person technical writing (tutorials, experience reports,
   opinion/retrospective posts), a content shape genuinely distinct from
   HN's links, arXiv's papers, and GitHub's repos. The API self-identifies
   via a response "warning" header as "V0 (beta)" and recommends sending
   `Accept: application/vnd.forem.api-v1+json` to use V1 — sent proactively
   on every request even though V0's shape is confirmed still working today,
   since this project should not assume V0 stays supported forever. A
   `User-Agent: daily-dose-pipeline` header is sent for politeness/consistency
   with `fetchGithubTrendingRepos`'s existing convention.
2. **Reddit (r/programming or similar).** Rejected outright — every
   unauthenticated path was confirmed dead via live testing:
   `www.reddit.com/*.json` returns `403 Blocked` on every `User-Agent` tried;
   `old.reddit.com/*.json` redirects to a login page instead of returning
   data; and Reddit's `robots.txt` now blanket-disallows all bots. There is
   no real, keyless surface left to build on.
3. **Lobste.rs.** Rejected on a ToS-adjacent-risk ground, the same ground
   ADR 0006 already used to reject scraping github.com/trending. The JSON
   API genuinely works and returns real `score`/`comment_count` fields, but
   its `robots.txt` publishes an explicit `Content-Signal: ai-input=no,
   ai-train=no`, and its live rate-limiter source code contains a
   human-authored comment asking people not to scrape "a prod service run by
   hobbyists." Also, structurally, Lobste.rs is just a smaller, quieter echo
   of HN — it would not add a genuinely distinct content shape even if the
   ToS signal were absent.
4. **Product Hunt.** Rejected — the only surface with real engagement data
   (votes, comments) is the v2 GraphQL API, which requires full OAuth2 app
   registration, confirmed via a real live `401 invalid_oauth_token` response
   even on bare schema introspection. The one keyless surface, its Atom feed,
   has zero engagement fields, so even if it were used it would not clear
   this project's "genuine two-signal engagement proxy" decision driver.

## Decision Outcome

- New `fetchDevtoArticles()` in `scripts/pipeline.ts`: fetches the `top=1`
  list endpoint, then for EACH returned article makes a further call to the
  detail endpoint to get `body_markdown`, so `RawDevtoArticle` always carries
  real substantive text regardless of which scoring path (real LLM or
  placeholder) ends up being used — matching how `fetchArxivPapers` always
  captures the real abstract. The body text is truncated to
  `DEVTO_BODY_EXCERPT_LENGTH` (1500 characters) before it is ever returned,
  because an uncapped 7000+ character article would dominate a batched LLM
  prompt's token cost among several other items scored in the same call —
  title plus a bounded excerpt is enough for genuine judgment, the same
  reason arXiv abstracts and GitHub descriptions (both naturally short)
  never needed a cap.
- `RawDevtoArticle` + `scoreDevtoPlaceholder()` in `src/lib/curation.ts`: the
  placeholder reuses HN's exact two-signal weighting (reactions weighted like
  points, comments weighted like comments) rather than arXiv's weaker
  recency-only formula, because Dev.to — like HN and GitHub, unlike arXiv —
  has a genuine, comparable engagement signal pair available for free.
- `ScorableItem` in `src/lib/llmCuration.ts` extended with
  `reactions`/`comments`/`bodyText` fields; `buildPrompt()` renders an
  `<engagement>` and `<article_excerpt>` block for Dev.to items. The
  prompt-injection-mitigation instruction text was updated to name Dev.to
  explicitly — an article's body text is user-submitted untrusted content,
  same trust boundary as HN titles, arXiv abstracts, and GitHub descriptions.
- `DigestItemSchema` gets one new optional field, `reactions`, mirroring how
  `points` (HN) and `stars` (GitHub) were each added as one new optional
  field per source.
- Filesystem-safe id: Dev.to article ids are already plain integers, so no
  sanitization is needed — written as `devto-<id>.json`.
- The existing stale-file cleanup in `main()` needed no changes — it is
  already scoped generically by source prefix.

## Consequences

**Good:**

- A genuinely distinct content shape ships: long-form, first-person
  technical writing (tutorials, experience reports, opinion/retrospective
  posts), unlike anything the other three sources surface.
- No new secret, no new credential surface, no change to the LLM cost model
  beyond a few more items per batched call.
- Placeholder fallback is meaningfully calibrated (two real signals, the same
  shape as HN and GitHub), not a weaker single-signal stand-in.
- Verified live: `fetchDevtoArticles()` returned real, current articles with
  real engagement numbers and real, non-empty (already-truncated to 1500
  chars) body text on a real, unauthenticated call — no fabricated data
  anywhere in the fetch path.

**Bad / accepted tradeoffs:**

- The Dev.to API is self-described as "V0 (beta)" — this project sends the
  `Accept: application/vnd.forem.api-v1+json` header proactively, but a
  future breaking change to V1's response shape is a real, not hypothetical,
  risk that a future maintainer should watch for.
- Fetching a full article body for every candidate requires N+1 HTTP calls
  (one list call, one detail call per article) instead of one — acceptable
  for a once-daily job at this batch size, but a real added latency/request
  cost compared to HN/GitHub's single-call fetches.
- The 1500-character body excerpt is a judgment call, not a formally
  optimized parameter — may need tuning once real usage/read patterns exist,
  the same accepted-tradeoff shape as ADR 0006's 7-day GitHub window.

## Confirmation

`npx tsc --noEmit` (clean), `npx vitest run` (40/40, 3 new placeholder
tests), `npm run build` (renders real content), and one real, live,
unauthenticated call to `fetchDevtoArticles()` against the actual Dev.to
API, returning 3 real, current articles with real engagement numbers,
tags, and 1500-character real body-text excerpts (confirmed non-fabricated
by inspecting the actual returned content). The real, paid Bedrock
verification against this new source is deferred to a human with real
credentials, per this task's own instructions — the placeholder and
mocked-LLM-call paths are what's verified here.

## More Information

Closes `Context.md`'s backlog item 11 ("a fourth source — research/framing
phase only"). Builds on ADR 0002 (the multi-source pattern), ADR 0003 (real
LLM curation, which will score Dev.to items via the same generic batched call
with no source-specific code path beyond `buildPrompt`), and ADR 0006
(GitHub as the third source, whose two-signal-placeholder and
detail-call-for-real-text patterns this ADR reuses directly).
