# agent_learning.md — daily-dose

Append-only, dated register of corrections applied to AI agents working in this repo — companion to `AGENTS.md`/`CLAUDE.md` (which hold current-state static instructions), not a replacement. This file holds the *history of why* those instructions exist.

**Scope:** learnings specific to this project's own code/domain. A learning that recurs in two or more sibling projects' own `agent_learning.md` files gets copied up to `../Not-Humans-Lab/agent_learning.md`, with a one-line pointer left here.

## Entries

### 2026-09-02 — Promoted to system level (x2)

Two learnings recurred here after first being observed in nh-deck:

1. **Aspirational docs drift** — this repo's docs described a single array-per-day digest file (`src/data/digest/YYYY-MM-DD.json`) and a separate `src/components/ScoreChart.astro`; the real, working pipeline writes one file per story into a dated folder, and the chart renders inline in `index.astro`. The array-file shape was also a genuine architecture bug, not just a doc error — Astro's `glob()` content loader requires one schema-matching object per file, so the original shape would have failed `astro build` outright. Fixed in `scripts/pipeline.ts` and `src/content.config.ts`, then swept across 11 doc files.
2. **ConfigProtection blocks `tsconfig.json` in any new project with its own `package.json`** — pre-empted here by proactively adding this repo's `tsconfig.json` path to the hook's allowlist before running the scaffold workflow, based on hitting the same block in nh-deck first.

Full entries, root causes, and the standing rules now in force for both: see `../Not-Humans-Lab/agent_learning.md`.

### 2026-09-02 — Bedrock credentials copied from the sibling Anvilry project may be base64-encoded; decode before use

- **Trigger**: real LLM curation was wired in for the first time (ADR 0003). The exact same `BEDROCK_ACCESS_KEY_ID`/`BEDROCK_SECRET_ACCESS_KEY` values that resolved to a working IAM identity via `sts.get_caller_identity` (which tolerates base64 input in some SDK paths) produced a real `PermissionDeniedError: 403 The security token included in the request is invalid` when passed as-is into `AnthropicBedrock`'s SigV4 signing.
- **Observation**: Anvilry's own `.env.local`/`src/lib/llm.ts` documentation already stated these values may be "raw or BASE64-encoded (decoded at runtime)" via a `decodeSecret` helper - this was read during research but not actually applied when the values were first copied into this repo's GitHub secrets and into a local test run.
- **Root cause**: assumed "the credential works" (proven via one successful boto3 call) meant "the raw stored value is safe to pass through anywhere" - it does not; some AWS client paths tolerate or auto-detect base64 input, `AnthropicBedrock`'s SigV4 signer does not.
- **Correction / Rule**: whenever copying a credential value FROM Anvilry's `.env.local` (or any source documented as "raw or base64-encoded") to a new destination, always attempt a base64-decode first and use the decoded value if it round-trips to printable text - never assume the raw stored bytes are what a new consumer expects. This was fixed in both the GitHub repo secrets and every real local test run.
- **Scope**: this-project-only for now (only daily-dose has wired in real Bedrock calls so far), but flag if nh-deck or nh-skills ever do the same - promote to system level if it recurs.
- **Status**: active.

### 2026-09-03 — `stefanzweifel/git-auto-commit-action`'s `commit_author` defaults to the triggering actor, not the configured bot identity

- **Trigger**: verified `.github/workflows/daily-pipeline.yml` (ADR 0004) end-to-end via a manual `workflow_dispatch` run before trusting the `schedule:` trigger unattended.
- **Observation**: the resulting commit's Committer showed `github-actions[bot]` (correctly set via `commit_user_name`/`commit_user_email`), but the Author still showed the human who triggered the run (`sairam0424`) — not the intended bot identity.
- **Root cause**: `commit_user_name`/`commit_user_email` only set `git config user.name`/`user.email`, which becomes the committer. The action's separate `commit_author` input defaults to `${{ github.actor }}` and must be set explicitly to also override the author field — assumed setting the user name/email inputs alone would cover both.
- **Correction / Rule**: when using `stefanzweifel/git-auto-commit-action` (or similar bot-commit actions with separate author/committer inputs) to enforce a bot identity distinct from any human, set the author-controlling input explicitly too — never assume the committer-identity input covers both fields.
- **Scope**: this-project-only for now (only `daily-pipeline.yml` uses this action), but promote if any sibling project adopts the same action and hits the same gap.
- **Status**: active — fixed in the same change, re-verified.

### 2026-09-03 — `@astrojs/rss`'s `rss()` already entity-escapes the whole `content` string once; pre-escaping field values double-escapes them

- **Trigger**: reviewing a dynamic-workflow-built RSS feed feature before shipping it (never trust agent self-report — verify the actual output).
- **Observation**: `rss.xml.ts` built each item's `<content:encoded>` HTML by hand-escaping `title`/`source`/`why_read` with a local `escapeHtml()` (turning `&`/`<`/`>` into entities) before handing the composed string to `rss()`. The real output showed apostrophes rendered as `&apos;` even though `escapeHtml()` never touches apostrophes — a tell that `rss()` itself fully entity-escapes the entire `content` string during XML serialization. Confirmed directly by calling `rss()` with a raw, unescaped `&`/`<...>` string: it came back correctly single-escaped.
- **Root cause**: assumed a "build raw HTML, hand it to the library" pattern meant the library would either trust it verbatim (CDATA) or need help escaping it — didn't verify which, and didn't test the actual installed version's behavior before writing the escaping code.
- **Correction / Rule**: never pre-escape a value that will be embedded in a string subsequently escaped again by a downstream serializer — verify (with a real, minimal call) whether the library CDATA-wraps or entity-escapes `content`/`content:encoded` before writing any escaping code at all. This project's fix: moved the rendering into `src/lib/rssContent.ts`, which interpolates field values completely raw, trusting `rss()`'s own single-pass escaping.
- **Scope**: this-project-only for now (only daily-dose has an RSS feature), but promote if any sibling project adds one and hits the same gap.
- **Status**: active — fixed, with a regression test (`tests/rss-feed.test.ts`) that exercises the real `rss()` call against a synthetic title containing a literal `&` and asserts the output is never double-escaped.

### 2026-09-03 — a module that imports `astro:content` can never be unit-tested directly from plain Vitest

- **Trigger**: same RSS feature review — adding a regression test that imported `src/pages/rss.xml.ts` directly failed with `Cannot find package 'astro:content'`.
- **Observation**: `astro:content` is a virtual module Astro's own dev/build pipeline resolves; plain Vitest (not run through Astro's Vitest container) cannot resolve it at all, so importing ANYTHING from a file with `import ... from "astro:content"` at module scope — even just to reach an unrelated exported function in that same file — fails immediately.
- **Root cause**: exported the rendering function directly from `rss.xml.ts` instead of noticing this repo's own existing pattern: `tests/content-collection.test.ts`'s own precondition comment already documents replicating the glob loader's behavior at the filesystem level specifically to avoid this exact problem — the pattern existed, it just wasn't checked before writing new code that violated it.
- **Correction / Rule**: any pure logic that a page/endpoint needs, if it's going to be unit-tested directly, must live in a module that never imports `astro:content` (or any other Astro virtual module) — pass in plain data (e.g. `DigestItem[]`, not `CollectionEntry<"digest">[]`) and let the `astro:content`-importing page/endpoint be the only place that bridges the two.
- **Scope**: this-project-only, but the underlying rule ("virtual-module imports poison the whole file for plain-Vitest unit testing") is a real Astro-wide pattern worth remembering for `nh-deck`/`nh-skills` if either ever adopts Astro content collections.
- **Status**: active — fixed via `src/lib/rssContent.ts`.

### 2026-09-03 — a manual pipeline test run using a dev-sandbox clock ahead of GitHub Actions' real clock created a stale "future" digest folder that shadowed the real cron's output

- **Trigger**: the user reported the homepage showing only GitHub items for "today," while yesterday's archive page correctly showed all three sources.
- **Observation**: earlier the same session, a manual `npx tsx scripts/pipeline.ts --sources github --limit 5` verification run (for ADR 0006) used the dev sandbox's system clock, which read one calendar day ahead of GitHub Actions' real runner clock at the time. That run wrote `src/data/digest/2026-09-03/` containing only 5 GitHub items. Hours later, the real `daily-pipeline.yml` cron fired for real on GitHub's infrastructure, whose clock still said "today" was `2026-09-02` — it correctly fetched and committed a fresh, complete 15-item (5 HN + 5 arXiv + 5 GitHub) set to `src/data/digest/2026-09-02/`. `index.astro`/`digestGrouping.ts` picks the lexicographically latest date string as "latest digest" — `"2026-09-03" > "2026-09-02"` — so the stale, incomplete manual-test folder outranked the genuinely fresh, complete cron output and was the only thing visitors saw.
- **Root cause**: not a bug in the pipeline or the date-sorting logic (both worked exactly as designed within their own scope) — a dev sandbox's clock and CI's real clock silently disagreeing, and a manual verification run's output being left in the tree as if it were real published content instead of being treated as a disposable test artifact.
- **Correction / Rule**: manual `npx tsx scripts/pipeline.ts` runs used purely to verify a change (not to seed real content) should have their output folder removed once verified, especially when today's date is close to a boundary — never leave a manual test run's dated output sitting in the tree past the verification step it was for. If a dated folder needs to stay (e.g. to seed real content ahead of the first cron run), sanity-check its date against the real world (`date -u`), not just the sandbox's own clock.
- **Scope**: this-project-only for now, but the underlying rule (dev sandbox clock ≠ CI clock; never trust a sandbox's `Date.now()`/`todayIsoDate()` output as ground truth against production) is a real pattern worth remembering for any sibling project that seeds dated content via a similar pipeline.
- **Status**: active — fixed by removing the stale `2026-09-03/` folder; verified the homepage/tests correctly show the real `2026-09-02` data as latest afterward.

### 2026-09-03 — GitHub's own REST API docs don't explicitly confirm that `issues.create`'s `labels` array auto-creates a not-yet-existing label

- **Trigger**: implementing `daily-pipeline.yml`'s new failure-notification step (`actions/github-script@v7`), which relies on `github.rest.issues.create({..., labels: ["automated-failure"]})` auto-creating the `automated-failure` label on its first real use, specifically to avoid adding a separate label-creation step.
- **Observation**: fetched both the "Create an issue" and "Add labels to an issue" pages of GitHub's official REST API docs before writing the workflow step, looking for explicit confirmation of auto-create-on-first-use behavior. Neither page states it either way — the `labels` parameter description on both only says which users can set labels, not what happens when a named label doesn't already exist in the repo.
- **Root cause**: this auto-create behavior is real and widely relied on in practice, but it is community/tribal knowledge (blog posts, other workflows), not something GitHub's own reference docs assert — a plausible-sounding API behavior with no first-party citation is a real gap, not a rounding error, when it lets a workflow skip a step it would otherwise need.
- **Correction / Rule**: when a workflow design depends on an unconfirmed-by-official-docs API side effect (here: label auto-creation), don't just cite it as settled — note the gap in the design doc/ADR itself, and verify it empirically at the first real opportunity (this repo's case: the first time `daily-pipeline.yml` actually fails for real, or via one manual `workflow_dispatch` test against an intentionally-broken step) rather than trusting it silently forever.
- **Scope**: this-project-only for now (only `daily-pipeline.yml` uses `github-script` to create labeled issues so far), but the underlying rule (cite the actual source for an API behavior claim, don't just repeat what "everyone knows") is worth remembering for any sibling project wiring up GitHub API automation.
- **Status**: resolved — empirically confirmed via two real, controlled `workflow_dispatch` test failures against an intentionally-broken step on a throwaway branch: `issues.create({..., labels: ["automated-failure"]})` correctly auto-created the not-yet-existing label and attached it (verified directly via `gh issue view` — the label was genuinely present, not just requested), and the second run correctly commented on the same issue instead of creating a duplicate. Flagged in `docs/adr/0004-enable-cron-automation-and-vercel-deployment.md`'s Update section for context; the gap itself (no first-party doc citation) still stands as a general lesson even though this specific instance is now confirmed working.

## Entry format

- **Date**
- **Trigger** — what prompted the entry
- **Observation** — what the agent did or assumed, verbatim where useful
- **Root cause** — why the agent got it wrong
- **Correction / Rule** — the concrete, checkable rule now in force
- **Scope** — this-project-only vs. system-wide (system-wide entries get promoted, see above)
- **Status** — active | superseded | promoted-to-AGENTS.md (with a link to where it landed)
