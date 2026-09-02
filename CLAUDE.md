@AGENTS.md

## Claude Code

This addendum is Claude-specific behavior only, on top of the shared instructions in `AGENTS.md`. Keep this file under 200 lines — push anything that grows beyond a short addendum into `AGENTS.md` or a referenced doc instead.

### Plan mode before touching the publish path

**Before touching anything in the publish/pipeline-writing path — the code that actually writes a new dated digest file — enter plan mode first.** This is the one path in daily-dose with real, eventual recurring cost implications: it is where a live LLM call will eventually get wired in once API keys exist, and it is the only code in this repo that produces the artifacts (`src/data/digest/YYYY-MM-DD/*.json`, one file per story) readers actually see. Changes here deserve more deliberation than a routine edit, even though no real cost exists yet.

The publish path is, non-exhaustively:

- `scripts/pipeline.ts` — the entry point that fetches, curates, validates, and writes.
- `src/lib/curation.ts` — the placeholder scoring/`why_read` logic. This is the exact file that will one day contain a real LLM call, so treat every edit to it as a rehearsal for that future change, not just a tweak to a heuristic.
- `src/lib/digestSchema.ts` — the Zod schema. Changing it changes what both the pipeline is allowed to write and what the site is allowed to read; a careless change here can silently break the "one schema, two enforcement points" guarantee `AGENTS.md` describes.
- Any new code that calls the HN Algolia API, or that would call any external API on daily-dose's behalf.

Plan mode here means: before editing, write out (in plan mode) what will change, why, and how it will be verified — do not jump straight to an edit on these files the way you might for, say, a CSS tweak in `src/pages/index.astro`. This is a lighter-weight version of nh-deck's stop-and-ask gate: nh-deck stops for permission because a network dependency would violate a non-negotiable; daily-dose plans first because this path is where cost, trust, and reader-facing honesty all meet at once.

### Never write a real LLM API call, even "just to test"

There are no Anthropic/OpenAI (or any other model provider's) API keys in this environment. Do not write code — in `src/lib/curation.ts`, `scripts/pipeline.ts`, a test, or anywhere else — that attempts a real LLM API call. It will either fail with an auth error, or (worse) silently no-op in a way that looks like it worked, which is exactly the failure mode `AGENTS.md` calls out as the reason this is a hard constraint, not a preference. If a task seems to require wiring in real curation, stop and confirm with the user that keys now exist before writing any call — do not simulate, mock in production code, or "temporarily" hardcode a response to make a feature look done.

### Never fabricate HN data

The fetch step (`scripts/pipeline.ts` calling the HN Algolia API and, as of the arXiv fast-follow, the arXiv Atom API) must always be real and live. Do not add a hardcoded fallback list of "example stories" for when the fetch fails, for local development convenience, or to make the site "look populated" during a demo. A failed fetch should fail loudly, not degrade into fabricated content — see `SOUL.md`'s non-negotiables. Test fixtures for Vitest are fine and expected; they must never leak into `scripts/pipeline.ts`'s actual runtime path.

### Scope discipline

- HN and arXiv sourcing are both real and shipped; placeholder curation, static-site rendering, no cron, no deploy remain the current shape. Do not scaffold real LLM calls, a `/stats` cost-transparency page, the `schedule:` cron trigger, real Vercel deployment, or a third source (GitHub) ahead of schedule — see `Context.md`'s roadmap for sequencing. Building these early is scope creep against an explicitly staged plan, not helpfulness.
- Do not add a CSS framework (Bulma, Sass, Tailwind, etc.) without being asked — minimal inline CSS is a deliberate, deferred-polish decision, not an oversight.
- Do not swap the Chart.js `<script type="module">` island for a React/Vue component or add a UI framework dependency to render one chart.
- Do not create new top-level docs (README variants, extra planning files) unless explicitly asked — this repo's doc set is `AGENTS.md`, `CLAUDE.md`, `SOUL.md`, and `Context.md`, plus whatever `../Not-Humans-Lab/` covers by reference.
- When a request is ambiguous between "add this to daily-dose" and "this belongs in Not-Humans-Lab" (cross-project), default to daily-dose unless it demonstrably constrains or cuts across another sibling project — see `../Not-Humans-Lab/SOUL.md`'s decision heuristic.

### Read SOUL.md before writing anything a reader will see

Every `why_read` string, every label near the interest score, and every piece of copy on the rendered site is subject to `SOUL.md`'s editorial persona — honest curation over hype, an explicit AI-transparency line, and no clickbait. Before writing or editing user-facing copy (including the placeholder curation's own generated text), read `SOUL.md`'s Non-Negotiables and Anti-Examples so a "punchier" edit doesn't quietly cross into clickbait, and so the placeholder is never dressed up as if it were real editorial judgment.
