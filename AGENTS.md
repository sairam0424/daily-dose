# AGENTS.md — daily-dose

This file follows the vendor-neutral [AGENTS.md](https://agents.md) open specification. It is the operational instruction manual for this repository — what to run, where things live, and what not to do.

## Overview

daily-dose is a daily AI-curated technical digest (arXiv + Hacker News) — the author's own version of [arpitbbhayani/the-daily-diff](https://github.com/arpitbbhayani/the-daily-diff). A pipeline script fetches stories from a live source, a curation step scores and annotates them, and a static site renders the result as a dated digest.

daily-dose is one of three independent sibling projects (daily-dose, nh-deck, nh-skills) under the **Not-Humans-Lab** umbrella. Not-Humans-Lab (`../Not-Humans-Lab/`) is a docs-only meta-repo holding cross-cutting system-level decisions (license, branch strategy, testing skeleton). This repo is its own standalone GitHub repository — not nested inside Not-Humans-Lab — and is the source of truth for everything specific to daily-dose. Cross-cutting conventions are linked by relative path, never duplicated:

- License rationale: `../Not-Humans-Lab/decisions.md`
- Branch/commit/PR template: `../Not-Humans-Lab/Branches.md`
- Testing skeleton: `../Not-Humans-Lab/TESTING.md`
- System architecture (C4 Level 1): `../Not-Humans-Lab/architecture.md`

nh-deck (`../nh-deck/`) and nh-skills (`../nh-skills/`) already completed their own Phase 1-4, fully working, tested, and shipped through real CI — useful as precedent for house documentation style/conventions (the `AGENTS.md`/`CLAUDE.md`/`SOUL.md`/`Context.md` pattern, linking to `../Not-Humans-Lab/` by relative path, etc.), but daily-dose's product shape — a content site backed by a data pipeline, not a CLI or a skills library — is fundamentally different. Do not copy their architecture, only their documentation conventions.

## The No-Fake-Data, No-Fake-LLM Constraint (read this first)

Two rules protect this project's honesty, and both are load-bearing, not stylistic:

1. **The fetch is real.** `scripts/pipeline.ts` calls Hacker News' free, keyless Algolia API (`https://hn.algolia.com/api/v1/search?tags=front_page`, or an equivalent front-page/story endpoint) live, every run. It never hardcodes or fabricates HN data as a fallback — if the fetch fails, the pipeline fails loudly, it does not quietly substitute made-up stories.
2. **The curation is an honest placeholder, not a real LLM call.** There are no Anthropic/OpenAI API keys in this environment. Code in this repo must never attempt a real LLM API call — it would either fail outright or, worse, silently no-op while looking like it worked. The "curation" step (`src/lib/curation.ts`) computes a deterministic `interest_score` and writes a `why_read` string using only real, already-fetched HN fields (`points`, `num_comments`, `title`). This is documented everywhere it's visible as a placeholder, never presented as genuine editorial or model judgment. See `SOUL.md` for the full rationale and `CLAUDE.md` for the review gate that protects this path.

## Setup

```bash
npm install
```

Requires Node.js LTS 20 or 22+ (the pipeline script runs via `tsx`, which needs a current Node). No database, no external service account, no API key — the HN Algolia endpoint used by the pipeline is free and keyless.

## Build / Test / Run Commands

- **Dev server**: `npm run dev` — runs `astro dev`, serving the site locally with live reload.
- **Build**: `npm run build` — runs `astro build` (static output, `output: "static"` in `astro.config.mjs`).
- **Pipeline**: `npm run pipeline` — runs `scripts/pipeline.ts` via `tsx`. Fetches real, live Hacker News front-page data from the Algolia API, runs the placeholder curation step, validates the result against `src/lib/digestSchema.ts`, and writes one file per story into a dated `src/data/digest/YYYY-MM-DD/` folder (Astro's `glob()` content loader requires one schema-matching object per file, not an array). This is the one command in this repo with a real, eventual recurring cost profile once LLM calls are wired in — see `CLAUDE.md`.
- **Test**: `npm test` — runs the Vitest suite.
- **CI**: GitHub Actions runs build + test on `workflow_dispatch` (manual trigger) plus `push`/`pull_request`. The `schedule:` cron trigger for automated daily runs is **explicitly not enabled** in this phase — it requires real LLM API keys (which don't exist yet) and the user's explicit go-ahead. Real Vercel deployment is likewise not yet enabled, for the same reason (explicit go-ahead required). See `Context.md`'s roadmap.

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
      curation.ts                — PLACEHOLDER interest_score + why_read logic (defines
                                    scoreStoryPlaceholder, imported by scripts/pipeline.ts),
                                    derived only from real fetched fields (points, num_comments,
                                    title) — not a real LLM call. See Known Gotchas.
    pages/
      index.astro                  — renders the latest committed digest + the Chart.js island
                                      inline (a <script type="module"> block, no separate
                                      component file)
  src/data/digest/
    YYYY-MM-DD/                       — one folder per pipeline run
      hn-<hn_id>.json                    — one committed file per story
  tests/
    ...                                  — Vitest suite (schema validation, curation determinism)
  .github/workflows/
    ci.yml                                 — workflow_dispatch + push/PR triggers ONLY; no
                                             schedule: cron yet
```

## Commit & PR Conventions

Same template as every sibling project in this suite — see `../Not-Humans-Lab/Branches.md` for the full canonical version (Conventional Commits, trunk-based/GitHub Flow, squash-merge only, PR required even for solo work). Summary:

- Branch naming: `type/scope-slug` (e.g. `feat/pipeline-hn-fetch`, `fix/digest-schema-validation`).
- Commits: [Conventional Commits](https://www.conventionalcommits.org) — required, drives changelog/versioning.
- Every change goes through a PR, even solo. CI (`npm run build && npm test`) must pass before merge.
- Squash-merge only; the squash commit message must itself be a valid Conventional Commit.
- daily-dose is a deployed content site, not a published package — per `../Not-Humans-Lab/Branches.md`, a merge to `main` is expected to eventually trigger a deploy (not an `npm publish`), and version tags can be date-based rather than strict semver. No deploy is wired up yet — see Gotchas.

## Security Notes

- License: Apache-2.0 (decided once at the Not-Humans-Lab system level, applied identically across daily-dose/nh-deck/nh-skills — see `../Not-Humans-Lab/decisions.md`).
- **No Anthropic/OpenAI (or any other LLM) API keys exist in this environment.** Never write code that attempts a real LLM API call — it would fail, or silently do nothing while looking like it works. When real keys are eventually added, they must come from environment variables (never hardcoded), verified at startup with a clear error message, per this workspace's global security rules.
- The HN Algolia endpoint the pipeline calls is free and keyless — no secret to manage there. Never add a secret, key, or credential requirement to the pipeline's HN fetch step without a documented reason.
- Never fabricate or hardcode fake HN data, in the pipeline or in tests-as-fixtures-that-leak-into-production-code. Tests may use fixture data; the pipeline itself must always hit the real API.
- Validate all pipeline output against `digestSchema.ts` before writing — this is the boundary between "external data" and "trusted digest content" the site renders.

## Known Gotchas

- **The curation step is a deliberate, clearly-commented placeholder — not a real editorial or LLM judgment.** `src/lib/curation.ts` computes `interest_score` and `why_read` deterministically from `points`/`num_comments`/`title`. This is the single biggest deferred item in this project, not a hidden shortcut. Do not present its output as if a model reviewed the story. When real LLM keys become available, this is exactly the file that changes — see `Context.md`'s roadmap and `CLAUDE.md`'s review gate.
- **Single-source (Hacker News only) for now — arXiv is a documented fast-follow, not forgotten.** Do not silently add arXiv fetching as a side effect of an unrelated change; it's sequenced deliberately in `Context.md`'s roadmap.
- **No `schedule:` cron and no live Vercel deployment in this phase.** Both require the user's explicit go-ahead, and the cron additionally requires real LLM keys to be worth anything (running the placeholder daily produces no new value). Do not enable either without asking first.
- **One schema, two enforcement points is only as good as keeping them pointed at the same file.** If a future refactor moves or renames `digestSchema.ts`, update both `scripts/pipeline.ts` and `src/content.config.ts` in the same change — never let them drift.
