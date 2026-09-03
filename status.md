# Project Status

> Living snapshot. Update this file whenever phase, health, or active work
> changes — do not let it go stale across a phase boundary.

**Last updated:** 2026-09-03

## Overall Status

**Phase:** 9 — Digest archive + RSS feed shipped; every original roadmap item is done
**Health:** 🟢 Active — stable, real curation verified live; cron automation shipped (ADR 0004), Vercel deployment live at https://daily-dose-hazel-delta.vercel.app, readers can now browse history (`/archive/`) and subscribe (`/rss.xml`)

daily-dose is an independent, standalone GitHub repository — a daily
AI-curated technical digest (arXiv + Hacker News), in the spirit of
`arpitbbhayani/the-daily-diff`. It is the third of three sibling projects
(`daily-dose`, `nh-deck`, `nh-skills`) under the "Not-Humans-Lab"
umbrella; cross-cutting system-level docs for that umbrella live in the
separate, docs-only meta-repo at `../Not-Humans-Lab/` (linked by relative
path, not duplicated here). `nh-deck` and `nh-skills` have both already
completed their own Phase 1–4 and are usable as completed precedent for
house style/doc conventions — not as content or architecture to copy,
since daily-dose's product shape (a content site with a data pipeline) is
fundamentally different from a rendering CLI or a Markdown-skills
collection.

Tech stack: Astro (`output: "static"`) for the front end, with Astro
Content Collections reading `src/data/digest/*.json` via the glob loader,
validated against the same Zod schema (`src/lib/digestSchema.ts`) the
pipeline script writes against — one schema, two enforcement points, zero
drift. A separate TypeScript/Node pipeline script (`scripts/pipeline.ts`,
run via `tsx`) fetches from Hacker News' free, keyless Algolia API and
writes one validated file per story into a dated `src/data/digest/YYYY-MM-DD/` folder. Styling is
minimal inline CSS (no Bulma/Sass) for this walking skeleton, matching
`nh-deck`'s precedent of deferring visual polish. One Chart.js island
(plain `<script type="module">` importing `chart.js/auto`) renders a bar
chart of the day's interest scores. License: Apache-2.0, matching the
sibling projects.

**Real LLM curation is now live**, via AWS Bedrock (`@anthropic-ai/bedrock-sdk`,
model fallback chain Sonnet 5 → Sonnet 4.6 → Opus 4.6 → Haiku 4.5, Sonnet 5
leading as of ADR 0005). `src/lib/llmCuration.ts`
scores every fetched item (HN + arXiv + GitHub) in one forced-tool-use batched call per
pipeline run when `BEDROCK_ACCESS_KEY_ID`/`BEDROCK_SECRET_ACCESS_KEY` are
configured (they are, both locally and in this repo's GitHub Secrets). The
deterministic placeholder functions in `src/lib/curation.ts` are kept as an
explicit, loudly-logged fallback for local dev without credentials — never
silently. Real per-run cost is computed and logged via `src/lib/costTracking.ts`
against a verified Bedrock pricing table, with a rolling 7-day-average anomaly
check (not a fixed dollar ceiling — see ADR 0003 for why). See `decisions.md`/
ADR 0003 for full rationale, and `agent_learning.md` for two real bugs found
and fixed while wiring this in (a base64-credential-decoding auth failure and
a stale-digest-file accumulation bug). arXiv ingestion ships for real —
`fetchArxivPapers()` fetches live from arXiv's Atom API by default alongside
HN, and now also captures each paper's real abstract (`summary`) so the LLM
has substantive content to judge, not just a title — see `decisions.md` ADR
0002 (source) and ADR 0003 (the `summary` field addition).

## Active Specs & Plans

| Spec / Plan                                                        | Phase | Status      |
| -------------------------------------------------------------------- | ----- | ----------- |
| Pre-scaffold docs (`SECURITY.md`, `SUPPORT.md`, `status.md`, `decisions.md`, `telemetry.md`) | 6     | Complete    |
| Core pipeline: fetch HN Algolia API → placeholder score → write validated digest JSON | 6     | **Complete — verified with a real live HN fetch, 5 real stories committed** |
| Astro static site: Content Collections + digest listing + Chart.js island | 6     | **Complete — `astro build` confirmed rendering real content and real chart data** |
| CI: `workflow_dispatch` + push/PR triggers (build + test)            | 6     | Complete, green |
| arXiv ingestion (second source)                                      | 7     | **Complete — real live fetch, capped placeholder score, merged PR #1** |
| Content-collection integration test + astro-build e2e test            | 7     | **Complete — merged PR #1, closes the codebase_map.md/TESTING.md gap** |
| Real LLM curation via AWS Bedrock (replacing both placeholder scoring functions as the default path) | 8 | **Complete — verified with 3 real live Bedrock calls, see ADR 0003** |
| Public `/stats` cost-transparency page                                | 8     | **Complete — real totals/by-model/by-day from `src/data/stats.jsonl`** |
| `schedule:` cron trigger for automated daily runs                    | 9     | **Complete — `.github/workflows/daily-pipeline.yml`, see ADR 0004** |
| Real Vercel deployment                                               | 9     | **Complete — live at https://daily-dose-hazel-delta.vercel.app, git-integrated, deploys on push to `main`** |

## Recent Progress

- Decided and documented the full tech stack: Astro static output, Astro
  Content Collections via the glob loader, a shared Zod schema enforced
  at both the pipeline-write and site-read boundaries, a standalone
  `tsx`-run TypeScript pipeline script, HN Algolia as the sole live data
  source for this phase, a deterministic placeholder scoring function
  (never a live model call), minimal inline CSS, one Chart.js island, and
  Apache-2.0 licensing (applied identically across all three sibling
  projects).
- Wrote the pre-scaffold governance docs: `SECURITY.md` (naming
  prompt-injection-via-ingested-content as a hard requirement for the
  future real-LLM step, plus the shared-schema and keyless-fetch
  considerations), `SUPPORT.md`, this file, `decisions.md`, ADR 0001, and
  `telemetry.md` (a design-ahead-of-implementation cost/token accounting
  spec for when real LLM calls eventually exist).
- Scaffolded `package.json`, `astro.config.mjs`, and the initial
  `scripts/pipeline.ts`.
- Fixed a real architecture bug found during the walking-skeleton build:
  the pipeline originally wrote one array-per-day file, incompatible with
  Astro's `glob()` loader (one schema-matching object per file). Rewrote
  it to write one file per story into a dated folder, matching what the
  reference project (`the-daily-diff`) actually does. Extracted the
  placeholder scoring logic into its own `src/lib/curation.ts`.
- Phase 7 cross-project reconciliation: added `Branches.md` (copied
  verbatim from Not-Humans-Lab), `agent_learning.md`, and
  `anti-patterns.md` (all three were missing from the original scaffold).
- Shipped arXiv as a second source (PR #1): `fetchArxivPapers()` (Atom API
  via `fast-xml-parser`) + `scoreArxivPlaceholder()` (recency-only,
  capped [3,8]), `main()` now runs both sources by default. Same PR closed
  the two documented test gaps (`content-collection.test.ts`,
  `build-output.test.ts`).
- Shipped real LLM curation via AWS Bedrock (ADR 0003): new
  `src/lib/llmCuration.ts` (one forced-tool-use batched call scoring every
  fetched item, Sonnet 5→Sonnet 4.6→Opus→Haiku fallback, Zod-validated response) and
  `src/lib/costTracking.ts` (real per-run cost + rolling-average anomaly
  check, appended to `src/data/stats.jsonl`). Extended `fetchArxivPapers`
  to capture each paper's real abstract. Fixed a real, separate
  stale-file-accumulation bug discovered while re-running the pipeline
  same-day. Verified end-to-end with 3 real live Bedrock calls (~$0.054
  total). 9 new mocked unit tests in `tests/llmCuration.test.ts`.
- Shipped the public `/stats` page (`src/pages/stats.astro`): totals,
  by-model, and by-day cost breakdowns read directly from
  `src/data/stats.jsonl` at build time. Also fixed stale copy in
  `index.astro` left over from before real LLM curation shipped (the
  footer still claimed "no LLM calls," the tagline still said "eventually
  arXiv"). New e2e test `tests/stats-page.test.ts`.
- Shipped `schedule:` cron automation (ADR 0004): new
  `.github/workflows/daily-pipeline.yml`, a dedicated workflow (separate
  from `ci.yml`) that requests `contents: write` on itself only, runs
  `npm run pipeline` daily at 21:00 UTC, and commits the result via a
  bot identity scoped strictly to `src/data/digest/**` and
  `src/data/stats.jsonl` — a narrow, documented exception to
  `Branches.md`'s PR-for-every-change convention. Preceded by a
  deep-research pass on the reference project (`the-daily-diff`), which
  found no transferable CI/cron playbook to copy (zero GitHub Actions
  workflows in that repo) — see the ADR for the full findings and the
  rejected "regenerate at Vercel build time" alternative.
- Connected the Vercel deployment (2026-09-03, same ADR): git-integrated,
  production auto-deploy on push to `main`, Build Command confirmed via
  real build logs as `npm run build` only (never the pipeline), so Vercel
  never sees the Bedrock credential. Live at
  https://daily-dose-hazel-delta.vercel.app — verified serving real
  content on both `/` and `/stats`.
- Shipped a digest archive/history feature and a real RSS feed
  (2026-09-03, via a two-stage dynamic workflow — no new ADR, read-only
  against already-committed content): `src/pages/archive/index.astro`
  lists every distinct date; `src/pages/archive/[date].astro` renders one
  static page per date with older/newer navigation; `src/pages/rss.xml.ts`
  (`@astrojs/rss`) emits one real `<item>` per day, linking to the matching
  archive page. Extracted `DigestList.astro`/`DigestChart.astro` shared
  components and a `groupEntriesByDate()` helper so `index.astro`'s
  behavior stayed identical while the archive reused the same rendering.
  Found and fixed a real double-escaping bug during review before
  shipping — `@astrojs/rss` already entity-escapes the whole feed content
  once, so a local pre-escape step would have double-escaped any title
  containing `&`/`<`/`>` — fixed with a dedicated regression test. See
  `agent_learning.md` for the full root-cause writeup.
- Added scheduled-run failure notification to `daily-pipeline.yml`
  (2026-09-03): a new final step, gated `if: failure()`, using the official
  `actions/github-script@v7` action (pinned by major version tag, not
  SHA-pinned — matches this repo's convention for official `actions/*`
  actions) files a GitHub Issue labeled `automated-failure` with the failed
  run's URL and a timestamp, or comments on the existing open one instead of
  filing a duplicate on repeat failures. Needs no new secret — only
  `issues: write` was added to this workflow's own `permissions:` block.
  Closes ADR 0004's deferred "richer alerting is a non-goal" line; see that
  ADR's Update section and `decisions.md`'s matching log entry.

## Upcoming Milestones

Every item on the original roadmap (real LLM curation, cron, Vercel,
`/stats`, a third source) and both real candidates raised afterward
(digest archive, RSS feed) are now shipped. No open milestones are
currently tracked — the next one is whatever gets decided next.

## Risks & Blockers

- **Risk: the live Vercel site has no custom domain and no branch protection on `main`.** Anyone who can push to `main` (or merge a PR) triggers a real production redeploy — an accepted tradeoff for a personal project, not currently hardened further.
- **Risk: the daily cron is live and will start spending real money on
  every scheduled run, indefinitely, once merged.** This is an accepted
  tradeoff (ADR 0004), not an oversight — disable the schedule if this
  needs to pause.
- **Risk:** the Bedrock credential wired in is shared with the sibling
  Anvilry project's production chatbot — rotating it is now a two-repo
  operation. See `SECURITY.md` and ADR 0003.
- **Risk:** the rolling-average cost-anomaly check (see `telemetry.md`)
  can only warn after an anomalously expensive call already completed —
  it is not a hard pre-call budget ceiling. Accepted for a single-batched-
  call-per-day design; would need revisiting if the call pattern changes.
- **Risk:** arXiv's placeholder score is weaker than HN's by design
  (recency only, capped at [3,8] vs. HN's full 0-10 range) — this now
  only matters when the LLM fallback triggers (missing credentials, or a
  per-item gap in the LLM's response), since real LLM scoring is the
  default path. Documented in `decisions.md` ADR 0002, not a hidden gap.
