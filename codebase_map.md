# Codebase Map — daily-dose

A literal, navigable tour of this repo only. This does not cover nh-deck,
nh-skills, or Not-Humans-Lab — each is its own repo/doc set. Reflects the
shipped layout, including the arXiv second-source fast-follow (ADR 0002)
and real LLM curation via AWS Bedrock (ADR 0003) — all real and verified
today. Entries marked "(planned)" genuinely don't exist yet.

## Bird's-eye view

```
daily-dose/
├── memory.md                     agent-writable lessons index
├── tech.md                        tech stack inventory
├── architecture.md                this project's own architecture doc
├── codebase_map.md                this file
├── TESTING.md                     this project's test-approach lock-in
├── package.json                   declares dependencies (incl. fast-xml-parser) + npm scripts
├── tsconfig.json                  TypeScript config for scripts/ + Astro's own
├── astro.config.mjs                output: "static", content collections wiring
├── docs/adr/
│   ├── 0001-...-placeholder-scoring-pipeline.md   HN-only walking skeleton decision
│   ├── 0002-...-arxiv-second-source-...md          arXiv fast-follow decision
│   └── 0003-wire-real-bedrock-curation.md           real AWS Bedrock LLM curation decision
├── src/
│   ├── lib/
│   │   ├── digestSchema.ts          shared Zod DigestItemSchema — single source
│   │   │                              of truth, imported by content.config.ts AND pipeline.ts
│   │   ├── llmCuration.ts            REAL AWS Bedrock LLM scoring (default path) — one
│   │   │                               forced-tool-use batched call/run, Sonnet 5→Sonnet 4.6→Opus→Haiku
│   │   │                               fallback chain, Zod-validated response
│   │   ├── costTracking.ts            real per-run cost + rolling-average anomaly check,
│   │   │                               appended to src/data/stats.jsonl
│   │   └── curation.ts               scoreStoryPlaceholder (HN) + scoreArxivPlaceholder (arXiv),
│   │                                    both deterministic, clearly-commented — now an explicit
│   │                                    fallback for missing credentials / per-item response gaps
│   ├── content.config.ts             Astro Content Collection: glob loader over
│   │                                  src/data/digest/**/*.json, validated against digestSchema
│   ├── data/
│   │   ├── stats.jsonl                 real per-run LLM cost log (one JSON line per pipeline run)
│   │   └── digest/                    committed, dated JSON — one folder per
│   │       └── YYYY-MM-DD/               pipeline run, containing one file per story
│   │           ├── hn-<hn_id>.json          (e.g. hn-49508225.json)
│   │           └── arxiv-<id>.json           (e.g. arxiv-2609.01597.json) — both are real
│   │                                           content, not generated build output — committed to git
│   └── pages/
│       ├── index.astro                 renders the latest digest (both sources, mixed) + one
│       │                                  Chart.js bar-chart island of that day's interest_score values
│       └── stats.astro                  public cost/stats page — reads src/data/stats.jsonl
│                                          directly at build time (no content collection),
│                                          renders totals + by-model + by-day cost breakdowns
├── scripts/
│   └── pipeline.ts                     fetch (live HN Algolia API + live arXiv Atom API,
│                                          default --sources hn,arxiv) -> score (real Bedrock call
│                                          via src/lib/llmCuration.ts, falling back to
│                                          src/lib/curation.ts) -> validate -> write one file
│                                          per item into a dated folder, cleaning up any stale
│                                          files from an earlier same-day run
└── tests/
    ├── schema.test.ts                   unit tests for DigestItemSchema (valid/invalid shapes)
    ├── pipeline.test.ts                  unit tests for scoreStoryPlaceholder (deterministic,
    │                                       network-free — no live HN call inside the test suite)
    ├── llmCuration.test.ts                unit tests for scoreItemsWithLLM, Bedrock SDK fully
    │                                        mocked — no real network call inside the test suite
    ├── content-collection.test.ts         integration test: replicates the glob loader's
    │                                       discovery+validation at the filesystem level against
    │                                       real committed digest files
    ├── build-output.test.ts                e2e: asserts real content (both sources) and the
    │                                          Chart.js island are present in the built dist/index.html
    └── stats-page.test.ts                   e2e: asserts the built dist/stats/index.html reflects
                                                the real total cost computed from stats.jsonl
```

## Directory-by-directory

| Path | What it is | Notes |
|---|---|---|
| `src/lib/digestSchema.ts` | The shared Zod schema. Exports `DigestItemSchema` and its inferred `DigestItem` type. | Single source of truth — imported by both `src/content.config.ts` and `scripts/pipeline.ts`. Never redefine this shape anywhere else. A deliberate simplified subset of the-daily-diff's full schema; `arxiv_id`, `categories`, `depth_score`, `novelty_score`, `utility_score`, `section`, `image`, `comments` are documented fast-follows, not silently dropped. |
| `scripts/pipeline.ts` | The pipeline script. Fetches the live HN Algolia front-page endpoint AND the live arXiv Atom API (default `--sources hn,arxiv`), scores every item via a real Bedrock call (`src/lib/llmCuration.ts`) when configured, falling back to `scoreStoryPlaceholder`/`scoreArxivPlaceholder` from `src/lib/curation.ts` otherwise, validates each item against `DigestItemSchema`, cleans up stale files from an earlier same-day run, and writes one file per item into a dated `src/data/digest/YYYY-MM-DD/` folder. | Run via `tsx`, not compiled ahead of time. The only file in this repo that performs real network calls (HN, arXiv, and indirectly Bedrock via `llmCuration.ts`). |
| `src/lib/llmCuration.ts` | The real AWS Bedrock LLM scoring client (`AnthropicBedrock`). `scoreItemsWithLLM()` scores a whole batch in one forced-tool-use call, Sonnet 5→Sonnet 4.6→Opus→Haiku fallback on `NotFoundError`/`BadRequestError`, Zod-validated response (`ScoresResponseSchema`). This is the default scoring path as of ADR 0003; Sonnet 5 leads the chain as of ADR 0005. | Imported by `scripts/pipeline.ts`; fully mocked in `tests/llmCuration.test.ts`. See `CLAUDE.md`'s plan-mode gate before editing. |
| `src/lib/costTracking.ts` | `calculateCostUsd()` + `recordAndCheckCost()` — real per-run cost from actual token usage against a verified Bedrock pricing table, rolling 7-day-average anomaly check (not a fixed ceiling), appended to `src/data/stats.jsonl`. | Imported by `scripts/pipeline.ts`. See `telemetry.md` for the full design and what's implemented vs. still speculative. |
| `src/lib/curation.ts` | Defines `scoreStoryPlaceholder` (HN, `points`/`num_comments`-based) and `scoreArxivPlaceholder` (arXiv, recency-only, capped `[3,8]` — see ADR 0002 for why it's a weaker signal by design) plus their raw-shape interfaces. Both are deterministic, clearly-commented placeholders — now an explicit fallback for missing Bedrock credentials or a per-item response gap, not the default path. | Imported by `scripts/pipeline.ts`; also imported directly by `tests/pipeline.test.ts` for unit testing. See `CLAUDE.md`'s plan-mode gate before editing. |
| `src/content.config.ts` | Astro Content Collection config. Uses the glob loader to read `src/data/digest/**/*.json` and validates every entry against the same `DigestItemSchema` import. | This is the second of the two enforcement points for the shared schema — see `tech.md` Rationale for why there are exactly two, not one. |
| `src/data/digest/` | Committed, dated JSON content — one folder (`YYYY-MM-DD/`) per pipeline run, containing one JSON file per story (`hn-<hn_id>.json` or `arxiv-<id>.json`). | This is real content checked into git, not generated build output (contrast with e.g. nh-deck's gitignored `dist/`). Both `source: "hn"` and `source: "arxiv"` are populated as of the arXiv fast-follow (ADR 0002); scores are real-LLM-derived by default as of ADR 0003. |
| `src/data/stats.jsonl` | Real per-run LLM cost log, one JSON line per pipeline run (`date`, `model`, `inputTokens`, `outputTokens`, `costUsd`, `itemCount`, `flaggedAnomalous`). | Committed, not gitignored — real historical data, appended by `src/lib/costTracking.ts`. |
| `src/pages/index.astro` | Renders the latest digest's items (mixed HN + arXiv) and one Chart.js bar chart of that digest's `interest_score` values. | The chart is a plain `<script type="module">` island importing `chart.js/auto` — no React/Vue. |
| `src/pages/stats.astro` | The public cost/stats page. Reads `src/data/stats.jsonl` directly via `node:fs` in its frontmatter (no content collection — this is a plain, non-schema-validated internal log this project writes, not external content), aggregates totals/by-model/by-day, renders an honest empty-state when no real LLM runs have happened yet. | See `telemetry.md`'s Public Stats Page Spec. Deliberately excludes per-story cost and raw per-call logs. |
| `tests/` | Vitest specs, all real today: `schema.test.ts`, `pipeline.test.ts`, and `llmCuration.test.ts` (unit, network-free — the Bedrock SDK is fully mocked), `content-collection.test.ts` (replicates the glob loader's discovery+validation without needing Astro's Vitest container API), `build-output.test.ts` (asserts real content in the built `dist/index.html`), and `stats-page.test.ts` (asserts the built `dist/stats/index.html` reflects the real total cost from `stats.jsonl`; assumes `npm run build` already ran). | Name pattern: `*.test.ts`. Mirrors `src/`/`scripts/` structure per the global coding-style convention. See `TESTING.md` for the trophy-shape ratio. |
| `package.json` | Declares dependencies (Astro, Zod, Chart.js, `tsx`, Vitest, `fast-xml-parser`, `@anthropic-ai/bedrock-sdk`, `@anthropic-ai/sdk`) and npm scripts (`dev`, `build`, `pipeline`, `test`). | Bulma/Sass are explicitly **not** listed here yet — see `tech.md`. |
| `astro.config.mjs` | Astro config with `output: "static"`. | No server adapter — this is a fully static build. |
| `memory.md` | Agent-writable accumulated-lessons index. | See its own convention note; near-empty until real history accrues. |
| `tech.md` | Fast-lookup stack inventory for this repo. | — |
| `architecture.md` | This project's own arc42/C4-style architecture doc. | — |
| `TESTING.md` | This project's test-approach lock-in (trophy shape ratio, required scripts, coverage thresholds). | — |

## "Where do I make change X" index

| I want to... | Go to |
|---|---|
| Change what a digest item looks like (add/remove a field) | `src/lib/digestSchema.ts` — the ONE place; both enforcement points pick it up automatically |
| Change how HN or arXiv data is fetched | `scripts/pipeline.ts` (`fetchHnFrontPage` / `fetchArxivPapers`) |
| Change the real LLM scoring logic (prompt, model chain, tool schema) | `src/lib/llmCuration.ts` — see `CLAUDE.md`'s plan-mode gate first, this is a real, paid call |
| Change the placeholder fallback scoring logic (`interest_score`, `why_read`) | `src/lib/curation.ts` (`scoreStoryPlaceholder` for HN, `scoreArxivPlaceholder` for arXiv) — used only when `llmCuration.ts` isn't configured or omits an item |
| Change cost tracking or the anomaly-check threshold | `src/lib/costTracking.ts` — see `telemetry.md` |
| Add GitHub sourcing (the remaining Hold entry) | `scripts/pipeline.ts` (fetch logic) + `src/lib/digestSchema.ts` already models `source: "github"` — arXiv already shipped as the model for how to add a new source; this is the next one, not yet started |
| Change how the content collection loads/validates JSON | `src/content.config.ts` |
| Change the rendered page or the chart | `src/pages/index.astro` |
| Change the public cost/stats page | `src/pages/stats.astro` (reads `src/data/stats.jsonl` directly) |
| Add a new day's real digest data | run `npm run pipeline` (writes to `src/data/digest/`, both sources by default, real LLM scoring if credentials are set) — do not hand-write digest JSON except for test fixtures |
| Add or adjust a unit test for either scoring function | `tests/pipeline.test.ts` (placeholder functions) or `tests/llmCuration.test.ts` (real LLM path, Bedrock SDK mocked) |
| Add or adjust a schema validation test | `tests/schema.test.ts` |
| Add or adjust an integration test for the content collection | `tests/content-collection.test.ts` |
| Add or adjust the `astro build` e2e smoke test | `tests/build-output.test.ts` |
| Add or bump a dependency | `package.json` (see `tech.md` for what's Adopt vs. Hold before adding anything) |
| Record a lesson learned or decision | `memory.md` (add one index line + a new topic file) |
| Update the stack rationale or adoption status | `tech.md` |
| Update the architecture description | `architecture.md` |
| Update the test-approach lock-in | `TESTING.md` |

## Entry points

- **Pipeline, from source**: `npm run pipeline` → `tsx scripts/pipeline.ts`.
  See `architecture.md` Runtime View, Flow 1.
- **Site build**: `npm run build` → `astro build` (`output: "static"`). See
  `architecture.md` Runtime View, Flow 2.
- **Tests**: `npm test` → `vitest run` against everything under `tests/`.
- **CI**: `.github/workflows/ci.yml` (`workflow_dispatch` + push/PR, read-only).
- **Automated daily run**: `.github/workflows/daily-pipeline.yml` (real
  `schedule:` trigger + `workflow_dispatch`, `contents: write` on itself
  only) — runs `npm run pipeline` and commits the result via a bot
  identity, scoped to `src/data/digest/**` + `src/data/stats.jsonl` only.
  See `decisions.md` ADR 0004. Real deployment: live at
  https://daily-dose-hazel-delta.vercel.app (see `tech.md`).

## Cross-module dependency notes

- `src/lib/digestSchema.ts` has no dependency on any other file in this
  repo — it is a pure Zod schema module, independently unit-testable.
- `scripts/pipeline.ts` depends on `src/lib/digestSchema.ts` for validation,
  on the live HN Algolia API AND the live arXiv Atom API (both external,
  real network calls) for its input, plus `fast-xml-parser` for parsing the
  arXiv response, and on `src/lib/llmCuration.ts` (real Bedrock call,
  falling back to `src/lib/curation.ts`) plus `src/lib/costTracking.ts` for
  scoring and cost accounting.
- `src/lib/llmCuration.ts` depends on AWS Bedrock (external, real network +
  auth) via `@anthropic-ai/bedrock-sdk`, and on `@anthropic-ai/sdk`'s error
  classes for the model-fallback decision. It never imports
  `src/lib/curation.ts` — the choice between them is `pipeline.ts`'s alone.
- `src/content.config.ts` depends on `src/lib/digestSchema.ts` for
  validation and reads whatever `scripts/pipeline.ts` has already written to
  `src/data/digest/` — but has no code-level import of `pipeline.ts` itself.
- `src/pages/index.astro` depends only on the typed collection entries
  `src/content.config.ts` exposes — never reads `src/data/digest/*.json`
  directly and never imports the schema or the pipeline.
- Nothing in this repo depends on nh-deck, nh-skills, or Not-Humans-Lab —
  those relationships are documentation-convention precedent only,
  described in `architecture.md`'s Context & Scope, not wired as code or
  build dependencies.
