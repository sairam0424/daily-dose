# ADR 0004: Enable `schedule:` cron automation and connect real Vercel deployment

**Status:** Accepted, 2026-09-03

## Context and Problem Statement

`status.md` and `Context.md` have listed two items as "planned, not started — blocked on the user's explicit go-ahead" since the walking-skeleton phase: the `schedule:` cron trigger for automated daily pipeline runs, and a real Vercel deployment. Both blockers were explicit-permission gates, not technical ones — ADR 0003 already resolved the underlying "no real LLM keys" blocker for cron. The user has now given that go-ahead for both. This ADR covers how they actually get wired in, informed by a deep-research pass on the reference project (`arpitbbhayani/the-daily-diff`) specifically to check for a transferable pattern before inventing one from scratch.

## Deep-Research Findings (reference project: `arpitbbhayani/the-daily-diff`)

A structured research pass (repo metadata + workflow directory listing + `README.md` + `package.json` + `vercel.json`, all fetched directly from GitHub) found:

- **Zero GitHub Actions workflow files exist in the repo** (`.github/workflows/` is empty/absent), and the README documents no cron schedule, no CI, and no deployment process at all — the "automated daily redirection" feature mentioned in their README is a client-side redirect to the latest edition, not a build/publish cron. **There is no transferable CI/cron playbook to copy.**
- `package.json`'s `build` script is `node ./scripts/generate-latest.js && astro build` — their content-generation script runs **inline, inside the site's own build command**, not as a separate pipeline step.
- `vercel.json` exists (custom response headers only, no build overrides) and no other deploy config, dependency, or in-repo deploy step exists — the strong inference is Vercel's git-integrated auto-deploy (push → Vercel-side build), not an explicit CLI/action-based deploy. This is an inference from absence of evidence, not a confirmed statement from the source.
- No secrets, env vars, or LLM SDK dependency are visible anywhere in the fetched files (`package.json` has no `openai`/`anthropic`/`@anthropic-ai/*` dependency at all).

**Implication for daily-dose:** the one concrete architectural signal found — generation-at-build-time, coupled into `npm run build` itself — is a **considered-and-rejected** option below, not a template, for reasons specific to daily-dose's real-LLM-cost and data-permanence constraints that don't apply (or aren't visible) in the reference project.

## Decision Drivers

- Real LLM curation exists now (ADR 0003) — a scheduled run produces a genuinely meaningful digest, not the placeholder on autopilot.
- Must not silently break `Branches.md`'s "every change goes through a PR, even solo" convention — any exception must be narrow and explicitly documented, not a quiet bypass.
- Must not expand the Bedrock credential's exposure surface — Vercel must never need it.
- `src/data/digest/*.json` is documented everywhere as real, permanent historical content committed to git, "not generated build output" — any automation design must preserve that invariant, not regenerate it ephemerally.
- Confirmed via `gh api`: this repo's Actions default token permission is `read`-only, and `main` has no branch protection.
- `scripts/pipeline.ts`'s existing stale-file cleanup (added in ADR 0003) already makes repeated/duplicate same-day runs safe — no new idempotency work is needed to automate.

## Considered Options

### Commit strategy for the scheduled pipeline run

1. **Direct commit to `main` from the scheduled workflow, scoped strictly to `src/data/digest/**` and `src/data/stats.jsonl` (chosen).** An explicit, narrow, documented exception to the PR-for-every-change convention — justified because this is generated data, not code, and a human merge gate on a genuinely automated daily job would defeat the point of automating it.
2. **Open a PR each day for human review/merge.** Rejected — keeps the letter of the PR convention but not its spirit-of-automation; a "daily digest" that still needs a human to click merge every day isn't actually automated.
3. **Ephemeral generation at Vercel build time** (the reference project's apparent pattern — see Deep-Research Findings). Rejected for daily-dose specifically: it would (a) break the "digest JSON is permanent historical content" invariant documented across this repo's docs, since nothing would be committed at all; (b) trigger a real, paid Bedrock call on **every** Vercel build, including every PR preview deployment — a real cost and blast-radius problem the reference project's free/keyless build apparently doesn't have; and (c) require putting the Bedrock credential into Vercel's environment, doubling the places that shared-with-Anvilry secret lives, which `SECURITY.md` already flags as a tradeoff to minimize, not grow.

### Deploy trigger / platform

1. **Vercel, git-integrated auto-deploy on push to `main` (chosen)**, via the Vercel MCP's `create_git_project` (links the existing GitHub repo; production deploys on push to the production branch, PR preview deploys by default). Vercel's own project **Build Command must stay `npm run build` (`astro build`) — never `npm run pipeline`** — configured explicitly, not left to auto-detection, so Vercel never needs the Bedrock secret and every PR preview build stays free and side-effect-free.
2. Manual, ad hoc `deploy_to_vercel` file uploads. Rejected — not git-integrated, defeats the "push and it's live" goal, no natural rollback-via-git-history story.
3. A different host (Netlify, GitHub Pages). Not seriously considered — Vercel was the explicit target throughout this project's docs (`SECURITY.md`, `status.md`) from the start; the research found no evidence the reference project uses anything else either.

### How the scheduled job gets write access to push

1. **A new, dedicated workflow file declaring `permissions: contents: write` on itself only (chosen).** Confirmed via `gh api repos/.../actions/permissions/workflow` that the repo's default is `read` — an explicit per-workflow `permissions:` block requests exactly the access this one job needs without loosening anything for the existing `ci.yml` or any other workflow. Least-privilege by construction.
2. Flip the repo-wide default to read-write. Rejected — over-broad; would silently grant write access to every current and future workflow in the repo for the sake of one job.
3. A fine-grained PAT or GitHub App installation token. Rejected as unnecessary complexity — the built-in per-workflow permissions escalation already covers a single-repo, single-job need.

## Decision Outcome

**New workflow, `.github/workflows/daily-pipeline.yml`:**
- Triggers: `schedule` (one daily cron expression, evening UTC — exact minute/hour to be tuned once real run timing is observed, targeting a time that both captures a settled HN front page and lands after same-day arXiv submissions) plus `workflow_dispatch: {}` so it can still be run on demand, matching `ci.yml`'s existing manual-trigger convention.
- `permissions: contents: write` declared on this workflow only.
- Steps: checkout → setup Node → `npm install` → `npm run pipeline` (real HN + arXiv fetch, real Bedrock call, real cost recorded to `stats.jsonl`) → commit + push via a maintained bot-commit action (e.g. `stefanzweifel/git-auto-commit-action`), scoped via its file-pattern option to only `src/data/digest/` and `src/data/stats.jsonl` — never a blanket `git add -A`, so an accidental in-progress code change could never be swept into an automated commit.
- Failure visibility: GitHub's default email-to-repo-owner on scheduled-workflow failure is the V1 mechanism — zero extra work, sufficient for a personal project's stakes. Richer alerting (Slack, auto-filed issue) is an explicit non-goal for this ADR, revisitable later.

**Vercel:** a git-integrated project linked to `sairam0424/daily-dose`, production deploys on push to `main`, PR previews enabled (Vercel's default). Build Command explicitly pinned to `npm run build`. **This half is documented and planned here but not yet executed** — the Vercel MCP connection's token had expired at decision time; execution follows once reconnected (see Confirmation).

## Consequences

**Good:**
- Fully automated daily publish-and-deploy loop — the original "full automated pipeline + hosting" shape asked for at the very start of this project, arriving once the underlying real-LLM-curation and go-ahead gates were actually satisfied, not skipped past them.
- Least-privilege throughout: only the one new workflow gets write access; only digest/stats paths can ever be auto-committed; Vercel never sees the Bedrock credential.
- Safe against duplicate/overlapping runs by construction (ADR 0003's stale-file cleanup), so a manual `workflow_dispatch` run on the same day as the scheduled run cannot corrupt state.
- The PR-for-every-change convention stays intact for all code changes — only generated data gets the documented, narrow exception.

**Bad / accepted tradeoffs:**
- A small, real, **recurring** cost (currently ~$0.02–0.05/run) now happens automatically, indefinitely, until someone disables the schedule — turning an occasional manual spend into an always-on one.
- The commit-strategy exception, while scoped and documented, is still a real precedent: a future contributor must read this ADR to understand why `daily-pipeline.yml`'s commits don't go through a PR when the rest of the repo's convention says they should.
- The deep-research pass could not confirm the reference project's actual deploy mechanism with certainty (Vercel git-integration is a strong inference from absent evidence, not a verified fact) — daily-dose's own Vercel setup is verified directly against this repo's real project settings instead, not assumed to match the reference project's.
- Vercel connection is written but not yet live — a real gap between "decided" and "executed" until the MCP reconnection happens.

## Confirmation

Before trusting the schedule unattended: trigger `daily-pipeline.yml` once via `workflow_dispatch` and confirm (a) it produces a correctly-scoped commit (only digest/stats paths changed), (b) `stats.jsonl` gets a new real entry, (c) no unrelated files are touched. Once the Vercel project is connected: confirm a push to `main` triggers a production deploy, confirm the Vercel project's Build Command is `npm run build` (not auto-detected to something else), and confirm the live URL serves real content matching the latest committed digest.

## More Information

Resolves the "blocked on the user's explicit go-ahead" status for both items tracked in `status.md`'s Upcoming Milestones and `Context.md`'s Roadmap since the walking-skeleton phase. Builds on ADR 0003 (real LLM curation, the stale-file cleanup, and the shared-Bedrock-credential tradeoff this ADR deliberately avoids widening). Does not reopen ADR 0001/0002's ingestion decisions.

## Update — 2026-09-03: richer alerting shipped

The Decision Outcome above named richer alerting (Slack, auto-filed issue) an explicit non-goal for this ADR, "revisitable later." It's been revisited. `daily-pipeline.yml` now has a final step, gated `if: failure()`, using the official `actions/github-script@v7` action, that files a new GitHub Issue (labeled `automated-failure`, title + body containing the failed run's URL — built from `context.serverUrl`/`context.repo`/`context.runId`, never hardcoded — and a timestamp) or, if an open issue with that label already exists, adds a comment to it instead so repeated scheduled failures don't spam duplicate issues.

Auto-filed issue was chosen over a Slack webhook specifically because it needs no new secret — the workflow already has a `GITHUB_TOKEN`; the only change to `permissions:` is adding `issues: write` to this workflow's own block (still scoped to this one workflow only, same least-privilege pattern this ADR already established for `contents: write` — `ci.yml` and every other workflow are untouched). GitHub's default email-to-repo-owner still fires on the same failure; this is additive, not a replacement for it.

This does not reopen or supersede any other part of this ADR — the commit strategy, Vercel setup, and cron schedule are unchanged. See `decisions.md`'s matching 2026-09-03 log entry and `agent_learning.md` for a non-obvious gap found while wiring it in (GitHub's own REST API docs don't explicitly confirm the "creating/labeling an issue with a not-yet-existing label auto-creates it" behavior this design relies on to skip a separate label-creation step) — since resolved: two real, controlled `workflow_dispatch` test failures against an intentionally-broken step on a throwaway branch confirmed the label really does get auto-created and attached, and that a second failure correctly comments on the same issue instead of duplicating it.
