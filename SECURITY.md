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
no database, and no user accounts. **As of 2026-09-02 (ADR 0003), real LLM
curation via AWS Bedrock is the default path** — see "Known Security
Considerations" and "Secrets Handling" below, both updated accordingly.

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
- arXiv's own Atom API's correctness, availability, or rate limiting —
  report upstream to arXiv, not here. arXiv ingestion (`fetchArxivPapers()`
  in `scripts/pipeline.ts`) is now real and in scope for how THIS repo
  consumes that API (parsing, validation, filesystem-safe ID sanitization).
- Dev.to's own Articles API's correctness, availability, or rate limiting —
  report upstream to Dev.to/Forem, not here. Dev.to ingestion
  (`fetchDevtoArticles()` in `scripts/pipeline.ts`) is now real and in scope
  for how THIS repo consumes that API (the list+detail call pattern, the
  body-text excerpt truncation, and validation).
- AWS Bedrock's own service correctness, availability, or rate limiting —
  report upstream to AWS, not here. How THIS repo constructs prompts,
  handles the response, and falls back on error (`src/lib/llmCuration.ts`)
  is in scope.
- **The site is live** at https://daily-dose-hazel-delta.vercel.app (ADR
  0004, see `status.md`). Vercel's own build/deploy infrastructure is out
  of scope (report to Vercel); this repo's own build configuration and
  what data reaches the deployed site stays in scope.
- The sibling projects `nh-deck` and `nh-skills` — each is an independent
  repository with its own `SECURITY.md`.
- `../Not-Humans-Lab/` — a separate, docs-only meta-repo; report issues
  with its content there, not here.

## Known Security Considerations

These are real, documented properties of the current design and of the
design this project is deliberately heading toward — not hypothetical
hardening ideas.

- **Prompt injection via ingested content — implemented, not just
  designed.** Real LLM scoring is now wired in (`src/lib/llmCuration.ts`,
  ADR 0003): HN titles, arXiv abstracts, GitHub descriptions, and (as of
  ADR 0007) Dev.to article body excerpts all flow into a prompt sent to a
  Bedrock-hosted model. `buildPrompt()` wraps each item in explicit
  `<item>`/`<title>`/`<abstract>`/`<description>`/`<article_excerpt>`
  delimiters preceded by an instruction telling the model this content is
  untrusted external data, not instructions, and to score honestly without
  conflating engagement with genuine interest. This mitigation shipped in
  the same change that introduced the real model call, not retrofitted
  after, and the instruction text was updated again when GitHub and Dev.to
  were each added as new untrusted-content sources. It has not been
  adversarially red-teamed with a real injection payload — treat it as a
  reasonable first-pass mitigation, not a proven-unbreakable one, and
  report any bypass found via the channel above.
- **Real secrets now exist in this codebase's environment.** An AWS
  Bedrock credential (`BEDROCK_ACCESS_KEY_ID`/`BEDROCK_SECRET_ACCESS_KEY`)
  is configured as GitHub Encrypted Secrets on this repo, shared with the
  sibling Anvilry project's production chatbot use of the same IAM user.
  See "Secrets Handling" below for handling rules and the shared-credential
  tradeoff.
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

- **daily-dose now has real secrets**: `BEDROCK_ACCESS_KEY_ID` and
  `BEDROCK_SECRET_ACCESS_KEY`, stored as
  [GitHub Encrypted Secrets](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions)
  on this repo (plus `BEDROCK_REGION`/`LLM_PROVIDER` as plain repo
  variables), referenced only via CI environment variables at run time —
  **never** committed to source, `.env` files, or workflow YAML in
  plaintext. This applies equally to any future Vercel deployment's
  environment variables.
- **This credential is shared with the sibling Anvilry project's**
  production chatbot use of the same IAM user (`AAVA_Bedrock_Non_Prod`).
  Rotating it is a two-repo operation — coordinate with Anvilry's own
  secret storage before rotating, and update both when it happens. A
  GitHub-OIDC migration (per-repo federated credentials instead of a
  shared long-lived key) is a documented fast-follow, not yet implemented.
- **Bedrock credential values may be base64-encoded at rest** (matching
  Anvilry's own storage convention) — code that consumes them must
  base64-detect-and-decode before use; passing the raw encoded value to
  `AnthropicBedrock`'s SigV4 signer fails authentication. See
  `agent_learning.md`'s dated entry for the real bug this caused during
  implementation.
- If a secret is ever accidentally committed to this repository, treat it
  as compromised immediately: rotate it at the source (coordinating with
  Anvilry per above), then scrub it from git history (not just delete it
  in a new commit).
- **The `schedule:` cron trigger is now enabled and live** (ADR 0004,
  `.github/workflows/daily-pipeline.yml`) — it runs daily, makes a real
  Bedrock call using the same repo secrets described above, and commits
  its own output using a `contents: write` permission requested only on
  that one workflow (the repo-wide Actions default stays read-only). This
  is now a real, recurring, unattended use of these secrets — treat any
  future change to this workflow's permissions or triggers with the same
  scrutiny as a secrets-handling change, not a routine CI edit.
- **Vercel's environment does not include the Bedrock secrets, confirmed via
  real build logs.** No `BEDROCK_*` environment variables are configured on
  the Vercel project, and its Build Command is `npm run build` only — never
  `npm run pipeline` — so the credential's exposure surface has not expanded
  to include Vercel's build environment (including PR preview builds). Any
  future change to the Build Command is a real security decision, not a
  routine project-settings edit.

## Supply Chain & Dependency Policy

- **Runtime dependencies are intentionally small and named up front**:
  `astro` (static site + Content Collections), `zod` (schema validation,
  shared between the pipeline and the site), `chart.js` (the one Chart.js
  island), and (as of ADR 0003) `@anthropic-ai/bedrock-sdk` +
  `@anthropic-ai/sdk` (the real LLM curation client and its error types).
  Dev-only: `tsx` (runs the pipeline script), `typescript`, and `vitest`
  (tests, with the Bedrock SDK fully mocked — no automated test may make a
  real network call). Any further LLM SDK or provider addition is itself
  a significant decision that must be recorded in `decisions.md`/a new
  ADR, not a routine dependency bump.
- **The Zod schema (`src/lib/digestSchema.ts`) is the highest-scrutiny
  file** in this repo's dependency-adjacent surface, because it is the
  single point both the pipeline and the site trust to keep malformed
  data out. Changes to it are reviewed for what they newly allow through,
  not just what they add.
- **arXiv ingestion, real LLM scoring, GitHub sourcing, and Dev.to sourcing
  are all shipped** — see `status.md`, `decisions.md`/ADR 0002, ADR 0003,
  ADR 0006, ADR 0007. GitHub sourcing calls the public Search API directly
  via `fetch`, no new dependency; Dev.to sourcing calls the public Articles
  API directly via `fetch` as well — do not add a GitHub or Dev.to client
  library without a documented reason.
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
