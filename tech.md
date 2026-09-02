# Tech Stack — daily-dose

Fast-lookup inventory of every technology choice in this repo, why it was
made, and how to keep it current. This file describes **daily-dose only**; it
does not restate or duplicate the umbrella-level tech.md at
`../Not-Humans-Lab/tech.md` — see "Inherited constraints" below for the one
item that flows down from there.

daily-dose is a daily AI-curated technical digest (arXiv + Hacker News) — the
author's own version of
[arpitbbhayani/the-daily-diff](https://github.com/arpitbbhayani/the-daily-diff).
It is the third of three independent sibling projects under the
Not-Humans-Lab umbrella. As of 2026-09-02 (ADR 0003), real LLM curation via
AWS Bedrock is the default path — a working Bedrock credential (shared with
the sibling Anvilry project) now exists in this environment. The original
placeholder-only constraint no longer applies; the placeholder itself is kept
as an explicit, loudly-logged fallback for when credentials aren't configured
(e.g. local dev) rather than being deleted.

## Stack summary

| Layer | Technology | Role |
|---|---|---|
| Front-end framework | Astro (`output: "static"`) | Builds the static digest site; no SSR/server runtime |
| Content layer | Astro Content Collections (glob loader) | Reads `src/data/digest/*.json` into typed, validated entries |
| Schema / validation | Zod (`src/lib/digestSchema.ts`) | Single shared schema — both the content collection config and the pipeline script import the same exported schema |
| Pipeline runtime | TypeScript, run via `tsx` | `scripts/pipeline.ts`: fetch (per-source) → placeholder-score → validate → write |
| Data source | Hacker News Algolia API (`hn.algolia.com/api/v1/search?tags=front_page`) | Free, keyless, live HTTP fetch |
| Data source | arXiv public API (`export.arxiv.org/api/query`, cs.AI/cs.LG/cs.CL) | Free, keyless, live HTTP fetch — returns Atom/XML, not JSON |
| XML parsing | `fast-xml-parser` | Parses the arXiv Atom feed response (nested elements, namespaces, multi-`<author>` entries) — small, dependency-light, avoids hand-rolled regex XML parsing |
| Charting | Chart.js (`chart.js/auto`), one plain `<script type="module">` island | Renders a bar chart of the day's `interest_score`s — no React/Vue needed |
| Styling | Minimal inline CSS | No Bulma/Sass in this walking skeleton — deferred fast-follow |
| Test runner | Vitest | Unit + integration + e2e layers (see `TESTING.md`) |
| CI | GitHub Actions, `ci.yml` (`workflow_dispatch` + push/PR, read-only) and `daily-pipeline.yml` (`schedule:` + `workflow_dispatch`, `contents: write`) | Two dedicated workflows, least-privilege — see ADR 0004 |
| Deployment | Vercel, live | Git-integrated auto-deploy on push to `main`, `npm run build` only — https://daily-dose-hazel-delta.vercel.app, connected per ADR 0004 |
| LLM SDK | `@anthropic-ai/bedrock-sdk` + `@anthropic-ai/sdk` (error types) | `AnthropicBedrock` client in `src/lib/llmCuration.ts`, model fallback chain Sonnet 5 → Sonnet 4.6 → Opus 4.6 → Haiku 4.5 (Sonnet 5 leads as of ADR 0005; needs `thinking: {type: "disabled"}` explicitly, unlike the rest of the chain), credentials via `BEDROCK_ACCESS_KEY_ID`/`BEDROCK_SECRET_ACCESS_KEY`/`BEDROCK_REGION` env vars |
| License | Apache-2.0 | Decided at the Not-Humans-Lab umbrella level, applied identically across sibling projects |

## Adoption status

| Technology | Status | Notes |
|---|---|---|
| Astro (static output) | **Adopt** | The entire front-end. `output: "static"` — no server adapter, no SSR. |
| Zod | **Adopt** | `src/lib/digestSchema.ts` exports `DigestItemSchema`, imported by both `src/content.config.ts` and `scripts/pipeline.ts`. One schema, two enforcement points, zero drift — see Rationale. |
| Chart.js | **Adopt** | One island (`chart.js/auto`, plain `<script type="module">`). No framework (React/Vue/Svelte) pulled in just to render one bar chart. |
| TypeScript + `tsx` | **Adopt** | Runs `scripts/pipeline.ts` directly without a separate compile step. |
| Vitest | **Adopt** | Test runner for all layers described in `TESTING.md`. |
| GitHub Actions (`workflow_dispatch` + `schedule:`) | **Adopt** | `ci.yml` (manual + push/PR, read-only) and `daily-pipeline.yml` (real daily `schedule:` trigger, `contents: write` on itself only) — see ADR 0004. |
| Vercel deployment | **Adopt** | Git-integrated auto-deploy on push to `main`, Build Command confirmed via real build logs as `npm run build` only (never the pipeline) — live at https://daily-dose-hazel-delta.vercel.app, per ADR 0004. |
| `@anthropic-ai/bedrock-sdk` / `@anthropic-ai/sdk` | **Adopt** | Real Bedrock credential exists (shared with sibling Anvilry project) — see ADR 0003. `src/lib/llmCuration.ts` is the only file that constructs the client. |
| Bulma / Sass | **Hold** | Deferred fast-follow. Styling for this walking skeleton is minimal inline CSS, matching nh-deck's precedent of deferring visual polish. |
| arXiv sourcing | **Adopt** | `scripts/pipeline.ts` exports `fetchArxivPapers`, fetching live from `export.arxiv.org/api/query` (cs.AI/cs.LG/cs.CL, sorted by submission date). Scored by the placeholder `scoreArxivPlaceholder` in `src/lib/curation.ts` (recency-only signal, capped to a [3, 8] range — see that file's comment for the HN-vs-arXiv asymmetry rationale). |
| `fast-xml-parser` | **Adopt** | Parses the arXiv Atom/XML feed response in `fetchArxivPapers`. Small, well-known, dependency-light — chosen specifically because hand-rolled regex-based XML parsing is fragile against real Atom XML's nested elements, namespaces, and repeated `<author>`/`<category>` elements. |
| GitHub sourcing | **Hold (documented fast-follow)** | The shared schema already models `source: "hn" \| "arxiv" \| "github"`, but only `"hn"` and `"arxiv"` are populated so far. GitHub is a deliberate, documented simplification, not a silent gap. |

## Rationale (non-obvious choices)

- **One Zod schema, imported twice, not defined twice.**
  `src/lib/digestSchema.ts` is the single source of truth for what a digest
  item looks like. `src/content.config.ts` uses it to validate every JSON
  file Astro's glob loader reads from `src/data/digest/`;
  `scripts/pipeline.ts` uses the exact same import to validate each item
  before writing it to disk. If the schema ever needs to change, there is
  exactly one file to edit — this eliminates an entire class of "the
  pipeline wrote data the site can't render" bugs by construction, not by
  discipline.
- **`tsx`, not `ts-node`, for the pipeline script.** `tsx` is ESM-first and
  has no separate compile step, which matches Astro's own ESM-native
  tooling and avoids a second, differently-configured TypeScript execution
  path living alongside Astro's.
- **The placeholder curation step is now an explicit fallback, not the
  default path.** `src/lib/curation.ts`'s `interest_score`/`why_read`
  functions (still computed deterministically from real, already-fetched
  fields — never fabricated) are only used when Bedrock credentials aren't
  configured or the LLM's response omits a specific item — see ADR 0003.
  `src/lib/llmCuration.ts` is the real default path now.
- **One forced-tool-use batched call per pipeline run, not per-item calls.**
  `llmCuration.ts` scores every fetched item (HN + arXiv) in a single
  `messages.create()` call with `tool_choice` forced onto one tool whose
  input covers the whole batch, validated with Zod as the real safety net
  (the tool's own `input_schema` only biases generation). See ADR 0003 for
  why this beat a tiered cheap/strong-model split and per-item calls.
- **Live fetch, mocked tests — not live fetch everywhere.** The HN Algolia
  fetch itself is real and network-bound; it is exercised
  manually/personally when seeding real content (see `TESTING.md`), never
  inside the automated, network-mocked test suite. Tests must stay
  deterministic.
- **`daily-pipeline.yml` as a separate workflow from `ci.yml`, not a `schedule:` block added to it.** Least-privilege: only this one job requests `contents: write`; `ci.yml` and every future workflow stay on the repo's read-only default. See ADR 0004.
- **Direct commit from the cron job, scoped to data paths only — not a daily PR.** A daily digest that still needs a human to click "merge" every day isn't actually automated. Scoped via a bot-commit action's file-pattern option to `src/data/digest/**` + `src/data/stats.jsonl` only, so it can never sweep up an in-progress code change. An explicit, documented exception to `Branches.md`'s PR-for-every-change convention — see ADR 0004.
- **Chart.js as a plain script island, not a framework component.** One
  static bar chart of `interest_score` values does not need React/Vue's
  component model, state management, or hydration story — `<script
  type="module">` importing `chart.js/auto` directly is the entire
  requirement, matching this workspace's general preference (see nh-deck's
  analogous "no framework for one job" choice) for not reaching for a
  framework before a real need shows up.

## Version & upgrade policy

- **Node.js**: track current LTS. Bump the CI workflow's `node-version` and
  `tsx`/`astro` compatibility together.
- **Astro, Zod, Chart.js, `fast-xml-parser`, `tsx`, Vitest**: track latest stable minor/patch
  via normal dependency update flow; apply standard semver caution on
  majors, especially Astro (Content Collections API has shifted across
  majors before).
- **`@anthropic-ai/bedrock-sdk` / `@anthropic-ai/sdk`**: pinned in
  `package.json` (`^0.33.3` / `^0.123.0` respectively). Track latest stable
  minor/patch via normal dependency update flow.
- **Bulma / Sass**: not installed, nothing to pin yet.

## Constraints

- Real LLM calls (via `src/lib/llmCuration.ts`) may only be made using the
  Bedrock credential from `BEDROCK_ACCESS_KEY_ID`/`BEDROCK_SECRET_ACCESS_KEY`
  env vars — never hardcoded, never a different provider without a new ADR.
  Automated tests (`tests/`) must always mock the SDK entirely — no test may
  make a real network call to Bedrock.
- Both enforcement points for a digest item's shape
  (`src/content.config.ts` and `scripts/pipeline.ts`) must import
  `DigestItemSchema` from `src/lib/digestSchema.ts` — never redefine it
  locally.
- The pipeline script may only write to `src/data/digest/YYYY-MM-DD/`
  (one file per story); it does not touch any other part of `src/`.
- `daily-pipeline.yml` may only ever commit `src/data/digest/**` and
  `src/data/stats.jsonl` — never a blanket `git add -A`. Any change to its
  file-pattern scope is itself a decision worth a `decisions.md` entry.
- Vercel's Build Command must stay `npm run build` only — it must never be
  changed to also run `npm run pipeline`, which would put the Bedrock
  credential into Vercel's environment and trigger a real paid call on
  every PR preview build. See ADR 0004's rejected "regenerate at build
  time" alternative.

## Deprecated / Hold list

- **Bulma/Sass** — Hold, deferred fast-follow for visual polish.
- **GitHub sourcing** — not deprecated, just not yet implemented. Listed
  under Adoption status as a documented fast-follow, not here, to avoid
  implying rejection. (arXiv sourcing has moved to Adopt — see above.)

## Local dev requirements

- Node.js current LTS installed.
- `npm install` at the repo root.
- `npm run pipeline` (wraps `tsx scripts/pipeline.ts`) — requires live
  network access to `hn.algolia.com` (HN) and `export.arxiv.org` (arXiv) to
  seed real content. No API keys required or used for either. Use
  `--sources hn` or `--sources arxiv` to run just one.
- `npm run build` (wraps `astro build`) — reads only the already-committed
  `src/data/digest/*.json` files; no network access needed.
- `npm test` — runs the automated suite against mocked HN/arXiv/Bedrock
  responses; no network access needed and none should be attempted (see
  `TESTING.md`'s Non-Determinism Policy).
- No database, no external service beyond the free HN Algolia and arXiv
  endpoints is needed to develop or test this project. `npm run pipeline`
  with real LLM curation additionally needs `BEDROCK_ACCESS_KEY_ID`/
  `BEDROCK_SECRET_ACCESS_KEY` set (base64-encoded or raw — see
  `agent_learning.md`'s decoding gotcha); without them it falls back to the
  placeholder with a loud warning, so local dev works either way.

## Inherited constraints (from the Not-Humans-Lab umbrella)

- **License: Apache-2.0.** Decided once at the system level and applied
  identically across all three sibling projects (`daily-dose`, `nh-deck`,
  `nh-skills`): "explicit patent grant matters more for enterprise adoption
  than MIT's silence on patents; consistency across all three signals a
  deliberate choice to reviewers." See `../Not-Humans-Lab/decisions.md` for
  the full system-wide rationale — not duplicated here.
