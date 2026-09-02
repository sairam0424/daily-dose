# Project Status

> Living snapshot. Update this file whenever phase, health, or active work
> changes — do not let it go stale across a phase boundary.

**Last updated:** 2026-09-02

## Overall Status

**Phase:** 6 — Walking Skeleton complete (Phase 7 cross-project reconciliation also done)
**Health:** 🟡 Active — stable, but genuinely blocked on real LLM keys (see below)

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

**No live LLM API call exists anywhere in this codebase.** No
Anthropic/OpenAI API keys are available in this environment. The
"curation" step (assigning `interest_score` and writing `why_read`) is a
deterministic, clearly-labeled placeholder function derived only from
real, already-fetched HN fields (`points`, `num_comments`, title) — never
fabricated or hardcoded data. This is the single biggest deferred item in
the project, documented here and in `decisions.md`/ADR 0001, not hidden.
arXiv ingestion does not exist yet either — HN is the only live source
today; arXiv is a single-source fast-follow, noted explicitly rather than
silently dropped.

## Active Specs & Plans

| Spec / Plan                                                        | Phase | Status      |
| -------------------------------------------------------------------- | ----- | ----------- |
| Pre-scaffold docs (`SECURITY.md`, `SUPPORT.md`, `status.md`, `decisions.md`, `telemetry.md`) | 6     | Complete    |
| Core pipeline: fetch HN Algolia API → placeholder score → write validated digest JSON | 6     | **Complete — verified with a real live HN fetch, 5 real stories committed** |
| Astro static site: Content Collections + digest listing + Chart.js island | 6     | **Complete — `astro build` confirmed rendering real content and real chart data** |
| CI: `workflow_dispatch` + push/PR triggers (build + test)            | 6     | Complete, green |
| arXiv ingestion (second source)                                      | 7     | Planned, not started |
| Real LLM curation (replacing the placeholder scoring function)       | 7+    | Planned, not started — blocked on API keys |
| `schedule:` cron trigger for automated daily runs                    | 7+    | Planned, not started — blocked on real LLM keys + explicit go-ahead |
| Real Vercel deployment                                               | 7+    | Planned, not started — blocked on explicit go-ahead |

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

## Upcoming Milestones

1. Fast-follow: add arXiv as a second ingestion source, now that HN-only
   is proven end to end.
2. Blocked fast-follow: replace the placeholder scoring function with a
   real LLM call, once API keys exist — must ship with the
   prompt-injection sanitization/isolation design from `SECURITY.md`
   already in place, not retrofitted after.
3. Blocked fast-follow: enable the `schedule:` cron trigger for automated
   daily runs — requires real LLM keys (so the automated run has
   something meaningful to curate) and the user's explicit go-ahead.
4. Blocked fast-follow: connect a real Vercel deployment — requires the
   user's explicit go-ahead.
5. Add an automated content-collection integration test and an `astro
   build` e2e smoke test to CI (currently `codebase_map.md` lists both as
   planned but not yet written).

## Risks & Blockers

- **Blocker: no LLM API keys exist in this environment.** This blocks
  real curation — today's `interest_score`/`why_read` output is an
  honest, deterministic placeholder, not a model output. Cannot be
  resolved by this project alone; needs the user to provision
  Anthropic/OpenAI credentials as GitHub Encrypted Secrets (see
  `SECURITY.md`) before real curation can be built.
- **Blocker: no Vercel connection exists yet.** This blocks real
  deployment — the site currently only builds and tests in CI, it does
  not serve traffic anywhere. Requires the user's explicit go-ahead to
  connect a Vercel project.
- **Blocker: the `schedule:` cron trigger is not enabled.** This blocks
  automated daily runs — CI currently only runs on `workflow_dispatch`
  (manual trigger) plus push/PR. Enabling the cron is gated on both real
  LLM keys existing (so a scheduled run produces a real digest, not a
  placeholder one on autopilot) and the user's explicit go-ahead.
- **Risk:** because real LLM scoring doesn't exist yet, the
  prompt-injection-sanitization requirement in `SECURITY.md` is currently
  a documented design requirement, not implemented and verified code.
  Watch for this being skipped or under-scoped when that fast-follow
  actually starts.
- **Risk:** HN-only ingestion means the digest's "interest" signal is
  entirely driven by HN's own points/comment-count dynamics today — this
  is an accepted, documented limitation of a single-source walking
  skeleton, not a hidden gap.
