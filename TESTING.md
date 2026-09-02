# TESTING.md — daily-dose

This is daily-dose's own filled-in copy of the canonical template at
`../Not-Humans-Lab/TESTING.md`. It locks in this project's test approach
from day one rather than deferring it — do not invent new section names
here beyond what's needed to cover the same ground the template defines.

## Test Philosophy

daily-dose follows a **testing trophy** shape, not a pyramid. The reasoning:
most of the real risk in this project is in schema/shape correctness and
pipeline integration (does a live-shaped HN response survive fetch →
placeholder-score → validate → write without producing invalid data; does
the Astro content collection actually load and validate what the pipeline
wrote), not in pure-function unit logic. The placeholder scoring function is
the one piece of genuinely isolatable pure logic; everything else is glue
between a network response, a schema, and a file on disk — exactly the
shape a trophy (thick integration middle, thin unit base) fits better than a
pyramid.

## Test Pyramid / Trophy by Layer

| Layer | Target ratio | What it's allowed to touch |
|---|---|---|
| Unit | ~20% | The placeholder scoring function (`interest_score`/`why_read` derivation) in isolation, given plain in-memory objects for `points`/`num_comments`/`title`. No network, no filesystem, no real HN data. |
| Integration + schema | ~60% | (a) A full pipeline run against a **mocked** HN response, asserting the resulting items are valid per `DigestItemSchema` and the written JSON matches. (b) The Astro content collection actually loading and validating a real, committed `src/data/digest/*.json` fixture file. Real filesystem I/O against test fixtures is allowed; no real network. |
| E2E | ~15% | Does `astro build` succeed end-to-end against a committed digest fixture, and does it produce the expected static `index.astro` page (present, non-empty, contains the expected chart markup)? |
| Held-out eval | ~5% (documented only, not implemented) | Explicitly **not** part of this phase. Once real LLM scoring exists, a non-blocking `test:eval` script would rubric-score curation quality on a schedule (e.g. weekly), not per-commit. Documented here as a future script name/purpose only — do not implement it now. |

## Project-Specific Test Forms

Per `../Not-Humans-Lab/TESTING.md`'s own daily-dose entry: content-schema
validation tests, and (once real LLM output exists) LLM-output
golden-file/snapshot tests, deterministic via recorded fixtures, never live
API calls in the blocking gate. In this walking-skeleton phase,
"content-schema validation" is exercised via the integration+schema layer
above; there is no LLM output yet to snapshot.

## Required npm Scripts

- `test` — the full blocking gate; runs unit + integration + e2e together.
- `test:unit` — the placeholder scoring function in isolation.
- `test:integration` — the mocked-pipeline-run and content-collection-load
  tests.
- `test:e2e` — the `astro build` smoke test.
- `test:watch` — watch mode for local dev.
- `test:coverage` — enforces this workspace's 80% floor (unit + integration
  + e2e combined), per the global testing rules and
  `../Not-Humans-Lab/TESTING.md`.
- `test:schema` — a project-specific alias/subset that runs only the
  schema-validation assertions, matching the name reserved for daily-dose in
  `../Not-Humans-Lab/TESTING.md`'s Required npm Scripts list.
- `test:eval` — **documented, not implemented.** Reserved name for the
  future non-blocking, scheduled (not per-commit) rubric-scoring of real LLM
  curation output, once a real LLM call replaces the placeholder scorer. Do
  not add this script's implementation before that point.

## Coverage Thresholds

80% floor (unit + integration + e2e combined), per the workspace-wide
global testing rule and `../Not-Humans-Lab/TESTING.md`. Excluded from
measurement: generated build output (`dist/`, once it exists) and committed
digest content under `src/data/digest/` (data, not code).

## Non-Determinism Policy

The live HN fetch is the one genuinely non-deterministic, network-dependent
operation in this project. It is exercised **manually/personally, outside
the automated test suite**, when seeding real content via `npm run
pipeline` — never inside `npm test`. The automated suite must be fully
deterministic and must never depend on live network access:

- `test:integration`'s pipeline test runs the same fetch → score → validate
  → write logic against a **mocked** HTTP response (a fixed, committed
  fixture shaped like a real HN Algolia response), never the live endpoint.
- The placeholder scoring function itself is already deterministic by
  construction (pure arithmetic over `points`/`num_comments`, no
  randomness, no wall-clock dependency beyond the `date` field being passed
  in, not generated internally) — so `test:unit` needs no additional
  determinism handling.
- There is no LLM-output non-determinism to quarantine yet, since no live
  LLM call exists in this phase. Once one is added, its output must be
  recorded as a golden fixture for the blocking gate, with any genuine
  quality-drift check pushed to the future, non-blocking `test:eval` — never
  into the per-commit gate.

## File Naming & Location

Tests live under `tests/`, mirroring `src/`/`scripts/`'s structure per the
global coding-style convention (`tests/pipeline.test.ts` corresponds to
`scripts/pipeline.ts`, etc.), rather than being colocated next to source
files. File naming: `*.test.ts`.

## CI Scope

CI runs on `workflow_dispatch` plus push/PR — every run is either manually
triggered or tied to a code change. The `schedule:` cron for automated daily
runs is explicitly not enabled this phase (see `tech.md`); do not add it
without the user's explicit go-ahead and real LLM API keys.

## Cross-references

- Canonical template this file fills in: `../Not-Humans-Lab/TESTING.md`.
- What gets tested (the schema, the pipeline, the content collection, the
  page) is documented in `architecture.md`'s Building Block View and
  Runtime View.
- The repo layout of `tests/` is documented in `codebase_map.md`.
- The rationale for the placeholder scoring step and the no-cron/no-deploy
  deferrals is documented in `tech.md`.
