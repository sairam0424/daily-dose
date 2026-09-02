# Context.md — daily-dose

Living state-of-the-world doc. Agents should update this as work progresses — this is not a duplicate of `AGENTS.md`'s static command list.

## What this is

daily-dose is a daily AI-curated technical digest (arXiv + Hacker News) — the author's own version of [arpitbbhayani/the-daily-diff](https://github.com/arpitbbhayani/the-daily-diff). It is one of three independent sibling projects — daily-dose, nh-deck, nh-skills — under the **Not-Humans-Lab** umbrella (`../Not-Humans-Lab/`, a separate docs-only meta-repo). daily-dose is itself a standalone GitHub repository, matching this workspace's polyrepo convention — it is not nested inside Not-Humans-Lab.

nh-skills (`../nh-skills/`) and nh-deck (`../nh-deck/`) are siblings that already completed their own Phase 1-4, fully working, tested, and shipped through real CI — useful precedent for house documentation style/conventions, but their product shapes (a curated skills collection; a local-first presentation CLI) are unrelated to daily-dose's (a content site backed by a data pipeline), so their content is referenced for convention, never copied as architecture.

## Current state (as of 2026-09-02)

- **Phase 6: walking skeleton.** Real, live fetch from Hacker News' free Algolia API; deterministic placeholder scoring/`why_read` generation (no LLM API keys exist in this environment); an Astro static site rendering one committed digest via Content Collections; one Chart.js bar-chart island. No `schedule:` cron for automated daily runs. No live Vercel deployment. Both require the user's explicit go-ahead — neither exists yet.
- **Tech stack: decided.** Astro (`output: "static"`) for the front-end, with Content Collections reading `src/data/digest/*.json` via the glob loader, validated against the same Zod schema (`src/lib/digestSchema.ts`) the pipeline script writes against — one schema, two enforcement points, zero drift. A separate TypeScript/Node pipeline script (`scripts/pipeline.ts`, run via `tsx`) fetches from HN's Algolia API and writes one validated file per story into a dated `src/data/digest/YYYY-MM-DD/` folder (Astro's `glob()` content loader requires one schema-matching object per file, not an array). Styling is minimal inline CSS (no Bulma/Sass) for this phase. One Chart.js island (`chart.js/auto` via a plain `<script type="module">`, no React/Vue) renders a bar chart of the day's interest scores.
- **Single-source (Hacker News only) for now — arXiv is explicitly deferred, not forgotten.** This is the single biggest scope gap in the current skeleton and is documented as a fast-follow in the Roadmap below, not silently skipped.
- **Curation is an honest, clearly-labeled placeholder — not a real LLM call.** There are no Anthropic/OpenAI API keys in this environment. `src/lib/curation.ts` computes `interest_score` and `why_read` deterministically from real, already-fetched HN fields (`points`, `num_comments`, `title`). This is documented as the single biggest deferred item in the project, not hidden — see `AGENTS.md`'s constraint and `SOUL.md`'s non-negotiables.
- **CI: `workflow_dispatch` + `push`/`pull_request` only.** No `schedule:` cron trigger yet — the automated-daily-run path is deliberately not enabled, since it would need real LLM keys to be worth anything and the user's explicit sign-off either way.
- **License: Apache-2.0**, decided once at the Not-Humans-Lab system level and applied identically across all three sibling projects (see `../Not-Humans-Lab/decisions.md`).

## Architecture at a glance

Two runtimes, one shared contract:

1. **Pipeline** (`scripts/pipeline.ts`, run via `tsx`) — fetches live from HN's Algolia API, runs the placeholder curation step (`src/lib/curation.ts`) to produce `interest_score` + `why_read` for each story, validates the full result against `src/lib/digestSchema.ts`, and writes one file per story into a dated `src/data/digest/YYYY-MM-DD/` folder (e.g. `hn-49508225.json`).
2. **Site** (Astro, `output: "static"`) — Content Collections (`src/content.config.ts`, glob loader over `src/data/digest/*.json`) read and validate against the exact same `digestSchema.ts`, then render the latest digest on `src/pages/index.astro`, including one inline Chart.js island (a `<script type="module">` block within `index.astro` itself, not a separate component) charting the day's interest scores.

The shared schema is the load-bearing contract between the two runtimes — see `AGENTS.md`'s Directory Map for the concrete file layout, and `../Not-Humans-Lab/architecture.md` for how daily-dose fits into the three-project system (C4 Level 1 only — this repo owns its own internals).

## Key decisions & why

- **Astro static output, not SSR** — this is a content site with no need for a live server at this phase; static generation is simpler to reason about and to deploy later.
- **One schema, two enforcement points (`digestSchema.ts`)** — guarantees the pipeline can never write something the site can't validate, and vice versa, without maintaining two schemas by hand.
- **HN only, arXiv deferred** — a two-source pipeline is real, wanted scope, but shipping a working one-source skeleton first is the small-and-finishable move; see `../Not-Humans-Lab/SOUL.md`'s "small and finishable over big and impressive."
- **Placeholder curation instead of a real LLM call** — no Anthropic/OpenAI keys exist in this environment; attempting a real call would either fail outright or silently no-op while looking like it worked, which is worse than an honest, clearly-labeled heuristic. See `SOUL.md`'s AI-transparency non-negotiable for why this is never dressed up as real editorial judgment.
- **No Bulma/Sass, minimal inline CSS** — visual polish is a deliberate fast-follow, matching nh-deck's precedent of shipping the working core before styling it.
- **CI on `workflow_dispatch` + `push`/`pull_request`, no `schedule:` cron** — automated daily runs need real LLM keys (to be worth the automation) and the user's explicit go-ahead (neither exists yet); enabling cron now would just run the placeholder on a schedule for no added reader value.
- **No live Vercel deployment yet** — requires the user's explicit go-ahead, independent of the LLM-key question.
- **License = Apache-2.0** — decided once at the umbrella level, not re-decided per project; see `../Not-Humans-Lab/decisions.md` for the patent-grant rationale.

## Roadmap

In order — do not build out of sequence:

1. **Wire real LLM scoring once Anthropic/OpenAI API keys are actually available.** Replace `src/lib/curation.ts`'s placeholder with a real model call, behind `CLAUDE.md`'s plan-mode gate — this is the single biggest deferred item in the project and the reason the placeholder is documented as loudly as it is.
2. **Add arXiv as a second source.** Single-source (HN-only) is a documented gap, not a silent one; this is the next scope expansion once the one-source pipeline is solid.
3. **Enable the `schedule:` cron trigger for automated daily runs.** Only with the user's explicit go-ahead, and only once step 1 has shipped — running the placeholder heuristic on an automated schedule adds no real value over the current manual `workflow_dispatch` trigger.
4. **Enable real Vercel deployment.** Only with the user's explicit go-ahead — independent of steps 1-3, but sequenced after the skeleton is otherwise solid.
5. **Add a public `/stats` cost-transparency page.** Only once real LLM costs actually exist to report — there is nothing honest to show on this page until step 1 ships; building it earlier would just be an empty gesture.

## Open risks

- **The placeholder curation heuristic has never been validated against real editorial judgment.** Its rankings (derived purely from `points`/`num_comments`) may not resemble what a human or a real model would actually flag as interesting — this is expected and disclosed, not a hidden defect, but it means the current digest's "interest" ordering should not be over-trusted.
- **Single-source (HN only) means the digest currently undersells its own scope** relative to the "arXiv + Hacker News" framing in this project's own overview — this is intentional and sequenced (see Roadmap #2), not an oversight, but it is a real gap until arXiv lands.
- **No cron and no deployment means "daily" is currently aspirational, not operational.** Every digest so far is the product of a manually-triggered `workflow_dispatch` run, not an actual daily cadence.
- **`content.config.ts` and `scripts/pipeline.ts` both depend on `digestSchema.ts` staying in sync by construction** (both import the same file), but this has not yet been exercised against a real schema-breaking change — the "zero drift" guarantee is a design intent, not yet a proven one.

---
*Last updated: 2026-09-02. Agents: keep this current as work progresses — do not let it go stale while `AGENTS.md`/`SOUL.md`/`CLAUDE.md` stay static.*
