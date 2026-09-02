# Codebase Map — daily-dose

A literal, navigable tour of this repo only. This does not cover nh-deck,
nh-skills, or Not-Humans-Lab — each is its own repo/doc set. Reflects the
walking-skeleton layout; entries marked "(planned)" don't exist on disk yet
but are the immediate next thing to add — as of this writing, this repo has
no code yet, only these five docs.

## Bird's-eye view

```
daily-dose/
├── memory.md                     agent-writable lessons index
├── tech.md                        tech stack inventory
├── architecture.md                this project's own architecture doc
├── codebase_map.md                this file
├── TESTING.md                     this project's test-approach lock-in
├── package.json                   (planned) declares dependencies + npm scripts
├── tsconfig.json                  (planned) TypeScript config for scripts/ + Astro's own
├── astro.config.mjs                (planned) output: "static", content collections wiring
├── src/
│   ├── lib/
│   │   └── digestSchema.ts          (planned) shared Zod DigestItemSchema — single source
│   │                                  of truth, imported by content.config.ts AND pipeline.ts
│   ├── content.config.ts             (planned) Astro Content Collection: glob loader over
│   │                                  src/data/digest/*.json, validated against digestSchema
│   ├── data/
│   │   └── digest/                    (planned) committed, dated JSON — one folder per
│   │       └── YYYY-MM-DD/               pipeline run, containing one file per story
│   │           └── hn-<hn_id>.json          (e.g. hn-49508225.json); this IS the content,
│   │                                          not generated build output — committed to git
│   └── pages/
│       └── index.astro                 renders the latest digest + one Chart.js
│                                          bar-chart island of that day's interest_score values
├── scripts/
│   └── pipeline.ts                     fetch (live HN Algolia API) -> placeholder-
│                                          score (src/lib/curation.ts) -> validate -> write
│                                          one file per story into a dated folder
└── tests/
    ├── schema.test.ts                   unit tests for DigestItemSchema (valid/invalid shapes)
    ├── pipeline.test.ts                  unit tests for scoreStoryPlaceholder (deterministic,
    │                                       network-free — no live HN call inside the test suite)
    ├── content.test.ts                    (planned) integration test: does the Astro content
    │                                       collection actually load + validate a real committed
    │                                       digest file
    └── build.test.ts                       (planned) e2e: does `astro build` succeed and
                                               produce the expected static page
```

## Directory-by-directory

| Path | What it is | Notes |
|---|---|---|
| `src/lib/digestSchema.ts` | The shared Zod schema. Exports `DigestItemSchema` and its inferred `DigestItem` type. | Single source of truth — imported by both `src/content.config.ts` and `scripts/pipeline.ts`. Never redefine this shape anywhere else. A deliberate simplified subset of the-daily-diff's full schema; `arxiv_id`, `categories`, `depth_score`, `novelty_score`, `utility_score`, `section`, `image`, `comments` are documented fast-follows, not silently dropped. |
| `scripts/pipeline.ts` | The pipeline script. Fetches the live HN Algolia front-page endpoint, calls `scoreStoryPlaceholder` from `src/lib/curation.ts` to derive `interest_score`/`why_read` per item from real HN fields (`points`, `num_comments`, `title`), validates each item against `DigestItemSchema`, and writes one file per story into a dated `src/data/digest/YYYY-MM-DD/` folder. | Run via `tsx`, not compiled ahead of time. The only file in this repo that performs a real network call. Delegates the actual scoring to `src/lib/curation.ts` rather than defining it inline. |
| `src/lib/curation.ts` | Defines `scoreStoryPlaceholder` and the `RawHnStory` type — the deterministic, clearly-commented placeholder curation logic, derived only from real fetched fields. This is the file a real LLM call will replace once API keys exist. | Imported by `scripts/pipeline.ts`; also imported directly by `tests/pipeline.test.ts` for unit testing. See `CLAUDE.md`'s plan-mode gate before editing. |
| `src/content.config.ts` | Astro Content Collection config. Uses the glob loader to read `src/data/digest/**/*.json` and validates every entry against the same `DigestItemSchema` import. | This is the second of the two enforcement points for the shared schema — see `tech.md` Rationale for why there are exactly two, not one. |
| `src/data/digest/` | Committed, dated JSON content — one folder (`YYYY-MM-DD/`) per pipeline run, containing one JSON file per story (`hn-<hn_id>.json`). | This is real content checked into git, not generated build output (contrast with e.g. nh-deck's gitignored `dist/`). Only `source: "hn"` is populated in this walking skeleton. |
| `src/pages/index.astro` | Renders the latest digest's items and one Chart.js bar chart of that digest's `interest_score` values. | The chart is a plain `<script type="module">` island importing `chart.js/auto` — no React/Vue. |
| `tests/` | Vitest specs. `schema.test.ts` and `pipeline.test.ts` are real today (schema validation + deterministic scoring, both network-free). `content.test.ts` (content collection integration) and `build.test.ts` (astro build e2e) are still (planned). | Name pattern: `*.test.ts`. Mirrors `src/`/`scripts/` structure per the global coding-style convention. See `TESTING.md` for the trophy-shape ratio. |
| `package.json` | Declares dependencies (Astro, Zod, Chart.js, `tsx`, Vitest) and npm scripts (`dev`, `build`, `pipeline`, `test`). | Anthropic/OpenAI SDKs and Bulma/Sass are explicitly **not** listed here yet — see `tech.md`. |
| `astro.config.mjs` | Astro config with `output: "static"`. | No server adapter — this is a fully static build. |
| `memory.md` | Agent-writable accumulated-lessons index. | See its own convention note; near-empty until real history accrues. |
| `tech.md` | Fast-lookup stack inventory for this repo. | — |
| `architecture.md` | This project's own arc42/C4-style architecture doc. | — |
| `TESTING.md` | This project's test-approach lock-in (trophy shape ratio, required scripts, coverage thresholds). | — |

## "Where do I make change X" index

| I want to... | Go to |
|---|---|
| Change what a digest item looks like (add/remove a field) | `src/lib/digestSchema.ts` — the ONE place; both enforcement points pick it up automatically |
| Change how HN data is fetched | `scripts/pipeline.ts` |
| Change the placeholder scoring logic (`interest_score`, `why_read`) | `src/lib/curation.ts` — and see `tech.md` before replacing it with a real LLM call |
| Add arXiv or GitHub sourcing | `scripts/pipeline.ts` (fetch logic) + `src/lib/digestSchema.ts` already models `source: "arxiv" \| "github"` — this is a documented fast-follow, not yet started |
| Change how the content collection loads/validates JSON | `src/content.config.ts` |
| Change the rendered page or the chart | `src/pages/index.astro` |
| Add a new day's real digest data | run `npm run pipeline` (writes to `src/data/digest/`) — do not hand-write digest JSON except for test fixtures |
| Add or adjust a unit test for the scoring function | `tests/pipeline.test.ts` (tests `scoreStoryPlaceholder` from `src/lib/curation.ts`) |
| Add or adjust a schema validation test | `tests/schema.test.ts` |
| Add or adjust an integration test for the content collection | `tests/content.test.ts` |
| Add or adjust the `astro build` e2e smoke test | `tests/build.test.ts` |
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
- **CI**: GitHub Actions, `workflow_dispatch` + push/PR. The `schedule:`
  cron and any real deployment step are explicitly not enabled this phase
  (see `tech.md`).

## Cross-module dependency notes

- `src/lib/digestSchema.ts` has no dependency on any other file in this
  repo — it is a pure Zod schema module, independently unit-testable.
- `scripts/pipeline.ts` depends on `src/lib/digestSchema.ts` for validation
  and on the live HN Algolia API (external, real network call) for its
  input.
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
