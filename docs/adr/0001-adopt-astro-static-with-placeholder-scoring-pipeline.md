# 0001. Adopt Astro static with a placeholder-scoring pipeline

## Status

Accepted — 2026-09-02

## Context and Problem Statement

daily-dose is a daily AI-curated technical digest (arXiv + Hacker News),
built as our own version of `arpitbbhayani/the-daily-diff`, inside the
three-project "Not-Humans-Lab" suite (`daily-dose`, `nh-deck`,
`nh-skills`). Before writing the first real pipeline run, we need to
decide: the front-end framework and rendering mode for the site, the
pipeline script's language/runtime, how digest data is validated and
persisted between the pipeline and the site, and — critically — what the
"curation" step actually does given a hard environmental constraint:
**no Anthropic/OpenAI API keys are available in this environment.**

That constraint rules out any design that requires a live LLM call to
produce a working walking skeleton. We still want a real, live data
pipeline — not a mock — so the FETCH step (Hacker News' free, keyless
Algolia API) must be genuinely live. Only the SCORING/SUMMARIZATION step
is affected by the missing keys, and it must be handled honestly: a
clearly-labeled, deterministic placeholder derived from real fetched
fields, never fabricated data and never a silent no-op disguised as a
working feature.

We also want a walking skeleton fast: a minimal, correct fetch → score →
validate → write → render loop, gated by CI, before investing in a
second data source (arXiv) or real LLM curation. Every choice below is
evaluated against that near-term goal as well as long-term
maintainability.

## Decision Drivers

- **No LLM API keys exist.** Any option that requires a live model call
  to produce a working demo is disqualified for this phase. The
  placeholder scoring step must be honest and clearly labeled as a
  placeholder — not hidden, not disguised as real curation.
- **The fetch must still be real.** Faking or hardcoding HN data (even to
  "simplify" the walking skeleton) would defeat the purpose of building a
  pipeline at all and would risk silently looking like it works while
  doing nothing real. HN's Algolia API is free and keyless, so there is
  no reason not to hit it live.
- **One schema, two enforcement points, zero drift.** Whatever the
  pipeline writes, the site must read under an identical validation
  contract — we want a single source of truth for the digest's shape, not
  a pipeline-side type and a separate site-side type that can silently
  diverge.
- **Minimize dependency and operational weight for a content site.** A
  daily digest of static content does not need a server runtime, a
  database, or a heavy UI framework for one bar chart.
- **Cross-suite consistency.** License (Apache-2.0) and the general
  polyrepo/testing conventions in `../Not-Humans-Lab/` are fixed
  constraints this ADR does not revisit, only respects. Documentation
  conventions (the `AGENTS.md`/`CLAUDE.md`/`SOUL.md`/`Context.md`
  pattern, `SECURITY.md`/`SUPPORT.md`/`status.md`/`decisions.md`) follow
  `nh-deck`'s and `nh-skills`' precedent even though this project's
  product shape does not.
- **Defer, don't hide, what's missing.** arXiv ingestion and real LLM
  curation are both explicitly out of scope for this phase — the design
  must make room for them later (a pluggable source, a scoring function
  with a clear seam) without pretending they already exist.

## Considered Options

1. **Astro (`output: "static"`) for the front end, with Astro Content
   Collections reading `src/data/digest/*.json` via the glob loader,
   validated against a shared Zod schema (`src/lib/digestSchema.ts`); a
   separate TypeScript/Node pipeline script (`scripts/pipeline.ts`, run
   via `tsx`) that fetches Hacker News' free, keyless Algolia API and
   writes one validated digest JSON file per day, with curation
   implemented as a deterministic placeholder function derived from real
   HN fields (`points`, `num_comments`, title) rather than a live LLM
   call.**
2. **Next.js instead of Astro** for the front end.
3. **Python instead of TypeScript/Node for the pipeline script.**
4. **Wait to build anything until real LLM API keys exist**, instead of
   building a placeholder-scored skeleton now.

## Decision Outcome

Chosen option: **Option 1 — Astro static site + Content Collections +
shared Zod schema, TypeScript/`tsx` pipeline script against HN's live
Algolia API, deterministic placeholder scoring.**

Rationale, directly from the decision drivers above:

- **Next.js instead of Astro (Option 2)** is a capable, widely-used
  framework, but it is built around a server-rendering/hybrid-rendering
  model (Server Components, route handlers, optional server runtime) that
  this project does not need — daily-dose's site is a set of static
  pages built once per pipeline run, with exactly one interactive island
  (the Chart.js bar chart). Astro's Content Collections feature is also a
  closer conceptual match to "a folder of validated JSON files becomes
  typed content" than reaching for Next.js's data-fetching patterns
  (`getStaticProps`-equivalents, route handlers) would be. Choosing
  Next.js here would mean carrying a heavier framework and a
  server-capable rendering model for a page that never needs a server.
  Rejected for this project's size and shape — not a quality judgment
  against Next.js in general.
- **Python instead of TypeScript/Node for the pipeline (Option 3)** would
  give access to Python's data/ML ecosystem, which might matter once real
  LLM curation and arXiv's more data-science-flavored ingestion needs
  arrive. But it would also mean the pipeline and the site speak two
  different languages with two independently-maintained schemas (a
  Pydantic model on the Python side, a Zod schema on the Astro side),
  directly undermining the "one schema, two enforcement points, zero
  drift" driver. Keeping the whole system in TypeScript lets
  `src/lib/digestSchema.ts` be the literal same file both sides import
  and depend on — not two hand-synchronized definitions in different
  languages. Rejected — worth revisiting only if a genuinely
  Python-only capability becomes a real, demonstrated need (e.g., a
  specific arXiv/ML library with no adequate TS equivalent), not
  preemptively.
- **Waiting until real LLM keys exist before building anything (Option
  4)** would avoid ever having to build or document a placeholder scoring
  step, but it would also mean shipping nothing — no live pipeline, no
  validated schema, no site, no CI — for an indefinite, externally-gated
  period with no control over when API keys arrive. A walking skeleton
  with a real, live HN fetch and an honestly-labeled placeholder scoring
  function delivers real, working, testable infrastructure now (fetch,
  validation, static rendering, CI) and leaves a clean, well-documented
  seam (the scoring function's interface) for real LLM curation to slot
  into later. Rejected — the cost of waiting outweighs the cost of
  building and clearly labeling a placeholder.
- **HN Algolia over any paid/authenticated HN API, and over building
  arXiv ingestion first** was accepted as effectively uncontested for
  this phase: HN's public Algolia search endpoint
  (`https://hn.algolia.com/api/v1/search?tags=front_page` or equivalent)
  is free, keyless, and requires zero setup, making it the fastest path
  to a genuinely live fetch. arXiv's abstract-heavy, differently-shaped
  data is deferred as a documented fast-follow (see `status.md`) rather
  than attempted in the same pass as the first working pipeline.
- **Deterministic placeholder scoring from real fetched fields, not
  fabricated data** was the one non-negotiable constraint threaded
  through every other choice: `interest_score` and `why_read` are
  computed only from `points`, `num_comments`, and the title of stories
  actually returned by the live HN fetch. No fake HN data is ever
  hardcoded, and no code path pretends to call a model that isn't there.
  This keeps the walking skeleton honest about exactly one thing being
  deferred (real curation) rather than several things being silently
  faked.

## Consequences

**Good:**

- The pipeline and the site share one TypeScript codebase and one literal
  schema file (`src/lib/digestSchema.ts`), eliminating an entire class of
  drift bugs between "what the pipeline wrote" and "what the site
  expects."
- The walking skeleton is genuinely live end to end for its one data
  source: real HN data in, schema-validated JSON persisted, real static
  HTML out — nothing in the fetch/validate/render path is mocked.
- Astro's static output and zero-JS-by-default model keep the site simple
  to build, test, and (eventually) deploy, with exactly one small,
  explicit JS island (Chart.js) rather than a framework's full client
  runtime.
- The placeholder scoring function is a clean, documented seam: replacing
  it with a real LLM call later is a contained change to one function's
  implementation, not a rearchitecture of the pipeline or the schema.
- Deferring arXiv and real LLM curation is now explicit and tracked (here,
  in `status.md`, and in `decisions.md`) rather than a silent gap a
  future contributor might not notice.

**Bad:**

- **`interest_score` and `why_read` do not reflect any actual semantic
  understanding of a story** — they are a function of points/comment
  count/title only. Until real LLM curation ships, the digest's
  "curation" is closer to "HN's own popularity signal, re-surfaced" than
  genuine AI curation. This is the single biggest deferred item in the
  project and must stay visibly documented (`status.md`, `README`, and
  ideally on the site itself), not quietly presented as more than it is.
- **Single-source (HN-only) means the digest's coverage is exactly as
  broad as HN's front page**, with no arXiv research content until that
  fast-follow ships. Users expecting `the-daily-diff`-style paper
  coverage will not get it yet.
- **No cron, no scheduled runs.** Because curation is a placeholder, the
  project deliberately does not enable the `schedule:` GitHub Actions
  trigger yet — automating a placeholder-scored digest's daily
  publication would be automating something not yet worth publishing
  unattended. This means daily-dose does not actually produce a "daily"
  digest automatically today, despite the name — a known, tracked gap
  (see `status.md`), not an oversight.
- **Choosing TypeScript for the pipeline over Python** means that if
  real LLM curation or arXiv ingestion later benefits meaningfully from a
  Python-specific library, that capability gap will need to be either
  worked around in the Node ecosystem or revisited as a new ADR — this
  decision does not permanently foreclose Python, but it is the default
  until a real need presents itself.

## Confirmation

This decision is confirmed as implemented when:

1. `npm run pipeline` performs a real, live HTTP fetch against HN's
   Algolia API, computes `interest_score`/`why_read` via the
   deterministic placeholder function using only real fetched fields,
   validates the result against `src/lib/digestSchema.ts`, and writes
   one file per story into a dated `src/data/digest/YYYY-MM-DD/` folder
   (Astro's `glob()` loader requires one schema-matching object per
   file, not an array).
2. `npm run build` renders the Astro static site, with the day's digest
   listed via Content Collections (validated against the same
   `src/lib/digestSchema.ts` at read time) and the Chart.js bar chart
   island rendering the day's interest scores.
3. No `@anthropic-ai/sdk`, `openai`, or any other LLM provider SDK exists
   in `package.json` — their absence is itself part of confirming this
   ADR, since adding one early would contradict the "no live LLM call"
   decision recorded here.
4. No arXiv client dependency or arXiv fetch code exists yet — its
   absence is a tracked, intentional fast-follow, not a gap discovered by
   accident.
5. CI runs `workflow_dispatch` plus push/PR triggers only; no
   `schedule:` cron trigger exists in `.github/workflows/`.

## More Information

- Source reasoning for this ADR is the TECH_DECISION context captured
  during Phase 6 planning for daily-dose; this document formalizes that
  reasoning in Michael Nygard's ADR format and does not introduce new
  rationale beyond it.
- Reference project this repo models itself on:
  `arpitbbhayani/the-daily-diff`.
- Cross-cutting, system-level conventions shared with the sibling
  projects (`nh-deck`, `nh-skills`) — including the Apache-2.0 license
  decision — live in the separate docs-only meta-repo at
  `../Not-Humans-Lab/`; this ADR does not duplicate that content.
- See `decisions.md` (this repo, root) for the ADR index and the
  lightweight decisions log this ADR is tracked in.
- See `SECURITY.md` for the prompt-injection-via-ingested-content hard
  requirement that applies once real LLM curation replaces the
  placeholder scoring function described here — this ADR establishes the
  seam that requirement will land in, not a substitute for that review.
- See `telemetry.md` for the cost/token accounting design drafted ahead
  of the real LLM integration this ADR defers.
- `nh-deck`'s own
  `docs/adr/0001-adopt-ts-node-cli-with-puppeteer-core-export.md` and
  `nh-skills`' `docs/adr/0001-adopt-markdown-only-skill-format-with-lint-gate.md`
  are useful precedents for this ADR's format and level of detail (house
  style), though their subject matter — a rendering CLI and a
  zero-runtime skill format, respectively — is unrelated to daily-dose's
  content-pipeline concerns.
