# Architecture — daily-dose

This is daily-dose's **own** architecture document. Per arc42/C4 convention,
daily-dose is "the system" from its own point of view — everything outside
this repo's boundary (including the Not-Humans-Lab umbrella and its other
sibling projects) is an external actor, not an internal component. It
describes the walking-skeleton shape of the pipeline + site: what exists (or
is about to exist) at this phase, not speculative future features.

## Context & Scope

daily-dose is a standalone, independent GitHub repository — a daily
AI-curated technical digest (arXiv + Hacker News), matching this workspace's
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
                                                                   │ live HTTP GET
                                                        ┌──────────▼───────────┐
                                                        │  HN Algolia API        │
                                                        │  (hn.algolia.com,      │
                                                        │   free, keyless)       │
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
- **Hacker News Algolia API** (external actor, and the *only* live network
  dependency this system has): a free, keyless public API
  (`hn.algolia.com/api/v1/search?tags=front_page`). daily-dose's pipeline
  makes a real, live HTTP GET against it — this is the one genuinely real
  integration in the whole system.
- **Anthropic/OpenAI APIs** (explicitly **not** an actor in this phase): no
  LLM API is called anywhere in this system yet. No keys exist in this
  environment. Any future integration is a documented fast-follow, not part
  of this architecture until it actually lands.
- **In scope for daily-dose itself**: fetching live HN front-page data;
  computing a deterministic, clearly-labeled placeholder
  `interest_score`/`why_read` per item from real HN fields; validating each
  item against a shared schema; writing one dated JSON file per pipeline
  run; rendering that data as a static site with one chart.
- **Out of scope for daily-dose itself**: any live LLM call, arXiv/GitHub
  sourcing (schema-modeled, not yet implemented), scheduled/automated runs,
  any real deployment target, and anything belonging to nh-deck, nh-skills,
  or Not-Humans-Lab.

## Building Block View

Four real building blocks make up the walking skeleton:

```
daily-dose/
├── src/lib/digestSchema.ts     Building block 1: the shared Zod schema
│                                    — DigestItemSchema, exported once and
│                                      imported by both building blocks 2
│                                      and 3 below. The single source of
│                                      truth for what a digest item is.
│
├── scripts/pipeline.ts          Building block 2: the pipeline script
│                                    — fetch (live HN Algolia API) ->
│                                      placeholder-score (deterministic,
│                                      derived from points/num_comments/
│                                      title) -> validate (DigestItemSchema)
│                                      -> write one dated JSON file.
│
├── src/content.config.ts         Building block 3: the Astro Content
│                                    Collection config — glob loader reads
│                                      src/data/digest/*.json, validates
│                                      every entry against the SAME
│                                      DigestItemSchema import.
│
└── src/pages/index.astro          Building block 4: the page — renders the
                                       latest digest's items plus one
                                       Chart.js bar-chart island of the
                                       day's interest_score values.
```

Relationships:

- Building block 1 (the schema) has no dependency on the other three — it
  is a pure Zod object, independently unit-testable and imported by, but
  never importing from, building blocks 2 and 3.
- Building block 2 (the pipeline) depends on building block 1 for
  validation and on the live HN Algolia API for its input data. It is the
  only building block that performs a real network call.
- Building block 3 (the content collection config) depends on building
  block 1 for validation and on building block 2's output on disk
  (`src/data/digest/*.json`) — but has no direct code dependency on
  building block 2 itself; it only reads what building block 2 already
  wrote and committed.
- Building block 4 (the page) depends on building block 3's typed,
  validated collection entries — it never reads `src/data/digest/*.json`
  directly, and never calls the schema or the pipeline itself.

## Runtime View

### Flow 1 — `npm run pipeline`

```
 1. Run: npm run pipeline  (wraps `tsx scripts/pipeline.ts`)
              │
              ▼
 2. scripts/pipeline.ts fetches the live HN front page via
    hn.algolia.com/api/v1/search?tags=front_page (real, keyless,
    free HTTP GET — the only network call in this flow)
              │
              ▼
 3. For each returned story, compute a deterministic placeholder
    interest_score and why_read string from real fields only
    (points, num_comments, title) — clearly commented as a
    stand-in for a future real LLM call, never a live model call
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

**Explicitly, as of this phase: no live LLM call exists anywhere in either
flow, no `schedule:` cron trigger is enabled (CI is `workflow_dispatch` +
push/PR only), and no real deployment target (Vercel or otherwise) is
connected.** All three are documented, deliberate deferrals — see `tech.md`'s
Adoption status and Hold list.

## Cross-references

- Umbrella-level, cross-cutting architecture context (C4 Level 1, with
  daily-dose as one of three sibling boxes) is owned by
  `../Not-Humans-Lab/architecture.md` — link there rather than duplicating.
- This repo's literal file/directory tour lives in `codebase_map.md`
  alongside this file.
- The technology choices underlying these building blocks, and the
  rationale for the placeholder-scoring and no-cron/no-deploy deferrals, are
  documented in `tech.md`.
- Test strategy for the two runtime flows above (schema/unit-testing the
  placeholder scorer, integration-testing the pipeline against a mocked HN
  response, e2e-testing `astro build`) is documented in `TESTING.md`.
