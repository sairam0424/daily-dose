@AGENTS.md

## Claude Code

This addendum is Claude-specific behavior only, on top of the shared instructions in `AGENTS.md`. Keep this file under 200 lines — push anything that grows beyond a short addendum into `AGENTS.md` or a referenced doc instead.

### Plan mode before touching the publish path

**Before touching anything in the publish/pipeline-writing path — the code that actually writes a new dated digest file — enter plan mode first.** This is the one path in daily-dose with real, ongoing recurring cost implications: it makes a real, paid AWS Bedrock LLM call (see ADR 0003), and it is the only code in this repo that produces the artifacts (`src/data/digest/YYYY-MM-DD/*.json`, one file per item) readers actually see. Changes here deserve more deliberation than a routine edit.

The publish path is, non-exhaustively:

- `scripts/pipeline.ts` — the entry point that fetches, curates, validates, and writes.
- `src/lib/llmCuration.ts` — the real AWS Bedrock LLM scoring call (the default path as of ADR 0003). Any change here can change real cost, real prompt content sent to a model, or the forced-tool-use response contract — treat every edit with the weight of a real, live integration, not a heuristic tweak.
- `src/lib/curation.ts` — the placeholder scoring/`why_read` logic, now a fallback for missing credentials or a per-item response gap. Still load-bearing (it's what local dev without secrets actually runs), so still deserves care.
- `src/lib/costTracking.ts` — the real cost computation + anomaly-check logic. A bug here could mask a real cost problem or produce false alarms.
- `src/lib/digestSchema.ts` — the Zod schema. Changing it changes what both the pipeline is allowed to write and what the site is allowed to read; a careless change here can silently break the "one schema, two enforcement points" guarantee `AGENTS.md` describes.
- Any new code that calls the HN Algolia API, the arXiv API, AWS Bedrock, or any other external API on daily-dose's behalf.

Plan mode here means: before editing, write out (in plan mode) what will change, why, and how it will be verified — do not jump straight to an edit on these files the way you might for, say, a CSS tweak in `src/pages/index.astro`. This is a lighter-weight version of nh-deck's stop-and-ask gate: nh-deck stops for permission because a network dependency would violate a non-negotiable; daily-dose plans first because this path is where cost, trust, and reader-facing honesty all meet at once.

### Real LLM calls are live — treat every change here as touching production spend

As of 2026-09-02 (ADR 0003), `src/lib/llmCuration.ts` makes a real, paid AWS Bedrock call on every `npm run pipeline` invocation with credentials configured — this is no longer a hypothetical future change to guard against, it is the actual default path. Do not write a *second*, ad hoc LLM call anywhere else (a test "just to check," a debug script, a different file) — all real model calls go through `llmCuration.ts`'s existing `scoreItemsWithLLM()`, so cost tracking and the prompt-injection mitigation stay centralized. Automated tests (`tests/`) must always mock the SDK — never make a real call from a test. If a task seems to require a new kind of real LLM call (a different prompt shape, a new model, a different provider), stop and confirm with the user first, the same way the original wiring-in of real curation was confirmed via `AskUserQuestion` before any real call was made.

### Never fabricate HN data

The fetch step (`scripts/pipeline.ts` calling the HN Algolia API and, as of the arXiv fast-follow, the arXiv Atom API) must always be real and live. Do not add a hardcoded fallback list of "example stories" for when the fetch fails, for local development convenience, or to make the site "look populated" during a demo. A failed fetch should fail loudly, not degrade into fabricated content — see `SOUL.md`'s non-negotiables. Test fixtures for Vitest are fine and expected; they must never leak into `scripts/pipeline.ts`'s actual runtime path.

### Scope discipline

- HN, arXiv, and GitHub sourcing (ADR 0006), real LLM curation (ADR 0003), static-site rendering, the `/stats` cost-transparency page, `schedule:` cron automation, and real Vercel deployment (ADR 0004, live at https://daily-dose-hazel-delta.vercel.app) are all real and shipped — every item on `Context.md`'s original roadmap is done. Any further scope (a fourth source, richer stats, alerting) is a new decision, not a resumption of a deferred one.
- Do not add a CSS framework (Bulma, Sass, Tailwind, etc.) without being asked — minimal inline CSS is a deliberate, deferred-polish decision, not an oversight.
- Do not swap the Chart.js `<script type="module">` island for a React/Vue component or add a UI framework dependency to render one chart.
- Do not create new top-level docs (README variants, extra planning files) unless explicitly asked — this repo's doc set is `AGENTS.md`, `CLAUDE.md`, `SOUL.md`, and `Context.md`, plus whatever `../Not-Humans-Lab/` covers by reference.
- When a request is ambiguous between "add this to daily-dose" and "this belongs in Not-Humans-Lab" (cross-project), default to daily-dose unless it demonstrably constrains or cuts across another sibling project — see `../Not-Humans-Lab/SOUL.md`'s decision heuristic.

### Read SOUL.md before writing anything a reader will see

Every `why_read` string, every label near the interest score, and every piece of copy on the rendered site is subject to `SOUL.md`'s editorial persona — honest curation over hype, an explicit AI-transparency line, and no clickbait. Before writing or editing user-facing copy (including the placeholder curation's own generated text), read `SOUL.md`'s Non-Negotiables and Anti-Examples so a "punchier" edit doesn't quietly cross into clickbait, and so the placeholder is never dressed up as if it were real editorial judgment.
