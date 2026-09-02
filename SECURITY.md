# Security Policy

daily-dose is a **daily AI-curated technical digest** (arXiv + Hacker
News) — the author's own version of
[arpitbbhayani/the-daily-diff](https://github.com/arpitbbhayani/the-daily-diff).
It is the third of three independent sibling projects (`daily-dose`,
`nh-deck`, `nh-skills`) under the "Not-Humans-Lab" umbrella; cross-cutting
system-level docs for that umbrella live in the separate, docs-only
meta-repo at `../Not-Humans-Lab/` (linked by relative path, not
duplicated here).

**This is a static content site with a data pipeline, not a CLI or a
skills library.** Its product shape is fundamentally different from its
two sibling projects — `nh-deck` (a local rendering CLI) and `nh-skills`
(a Markdown skills collection) — even though it borrows their
documentation conventions. daily-dose has two moving parts: a standalone
TypeScript pipeline script (`scripts/pipeline.ts`, run via `tsx`) that
fetches from Hacker News' free, keyless Algolia API and writes one
validated JSON digest file per day, and an Astro static site
(`output: "static"`) that reads those files via Content Collections and
renders them, plus one Chart.js island. There is no server-side runtime,
no database, no user accounts, and — as of this writing — **no live LLM
API call anywhere in the codebase.**

## Supported Versions

daily-dose does not yet follow semver release branches. There is one
living line of development: the `main` branch. The latest commit on
`main` is the only supported version.

| Version                 | Supported               |
| ------------------------ | ------------------------ |
| `main` (latest commit)   | Yes                      |
| Anything older / forked  | No — pull latest `main`  |

## Reporting a Vulnerability

Please report suspected vulnerabilities **privately**, not as a public
GitHub issue.

- **Preferred channel**: GitHub's private vulnerability reporting, via
  the "Report a vulnerability" button under this repo's **Security** tab
  (Security → Advisories → "Report a vulnerability"). This opens a
  private advisory visible only to the maintainer and you.
- **Fallback channel**: open a GitHub issue titled only `Security contact
  needed` with no technical details, and the maintainer will follow up to
  establish a private channel.

Do not include exploit details or a working proof-of-concept (e.g., a
crafted HN API response, or an injected string that would manipulate a
future LLM prompt) in a public issue, PR, or discussion.

### What to include in a report

- Which part of the system is affected: the pipeline script
  (`scripts/pipeline.ts`), the shared Zod schema
  (`src/lib/digestSchema.ts`), the Astro build/render path, the Chart.js
  island, or CI configuration.
- What the concern is: e.g., an injection vector via ingested Hacker News
  content, a schema-validation bypass that lets malformed data reach the
  site, a supply-chain issue in a dependency, or a CI workflow
  misconfiguration.
- Steps to reproduce, ideally with the exact command run (`npm run
  pipeline`, `npm run build`) and, if relevant, the specific upstream API
  response that triggered the issue.
- Your Node.js version (`node -v`) and OS.

## Disclosure Policy

This is a personal, best-effort project — the timeline below is a target,
not a contractual SLA (see `SUPPORT.md` for the general support posture).

| Stage                          | Target timing                |
| ------------------------------- | ------------------------------ |
| Acknowledge report              | Within 5 business days        |
| Initial triage / severity call  | Within 10 business days       |
| Fix or mitigation merged        | Best effort, no fixed SLA — prioritized over other work |
| Public disclosure               | After a fix is merged, or 90 days from report, whichever is sooner, unless the reporter agrees to a longer embargo |

Credit is given to reporters in the fix commit/PR description unless the
reporter asks to remain anonymous.

## Scope

**In scope:**

- The pipeline script `scripts/pipeline.ts` and its fetch against Hacker
  News' free, keyless Algolia API
  (`https://hn.algolia.com/api/v1/search?tags=front_page` or equivalent).
- The shared Zod schema `src/lib/digestSchema.ts` and both places it
  gates data: the pipeline script's write path and the Astro Content
  Collection's `glob` loader read path.
- The deterministic placeholder scoring/`why_read` function itself —
  specifically, whether it stays honest about only deriving from real,
  already-fetched HN fields (points, `num_comments`, title) rather than
  fabricating or hardcoding data.
- The Astro site (`src/pages/`, `src/data/digest/*.json`) and its one
  Chart.js island (`<script type="module">` importing `chart.js/auto`).
- CI configuration (`.github/workflows/`) for this repository.
- Repository metadata that affects trust (`LICENSE`, this file,
  `SUPPORT.md`, `decisions.md`).

**Out of scope:**

- Hacker News' own Algolia API's correctness, availability, or rate
  limiting — report upstream to HN/Algolia, not here. This repo only
  tracks how it consumes that API.
- arXiv ingestion — **does not exist yet** in this walking skeleton
  (single-source, HN-only, is an explicit, documented fast-follow; see
  `status.md`). There is nothing to report against a source that isn't
  wired in.
- Real LLM-based curation/scoring — **does not exist yet.** No
  Anthropic/OpenAI API keys are present in this environment, and no code
  path attempts a live model call. See "Known Security Considerations"
  below for the hard requirement that applies once this is wired in.
- Any hosted/production deployment of daily-dose — none exists yet. No
  Vercel project is connected (see `status.md`); this repo builds and
  tests only, it does not currently serve traffic anywhere.
- The sibling projects `nh-deck` and `nh-skills` — each is an independent
  repository with its own `SECURITY.md`.
- `../Not-Humans-Lab/` — a separate, docs-only meta-repo; report issues
  with its content there, not here.

## Known Security Considerations

These are real, documented properties of the current design and of the
design this project is deliberately heading toward — not hypothetical
hardening ideas.

- **Prompt injection via ingested content is a real, named risk for the
  next phase of this project, not a nice-to-have.** Today's "curation"
  step is a deterministic placeholder function that only computes
  `interest_score` and `why_read` from real, already-fetched numeric HN
  fields (`points`, `num_comments`) and the title string — it never
  constructs a prompt and never calls a model, so there is no injection
  surface today. **This changes the moment real LLM scoring is wired in.**
  At that point, untrusted third-party text — HN titles, and eventually
  HN comment bodies and arXiv abstracts — will flow into a prompt sent to
  a model. That ingested text **must be sanitized, isolated, and treated
  as untrusted data rather than as instructions** before it ever reaches
  a model call (e.g., via clear data/instruction delimiters, a
  system-prompt boundary the ingested content cannot escape, and
  stripping or neutralizing any text that resembles an instruction
  override, a role-switch attempt, or an embedded directive). This is a
  **hard requirement** for whoever implements the real LLM curation step
  — it must be designed in from the first version of that code, not
  retrofitted after an incident. Do not ship a "curate with a real LLM"
  change without this.
- **No secrets exist in this codebase today.** There are no
  Anthropic/OpenAI API keys, no other LLM provider keys, and no other
  credentials of any kind — this walking skeleton runs entirely against
  HN's free, keyless public API. Any code that appears to call a real
  LLM API is either a placeholder, dead code, or a bug — it should not
  exist; see the top of this file and `decisions.md`/ADR 0001 for why.
- **The HN fetch is against a free, public, keyless API by design.**
  `scripts/pipeline.ts` must not be modified to send credentials,
  authenticated requests, or any identifying header beyond a reasonable
  User-Agent to HN's Algolia endpoint — there is no account to protect
  and none should be introduced casually.
- **Ingested HN data is validated at a single schema boundary, twice.**
  The pipeline script validates what it fetched/computed against
  `src/lib/digestSchema.ts` before writing each story's file under
  `src/data/digest/YYYY-MM-DD/`, and Astro's Content Collections glob
  loader validates the same schema again when the site reads each file
  at build time. This "one schema,
  two enforcement points" design exists specifically so malformed or
  unexpected upstream data (a missing field, a wrong type, an
  unexpectedly huge string) fails loudly at build time rather than
  silently reaching rendered HTML. Do not bypass either enforcement point
  "just this once" to unblock a build — fix the data or the schema
  instead.
- **No CDN dependency in rendered output, matching the sibling projects'
  convention.** Chart.js is an installed dependency (`chart.js/auto`),
  imported via a plain `<script type="module">` — not loaded from a CDN
  `<script src>`. A CDN reference would be both a security/privacy leak
  (third-party script executing in the context of the rendered site) and
  a drift from this workspace's established local-first-leaning
  convention for its static sites.
- **This site has no user input surface today.** There is no form, no
  comment system, no query parameter that reaches a database or a
  template unsanitized — the only "input" is the digest JSON the
  pipeline itself writes, which is schema-validated. If a future feature
  adds any user-facing input (a search box, a feedback form), it must be
  treated as a new trust boundary requiring its own review, not bolted on
  silently.

## Secrets Handling

- **daily-dose has no secrets today.** No LLM API keys (Anthropic,
  OpenAI, or otherwise) are present in this environment or required to
  run the pipeline script or build the site — the HN Algolia fetch is
  free and keyless.
- **When LLM API keys are eventually added** (to replace the placeholder
  scoring step with a real model call), they **must** be stored as
  [GitHub Encrypted Secrets](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions)
  (repository or environment secrets) and referenced only via CI
  environment variables at run time — **never** committed to source, `
  .env` files, or workflow YAML in plaintext. This applies equally to any
  future Vercel deployment's environment variables.
- If a secret is ever accidentally committed to this repository, treat it
  as compromised immediately: rotate it at the source, then scrub it from
  git history (not just delete it in a new commit).
- CI for this repo does not require any secrets to build, test, or run
  the pipeline today. The `schedule:` cron trigger for automated daily
  runs is explicitly **not enabled** in this phase, in part because it
  would eventually depend on real LLM API keys that do not exist yet —
  see `status.md`.

## Supply Chain & Dependency Policy

- **Runtime dependencies are intentionally small and named up front**:
  `astro` (static site + Content Collections), `zod` (schema validation,
  shared between the pipeline and the site), and `chart.js` (the one
  Chart.js island). Dev-only: `tsx` (runs the pipeline script), `
  typescript`, and `vitest` (tests). No LLM SDK (`@anthropic-ai/sdk`,
  `openai`, or similar) is a dependency — adding one is itself a
  significant decision that must be recorded in `decisions.md`/a new ADR,
  not a routine dependency bump.
- **The Zod schema (`src/lib/digestSchema.ts`) is the highest-scrutiny
  file** in this repo's dependency-adjacent surface, because it is the
  single point both the pipeline and the site trust to keep malformed
  data out. Changes to it are reviewed for what they newly allow through,
  not just what they add.
- **arXiv ingestion and real LLM scoring are decided-but-not-yet-built.**
  They are documented fast-follows (see `status.md`, `decisions.md`),
  not silently skipped. Do not add an LLM SDK or an arXiv client
  dependency ahead of that explicit decision.
- **Any future dependency addition** must be justified against
  KISS/YAGNI (per this workspace's global coding-style rules) before
  being added — "might need it later" is not sufficient justification.
  New runtime dependencies should be called out explicitly in
  `decisions.md`.
- Dependabot (or equivalent) alerts are triaged like any other repo, with
  priority given to `astro` and `zod` (both touch the data-validation
  boundary) over lower-risk devDependencies.
- License: Apache-2.0, decided once at the Not-Humans-Lab system level and
  applied identically across `daily-dose`, `nh-deck`, and `nh-skills`
  (see `../Not-Humans-Lab/decisions.md`). New dependencies should be
  license-compatible with Apache-2.0.

## Contact

Use GitHub private vulnerability reporting (see above) as the primary
channel. For anything that is not a vulnerability report, see
`SUPPORT.md`.
