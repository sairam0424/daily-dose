# ADR 0006: Add GitHub as a third ingestion source

**Status:** Accepted, 2026-09-03

## Context and Problem Statement

`DigestItemSchema` has modeled `source: "hn" | "arxiv" | "github"` since the walking skeleton, but GitHub was never wired up — deliberately deferred per `Context.md`'s roadmap until arXiv had proven the multi-source pattern for a while (ADR 0002). That condition is now satisfied. Unlike HN (a canonical front page) or arXiv (a canonical newest-submissions feed), GitHub has no single obvious "what does a daily digest surface" answer — this ADR covers that specific product decision and its technical execution.

## Decision Drivers

- Real, live data only — no scraping GitHub's unofficial Trending page (fragile, no stable API contract, arguable ToS risk) and no fabricated/hardcoded content, matching this project's load-bearing no-fake-data constraint.
- Prefer a source with a genuine two-signal engagement proxy (like HN's points/comments) over a weak single-signal one (like arXiv's recency-only), if a real option exists — it does.
- Keep the credential surface unchanged - GitHub sourcing must not require any new secret.

## Considered Options

1. **GitHub Search API, sorted by stars, filtered to recently-created non-forks (chosen).** `GET /search/repositories?q=created:>DATE fork:false&sort=stars&order=desc` — official, free, keyless (rate-limited to 10 requests/minute unauthenticated, confirmed via a real live call; comfortably enough for a once-daily job). Surfaces genuinely new repositories gaining traction, the closest real analogue to "what's rising right now" without an unofficial scrape.
2. **Curated watchlist of specific repos/orgs, tracking new Releases.** Considered and explicitly rejected by the user in favor of option 1 — more predictable but requires maintaining a list over time and forgoes organic discovery of new projects, which doesn't match this digest's "surface what's actually happening" spirit.
3. **Scraping github.com/trending.** Rejected outright — no official API backs that page, its exact ranking algorithm is undocumented and can change without notice, and scraping HTML violates this project's real-data-via-real-API discipline that every other source follows.

## Decision Outcome

- New `fetchGithubTrendingRepos()` in `scripts/pipeline.ts`: queries a 7-day trailing window (`GITHUB_TRENDING_WINDOW_DAYS`), `fork:false` confirmed via a real live query to actually exclude forks (not an unverified assumption), sends a `User-Agent` header (required by GitHub's API for unauthenticated requests).
- `RawGithubRepo` + `scoreGithubPlaceholder()` in `src/lib/curation.ts`: the placeholder reuses HN's exact two-signal weighting (stars weighted like points, forks weighted like comments) rather than arXiv's weaker recency-only formula, because GitHub - like HN, unlike arXiv - has a genuine, comparable engagement signal pair available for free.
- `ScorableItem` in `src/lib/llmCuration.ts` extended with `stars`/`forks`/`language`/`description` fields; `buildPrompt()` renders an `<engagement>` and `<description>` block for GitHub items. The prompt-injection-mitigation instruction text was updated to name GitHub explicitly - a repo's `description` field is user-controlled untrusted text, same trust boundary as HN titles and arXiv abstracts.
- `DigestItemSchema` gets one new optional field, `stars`, mirroring how `points`/`hn_id` were added for HN.
- Filesystem-safe id: `full_name` (`"owner/repo"`) has its slash replaced with a hyphen, written as `github-owner-repo.json`.
- The existing stale-file cleanup in `main()` needed no changes - it is already scoped generically by source prefix.

## Consequences

**Good:**
- Verified end-to-end with a real, live, paid Bedrock call (5 real repos, ~$0.0125): the model correctly scored the highest-star repo in the batch (6,749 stars) *low* because its description was vague and buzzword-heavy, and a much lower-star repo higher because its description was concrete and well-scoped - live proof the "don't conflate engagement with genuine interest" design intent (already proven for HN) holds for GitHub too.
- No new secret, no new credential surface, no change to the LLM cost model beyond a few more items per batched call.
- Placeholder fallback is meaningfully calibrated (two real signals), not a weaker single-signal stand-in.

**Bad / accepted tradeoffs:**
- Unauthenticated GitHub Search API is rate-limited to 10 requests/minute - fine for a once-daily job today, but would need a token (a new, low-stakes credential, unlike Bedrock's) if this ever needed to run more frequently or fetch a larger sample.
- A 7-day trailing window is a judgment call, not a formally optimized parameter - may need tuning once real usage/read patterns exist.

## Confirmation

`npx tsc --noEmit` (clean), `npx vitest run` (28/28, 3 new placeholder tests), `npm run build` (renders real content), and one real, live, paid Bedrock run against 5 real GitHub repos fetched live from the Search API, producing genuinely substantive, honest scoring committed to `src/data/digest/2026-09-03/`.

## More Information

Closes the last item on `Context.md`'s Roadmap and `tech.md`'s Hold list. Builds on ADR 0002 (the multi-source pattern), ADR 0003 (real LLM curation, which scores GitHub items via the same generic batched call with no source-specific code path beyond `buildPrompt`), and ADR 0005 (Sonnet 5, which is what actually scored the seeded data above).
