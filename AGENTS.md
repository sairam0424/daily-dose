# AGENTS.md — daily-dose

This file follows the vendor-neutral [AGENTS.md](https://agents.md) open specification. It is the operational instruction manual for this repository — what to run, where things live, and what not to do.

## Overview

daily-dose is a daily AI-curated technical digest (arXiv + Hacker News) — the author's own version of [arpitbbhayani/the-daily-diff](https://github.com/arpitbbhayani/the-daily-diff). A pipeline script fetches stories from a live source, a curation step scores and annotates them, and a static site renders the result as a dated digest.

daily-dose is one of three independent sibling projects (daily-dose, nh-deck, nh-skills) under the **Not-Humans-Lab** umbrella. Not-Humans-Lab (`../Not-Humans-Lab/`) is a docs-only meta-repo holding cross-cutting system-level decisions (license, branch strategy, testing skeleton). This repo is its own standalone GitHub repository — not nested inside Not-Humans-Lab — and is the source of truth for everything specific to daily-dose. Cross-cutting conventions are linked by relative path, never duplicated:

- License rationale: `../Not-Humans-Lab/decisions.md`
- Branch/commit/PR template: `Branches.md` (copied verbatim from Not-Humans-Lab; canonical source is `../Not-Humans-Lab/Branches.md`)
- Testing skeleton: `../Not-Humans-Lab/TESTING.md`
- System architecture (C4 Level 1): `../Not-Humans-Lab/architecture.md`

nh-deck (`../nh-deck/`) and nh-skills (`../nh-skills/`) already completed their own Phase 1-4, fully working, tested, and shipped through real CI — useful as precedent for house documentation style/conventions (the `AGENTS.md`/`CLAUDE.md`/`SOUL.md`/`Context.md` pattern, linking to `../Not-Humans-Lab/` by relative path, etc.), but daily-dose's product shape — a content site backed by a data pipeline, not a CLI or a skills library — is fundamentally different. Do not copy their architecture, only their documentation conventions.

## The No-Fake-Data Constraint (read this first)

Two rules protect this project's honesty, and both are load-bearing, not stylistic:

1. **The fetch is real.** `scripts/pipeline.ts` calls Hacker News' free, keyless Algolia API (`https://hn.algolia.com/api/v1/search?tags=front_page`, or an equivalent front-page/story endpoint) and arXiv's Atom API live, every run. It never hardcodes or fabricates data as a fallback — if a fetch fails, the pipeline fails loudly, it does not quietly substitute made-up stories/papers.
2. **The curation is a real LLM call, with an honest placeholder as an explicit fallback — never a silent fake.** As of 2026-09-02 (`decisions.md`/ADR 0003), a real AWS Bedrock credential exists in this environment, and `src/lib/llmCuration.ts` scores every fetched item in one real Bedrock call per pipeline run by default. The original deterministic placeholder (`src/lib/curation.ts`, computing `interest_score`/`why_read` from real, already-fetched fields only) still exists and is used — with a loud `console.warn`, never silently — only when Bedrock credentials aren't configured (e.g. local dev) or the LLM's response omits a specific item's score. Never present the placeholder's output as if it were genuine model judgment, and never let a real-LLM code path silently no-op and fall back without logging it. See `SOUL.md` for the full rationale, `CLAUDE.md` for the review gate that protects this path, and ADR 0003 for the full technical design.

## Setup

```bash
npm install
```

Requires Node.js LTS 20 or 22+ (the pipeline script runs via `tsx`, which needs a current Node). No database, no external service account, no API key — the HN Algolia endpoint used by the pipeline is free and keyless.

## Build / Test / Run Commands

- **Dev server**: `npm run dev` — runs `astro dev`, serving the site locally with live reload.
- **Build**: `npm run build` — runs `astro build` (static output, `output: "static"` in `astro.config.mjs`).
- **Pipeline**: `npm run pipeline` — runs `scripts/pipeline.ts` via `tsx`. Fetches real, live Hacker News + arXiv data, scores every item via a real AWS Bedrock LLM call by default (`src/lib/llmCuration.ts`, falling back to the placeholder only without credentials or on a per-item gap), validates the result against `src/lib/digestSchema.ts`, and writes one file per item into a dated `src/data/digest/YYYY-MM-DD/` folder (Astro's `glob()` content loader requires one schema-matching object per file, not an array). This is the one command in this repo with a real recurring cost profile (a few cents/run) — see `CLAUDE.md`.
- **Test**: `npm test` — runs the Vitest suite (the Bedrock SDK is fully mocked; no automated test makes a real network call).
- **CI**: `ci.yml` runs build + test on `workflow_dispatch` (manual trigger) plus `push`/`pull_request`, and stays read-only. A separate, dedicated workflow, `daily-pipeline.yml`, runs the real pipeline on a real `schedule:` trigger and requests `contents: write` on itself only — see `decisions.md` ADR 0004. Real Vercel deployment is decided (git-integrated auto-deploy, `npm run build` only) but not yet connected, pending the Vercel MCP integration's reconnection. See `Context.md`'s roadmap.

## Code Style

- Astro (`output: "static"`) + TypeScript for the site; a separate Node/TypeScript pipeline script (`scripts/pipeline.ts`, run via `tsx`) for data ingestion. These are two different runtimes sharing one schema — do not blur the line by importing Astro-only APIs into `scripts/`.
- **One schema, two enforcement points, zero drift.** `src/lib/digestSchema.ts` is a Zod schema. `scripts/pipeline.ts` validates against it before writing a digest file; Astro's Content Collections (`src/content.config.ts`, glob loader over `src/data/digest/*.json`) validate against the exact same schema when reading. Never fork or duplicate the schema — if a field needs to change, change it once, here.
- Styling is minimal inline CSS for this walking skeleton — no Bulma, no Sass, no CSS framework. This is a deferred fast-follow (visual polish), matching nh-deck's precedent of shipping function before polish.
- The one data-visualization island (a bar chart of the day's interest scores) is plain Chart.js: a `<script type="module">` importing `"chart.js/auto"` directly in an Astro component. No React, no Vue, no other UI framework — this project has exactly one interactive island and it does not need a component framework to render it.
- Follow the global coding-style rules already in force for this workspace (KISS, DRY, YAGNI, immutability, descriptive naming, 200-400 lines per file typical).

## Directory Map

```
daily-dose/
  AGENTS.md                  — this file
  CLAUDE.md                  — Claude Code addendum (imports this file)
  SOUL.md                    — behavioral/identity charter + the digest's editorial persona
  Context.md                 — living state-of-the-world doc
  astro.config.mjs           — output: "static"
  package.json               — build/test/pipeline scripts + dependencies
  tsconfig.json
  scripts/
    pipeline.ts               — THE PUBLISH PATH. Fetches live HN Algolia data, calls the
                                 placeholder curation step (src/lib/curation.ts), validates
                                 against digestSchema, writes one file per story into
                                 src/data/digest/YYYY-MM-DD/. See CLAUDE.md before editing.
  src/
    content.config.ts          — Astro Content Collections config: glob loader over
                                  src/data/digest/*.json, validated against digestSchema.ts
    lib/
      digestSchema.ts           — Zod schema; single source of truth shared by content.config.ts
                                  AND scripts/pipeline.ts
      llmCuration.ts             — REAL AWS Bedrock LLM scoring (default path as of ADR 0003):
                                    one forced-tool-use batched call per run, Sonnet 5→Sonnet 4.6→Opus→Haiku
                                    fallback chain, Zod-validated response.
      costTracking.ts            — real per-run cost computation + rolling-average anomaly check,
                                    appended to src/data/stats.jsonl.
      curation.ts                — FALLBACK-ONLY interest_score + why_read logic (defines
                                    scoreStoryPlaceholder, imported by scripts/pipeline.ts),
                                    derived only from real fetched fields (points, num_comments,
                                    title) — used only without Bedrock credentials or on a
                                    per-item LLM response gap. See Known Gotchas.
    pages/
      index.astro                  — renders the latest committed digest + the Chart.js island
                                      inline (a <script type="module"> block, no separate
                                      component file)
      stats.astro                   — public cost/stats page; reads src/data/stats.jsonl
                                      directly at build time, no content collection
  src/data/
    stats.jsonl                       — real per-run LLM cost log, one JSON line per run
    digest/
      YYYY-MM-DD/                       — one folder per pipeline run
        hn-<hn_id>.json                    — one committed file per story
  tests/
    ...                                  — Vitest suite (schema validation, curation determinism)
  .github/workflows/
    ci.yml                                 — workflow_dispatch + push/PR triggers, read-only
    daily-pipeline.yml                      — real schedule: trigger, requests contents: write
                                              on itself only, runs npm run pipeline daily and
                                              commits the result (see decisions.md ADR 0004)
```

## Commit & PR Conventions

Same template as every sibling project in this suite — see this repo's own `Branches.md` (Conventional Commits, trunk-based/GitHub Flow, squash-merge only, PR required even for solo work), copied verbatim from `../Not-Humans-Lab/Branches.md` since each repo is independent and cannot rely on a cross-repo relative path surviving a standalone clone. Summary:

- Branch naming: `type/scope-slug` (e.g. `feat/pipeline-hn-fetch`, `fix/digest-schema-validation`).
- Commits: [Conventional Commits](https://www.conventionalcommits.org) — required, drives changelog/versioning.
- Every change goes through a PR, even solo. CI (`npm run build && npm test`) must pass before merge.
- Squash-merge only; the squash commit message must itself be a valid Conventional Commit.
- daily-dose is a deployed content site, not a published package — per this repo's own `Branches.md`, a merge to `main` is expected to eventually trigger a deploy (not an `npm publish`), and version tags can be date-based rather than strict semver. No deploy is wired up yet — see Gotchas.

## Security Notes

- License: Apache-2.0 (decided once at the Not-Humans-Lab system level, applied identically across daily-dose/nh-deck/nh-skills — see `../Not-Humans-Lab/decisions.md`).
- **A real AWS Bedrock credential exists in this environment** (`BEDROCK_ACCESS_KEY_ID`/`BEDROCK_SECRET_ACCESS_KEY`/`BEDROCK_REGION` env vars, stored as GitHub Encrypted Secrets, shared with the sibling Anvilry project's production chatbot — see `SECURITY.md` and ADR 0003). Never hardcode these values. Any code that constructs an LLM client belongs only in `src/lib/llmCuration.ts` — do not scatter client construction across other files. Values may be base64-encoded at rest — decode before use (see `agent_learning.md`).
- The HN Algolia and arXiv endpoints the pipeline calls are free and keyless — no secret to manage there. Never add a secret, key, or credential requirement to either fetch step without a documented reason.
- Never fabricate or hardcode fake HN/arXiv data, in the pipeline or in tests-as-fixtures-that-leak-into-production-code. Tests may use fixture data; the pipeline itself must always hit the real API. Automated tests must mock the Bedrock SDK entirely — never make a real network call in `tests/`.
- Validate all pipeline output against `digestSchema.ts` before writing — this is the boundary between "external data" and "trusted digest content" the site renders.

## Known Gotchas

- **The placeholder curation logic is now a fallback, not the default path.** `src/lib/curation.ts` computes `interest_score` and `why_read` deterministically from `points`/`num_comments`/`title` (HN) or recency (arXiv), and is only used when Bedrock credentials aren't configured or the LLM's response omits a specific item. `src/lib/llmCuration.ts` is the real default path — see `Context.md`'s roadmap and ADR 0003.
- **Two sources (Hacker News + arXiv) ship for real; GitHub is a documented fast-follow, not forgotten.** Do not silently add GitHub fetching as a side effect of an unrelated change; it's sequenced deliberately in `Context.md`'s roadmap.
- **`schedule:` cron is live (ADR 0004); Vercel deployment is decided but not yet connected.** `daily-pipeline.yml` runs daily and commits real data unattended — any change to its schedule, permissions, or file-pattern scope is a real decision, treat it with the same care as ADR 0004's original design. Vercel's shape is decided too; only the MCP reconnection remains before executing it.
- **One schema, two enforcement points is only as good as keeping them pointed at the same file.** If a future refactor moves or renames `digestSchema.ts`, update both `scripts/pipeline.ts` and `src/content.config.ts` in the same change — never let them drift.
