# Architecture — daily-dose

This is daily-dose's **own** architecture document. Per arc42/C4 convention,
daily-dose is "the system" from its own point of view — everything outside
this repo's boundary (including the Not-Humans-Lab umbrella and its other
sibling projects) is an external actor, not an internal component. It
describes the walking-skeleton shape of the pipeline + site: what exists (or
is about to exist) at this phase, not speculative future features.

## Context & Scope

daily-dose is a standalone, independent GitHub repository — a daily
AI-curated technical digest (Hacker News + arXiv + GitHub), matching this workspace's
polyrepo convention (it is not nested inside Not-Humans-Lab). It is the
author's own version of
[arpitbbhayani/the-daily-diff](https://github.com/arpitbbhayani/the-daily-diff),
and is the third of three independent sibling projects under that umbrella.

**daily-dose is a content site with a data pipeline, not a CLI or a skills
library.** Its product shape is fundamentally different from both completed
siblings (nh-deck, a local-first presentation CLI; nh-skills, an agent-skills
collection) — their architectures are referenced only as documentation-
convention precedent, never copied structurally.

```
                    ┌───────────────────────────────┐
                    │   Not-Humans-Lab (umbrella)    │
                    │  docs-only meta-repo, holds     │
                    │  cross-cutting system docs      │
                    │  (../Not-Humans-Lab/)           │
                    └───────────────┬─────────────────┘
                                    │ (thematic/lineage only —
                                    │  no build/runtime dependency)
                                    ▼
   ┌───────────────┐      ┌─────────────────────┐      ┌───────────────────┐
   │  nh-skills     │      │      nh-deck         │      │    daily-dose      │
   │  (sibling,     │      │  (sibling,            │      │  THIS repo:         │
   │  shipped)      │      │   shipped)            │      │  digest pipeline     │
   └───────────────┘      └─────────────────────┘      │  + static site       │
                                                        └──────────┬───────────┘
                                                    live HTTP GET  │  real Bedrock call
                                          ┌─────────────────────┐ │ ┌──────────────────────┐
                                          │ HN Algolia / arXiv /  │◀┘▶│  AWS Bedrock           │
                                          │ GitHub Search APIs    │   │  (Sonnet 5→Sonnet 4.6→Opus→Haiku,   │
                                          │ (free, keyless)       │   │   shared cred w/       │
                                          └───────────────────────┘   │   Anvilry — ADR 0003)  │
                                                                       └────────────────────────┘
```

- **Not-Humans-Lab** (external actor): docs-only meta-repo holding
  cross-cutting, system-level docs shared by the three sibling projects.
  Read from (relative links), never duplicated into this repo.
- **nh-skills, nh-deck** (external actors): completed sibling projects,
  referenced only as documentation-convention precedent (the
  `AGENTS.md`/`CLAUDE.md`/`SOUL.md`/`Context.md` pattern, linking to
  `../Not-Humans-Lab/` by relative path). Neither is a runtime dependency of
  daily-dose, and neither's architecture is copied here.
- **Hacker News Algolia API + arXiv Atom API + GitHub Search API** (external
  actors): free, keyless public APIs (`hn.algolia.com/api/v1/search?tags=front_page`,
  `export.arxiv.org/api/query`, `api.github.com/search/repositories` — the
  last rate-limited to 10 requests/minute unauthenticated, confirmed via a
  real call, see ADR 0006). daily-dose's pipeline makes real, live HTTP
  GETs against all three.
- **AWS Bedrock** (external actor, as of ADR 0003 — 2026-09-02): a real,
  paid LLM API. `src/lib/llmCuration.ts` makes one forced-tool-use batched
  call per pipeline run, using a credential shared with the sibling Anvilry
  project's production chatbot (as of ADR 0005, Sonnet 5 leads). Model
  fallback chain: Claude Sonnet 5 → Sonnet 4.6 →
  Opus 4.6 → Haiku 4.5.
- **In scope for daily-dose itself**: fetching live HN + arXiv + GitHub data;
  scoring each item via a real Bedrock LLM call, with a deterministic
  placeholder `interest_score`/`why_read` fallback for missing credentials
  or a per-item response gap; validating each item against a shared schema;
  writing one dated JSON file per pipeline run; rendering that data as a
  static site with one chart; tracking real per-run LLM cost.
- **Out of scope for daily-dose itself**: anything belonging to nh-deck,
  nh-skills, or Not-Humans-Lab. (HN, arXiv, and GitHub sourcing, scheduled
  runs, and real deployment are all in scope and shipped — see ADR 0004
  and ADR 0006.)

## Building Block View

Six real building blocks make up the system:

```
daily-dose/
├── src/lib/digestSchema.ts     Building block 1: the shared Zod schema
│                                    — DigestItemSchema, exported once and
│                                      imported by both building blocks 2
│                                      and 4 below. The single source of
│                                      truth for what a digest item is.
│
├── src/lib/llmCuration.ts       Building block 2: real AWS Bedrock LLM
│                                    scoring — one forced-tool-use batched
│                                      call per run, Sonnet 5→Sonnet 4.6→Opus→Haiku
│                                      fallback, Zod-validated response.
│                                      The default scoring path (ADR 0003).
│
├── src/lib/curation.ts           Building block 3: the deterministic
│                                    placeholder scorer — now an explicit
│                                      fallback used only without Bedrock
│                                      credentials or on a per-item gap in
│                                      building block 2's response.
│
├── scripts/pipeline.ts            Building block 4: the pipeline script
│                                    — fetch (live HN Algolia + arXiv Atom +
│                                      GitHub Search APIs) -> score (building
│                                      block 2, falling back to building
│                                      block 3) -> validate (DigestItemSchema)
│                                      -> write one dated JSON file per item,
│                                      plus real per-run cost via
│                                      src/lib/costTracking.ts.
│
├── src/content.config.ts           Building block 5: the Astro Content
│                                    Collection config — glob loader reads
│                                      src/data/digest/*.json, validates
│                                      every entry against the SAME
│                                      DigestItemSchema import.
│
└── src/pages/index.astro            Building block 6: the page — renders the
                                       latest digest's items plus one
                                       Chart.js bar-chart island of the
                                       day's interest_score values.
```

Relationships:

- Building block 1 (the schema) has no dependency on the other blocks — it
  is a pure Zod object, independently unit-testable and imported by, but
  never importing from, building blocks 4 and 5.
- Building block 2 (real LLM scoring) depends on AWS Bedrock (external,
  real network+auth) and is imported by building block 4. It never
  imports building block 3, and building block 3 never imports it — the
  pipeline script (building block 4) is the only place that chooses
  between them.
- Building block 3 (the placeholder fallback) has no network dependency —
  pure, deterministic functions over already-fetched fields.
- Building block 4 (the pipeline) depends on building block 1 for
  validation, on building blocks 2 and 3 for scoring, and on the live HN
  Algolia, arXiv, and GitHub Search APIs for its input data. It is the only
  building block that performs real network calls (HN, arXiv, GitHub, and —
  via building block 2 — Bedrock).
- Building block 5 (the content collection config) depends on building
  block 1 for validation and on building block 4's output on disk
  (`src/data/digest/*.json`) — but has no direct code dependency on
  building block 4 itself; it only reads what building block 4 already
  wrote and committed.
- Building block 6 (the page) depends on building block 5's typed,
  validated collection entries — it never reads `src/data/digest/*.json`
  directly, and never calls the schema or the pipeline itself.

## Runtime View

### Flow 1 — `npm run pipeline`

```
 1. Run: npm run pipeline  (wraps `tsx scripts/pipeline.ts`)
              │
              ▼
 2. scripts/pipeline.ts fetches the live HN front page
    (hn.algolia.com), newest arXiv papers (export.arxiv.org), and
    recently-created GitHub repos sorted by stars
    (api.github.com/search/repositories) — three real, keyless, free
    HTTP GETs, one per source enabled via --sources
              │
              ▼
 3. If Bedrock credentials are configured (the default): score every
    fetched item (HN + arXiv + GitHub) in ONE real, forced-tool-use Bedrock
    call (src/lib/llmCuration.ts) — Sonnet 5→Sonnet 4.6→Opus→Haiku fallback,
    Zod-validated response, real per-run cost recorded via
    src/lib/costTracking.ts. Otherwise (e.g. local dev without
    credentials), or for any item the LLM's response omits: fall
    back to the deterministic placeholder heuristic
    (src/lib/curation.ts), always with a loud console warning
              │
              ▼
 4. Validate each resulting item against DigestItemSchema
    (src/lib/digestSchema.ts) — reject/fail loudly on any item
    that doesn't conform, rather than writing invalid data
              │
              ▼
 5. Write the validated array to
    src/data/digest/YYYY-MM-DD/ (one folder per run; one file per story, e.g. hn-49508225.json)
```

### Flow 2 — `npm run build`

```
 1. Run: npm run build  (wraps `astro build`, output: "static")
              │
              ▼
 2. src/content.config.ts's glob loader reads every
    src/data/digest/*.json file already committed to the repo
              │
              ▼
 3. Each file's entries are validated against the SAME
    DigestItemSchema import used in Flow 1 — one schema,
    two enforcement points, zero drift
              │
              ▼
 4. src/pages/index.astro renders the latest digest's items and
    a Chart.js bar chart of that digest's interest_score values
              │
              ▼
 5. Astro emits a fully static site — no server runtime, no SSR
```

**As of 2026-09-02 (ADR 0003), Flow 1 makes a real, paid Bedrock LLM call by
default.** As of 2026-09-03 (ADR 0004), Flow 1 also now runs unattended once
a day via `.github/workflows/daily-pipeline.yml`'s real `schedule:` trigger
(a separate workflow from `ci.yml`, requesting `contents: write` on itself
only), committing its own output. **The site is deployed** at
https://daily-dose-hazel-delta.vercel.app — Vercel git-integrated, deploying
on push to `main`, Build Command confirmed via real build logs as
`npm run build` only (never the pipeline). See `tech.md`'s Adoption status.

## Cross-references

- Umbrella-level, cross-cutting architecture context (C4 Level 1, with
  daily-dose as one of three sibling boxes) is owned by
  `../Not-Humans-Lab/architecture.md` — link there rather than duplicating.
- This repo's literal file/directory tour lives in `codebase_map.md`
  alongside this file.
- The technology choices underlying these building blocks, and the
  rationale for the real-LLM-as-default and cron/deploy decisions, are
  documented in `tech.md` and `decisions.md` ADR 0004.
- Test strategy for the two runtime flows above (schema/unit-testing the
  placeholder scorer, mocked-Bedrock-call unit-testing `llmCuration.ts`,
  integration-testing the pipeline against mocked HN/arXiv responses,
  e2e-testing `astro build`) is documented in `TESTING.md`.
