# daily-dose: 300-agent research sweep — phased fix plan

## Context

A 300-agent research sweep (50 targets × 6 lenses) plus targeted follow-up verification produced 40 ranked findings. Every finding below was independently re-verified against real current source, live production, or a live external check before being included here — this is not a pass-through of the raw sweep output. Two claims from the raw sweep turned out to be **false** on direct inspection and are excluded (not "fixed", because there is nothing to fix):

- *"Base64-decoded Bedrock secret bypasses GitHub Actions log redaction"* — no runtime base64-decode of the credential exists anywhere in current code. The documented base64 issue was fixed once, historically, by re-storing the already-decoded value directly in GitHub Secrets — there is no live code path today that could leak a decoded value.
- *"/stats Cache-Control is `public`"* — false as literally stated; `/stats` currently has **no** `Cache-Control` header at all (the one `public, max-age=31536000, immutable` rule in `vercel.json` is scoped to `/_astro/(.*)` only). The real, corrected gap — no explicit cache directive on an authenticated route — is still worth fixing and is included below under its corrected framing.

One finding is explicitly **out of scope for this plan**, not because it's unimportant but because it's a larger, already-tracked infrastructure decision, not a code change: migrating the shared Bedrock IAM key to GitHub OIDC federation. `SECURITY.md` and ADR 0003 already document this as "a documented fast-follow, not yet implemented" — it needs AWS IAM console access and coordination with the sibling Anvilry project, both outside this repo. Not attempted here.

Everything else — 30+ real, verified, actionable findings — is organized into 6 phases below, ordered by risk/value and by dependency (security first, since several other fixes touch the same files; publish-path reliability fixes grouped together since `CLAUDE.md` requires plan mode for that path anyway — this plan satisfies that gate for all of them at once).

## Global Constraints

- Touches `scripts/pipeline.ts`, `src/lib/llmCuration.ts`, `src/lib/costTracking.ts`, `src/lib/digestSchema.ts` — all on `CLAUDE.md`'s gated publish-path list. This plan's approval satisfies that gate for every phase.
- Every fix must be independently testable — add/update a real test in the same phase as the source change, never defer test coverage to "later."
- No fabricated data, no new "fail silently" paths — every reliability fix must still fail loudly or degrade to an already-existing real fallback (placeholder scoring), never a fabricated substitute, per `AGENTS.md`'s non-negotiable.
- Do not attempt the OIDC migration or the Vercel Edge Middleware migration for `/stats` (Phase 5 notes why the latter is deferred) as part of this plan — both are real, valid, larger follow-ups, not sized for this pass.

---

## Phase 1 — Security (small effort, highest value, no dependencies on later phases)

**1a. Digest `url` field accepts `javascript:`/`data:` URIs, unlike its sibling fields**
`src/lib/digestSchema.ts` already defines a scheme-restricted `httpUrlSchema` (used for `image_url`/`favicon_url`) but the primary `url` field still uses bare `z.string().url()`. Change line 18 from `url: z.string().url()` to `url: httpUrlSchema`. This value renders as a real `<a href>` in `StoryCard.astro` and is interpolated into every RSS feed — one-line fix, matches an existing pattern exactly.
Test: add a case to the existing schema test file asserting `DigestItemSchema.safeParse({..., url: "javascript:alert(1)"})` fails.

**1b. Non-constant-time password comparison on `/stats`**
`src/middleware.ts`'s `isValidBasicAuth` does `password === expectedPassword` — a timing side-channel (CWE-208) on the one credentialed route. Fix using `node:crypto`'s `timingSafeEqual` on fixed-length SHA-256 digests (never compare raw variable-length strings with `timingSafeEqual` — it throws on length mismatch, which is itself a real bug to avoid):
```ts
import { createHash, timingSafeEqual } from "node:crypto";

function safeCompare(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a).digest();
  const digestB = createHash("sha256").update(b).digest();
  return timingSafeEqual(digestA, digestB);
}
```
Replace `password === expectedPassword` with `safeCompare(password, expectedPassword)`. Uses `node:crypto` (available since middleware runs in Vercel's Node "classic" mode today — see Phase 5's note on why Edge Middleware migration is deferred separately).
Test: existing middleware tests already cover correct/incorrect password paths — add one asserting `safeCompare` is actually invoked (spy) or, simpler, that two different-length inputs still return `false` without throwing.

**1c. No explicit Cache-Control on the Basic-Auth-gated `/stats` route**
Corrected framing (see Context) — there's no header at all today, not a wrong `public` one. Add an explicit header in `src/middleware.ts`'s response construction (both the 401 and the passed-through 200 path) or via a `vercel.json` rule scoped to `/stats`: `Cache-Control: private, no-store`. Prefer setting it in `middleware.ts` directly (`context.request` → response headers) since `vercel.json` header rules can't distinguish authenticated vs. unauthenticated responses on the same path as cleanly.
Test: assert the response from a test request through the middleware includes `cache-control: private, no-store`.

**1d. RSS `content:encoded` interpolates untrusted `title`/`why_read`/`source` with zero escaping**
`src/lib/rssContent.ts`'s `renderStoryListItem` has a deliberate, correct comment explaining why the *composed HTML string* isn't pre-escaped (would double-escape the structural `<li>`/`<strong>` tags against `@astrojs/rss`'s own single escape pass). That reasoning never covers the *field values* themselves. Add a small HTML-entity-escape helper and apply it only to the untrusted values, not the structural tags:
```ts
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
```
Apply `escapeHtml(title)`, `escapeHtml(why_read)`, `escapeHtml(source)` at the interpolation points in `renderStoryListItem`, leaving the hand-written `<li>`/`<strong>`/`<a href>`/`<p>` tags untouched.
Test: a title containing `<script>` renders as `&lt;script&gt;` in the output, and a title with `&` renders as `&amp;` (not double-escaped to `&amp;amp;`).

**1e. `buildPrompt`'s `<title>` interpolation has no structural escaping (defense-in-depth alongside the existing `promptSafety.ts` instruction-layer mitigation)**
`src/lib/llmCuration.ts`'s `buildPrompt` does `lines.push(\`<title>${item.title}</title>\`)` with no escaping — a title containing a literal `</title>` could confuse the intended structural boundary. `promptSafety.ts`'s `UNTRUSTED_DATA_INSTRUCTION` already tells the model to treat all fetched content as data, not instructions — this fix adds a second, independent layer. Escape the same way as 1d (reuse a shared helper — move `escapeHtml` to a small shared location, e.g. `src/lib/htmlEscape.ts`, imported by both `rssContent.ts` and `llmCuration.ts`, rather than duplicating it).
Test: a title containing `</title><title>` round-trips as literal escaped text in the built prompt string.

**1f. `imageResolution.ts` has no SSRF hardening on redirect targets**
`resolveUrl` only checks `http:`/`https:` scheme; none of the three real fetch calls (ar5iv, HEAD reachability checks, main page GET) validate the resolved host isn't loopback/link-local, and `fetch` follows redirects by default without re-validating each hop. Real risk here is lower than a cloud-VM-with-metadata-service scenario (this runs in a GitHub Actions runner), but still worth closing: add a host check rejecting `127.*`, `10.*`, `172.16-31.*`, `192.168.*`, `169.254.*`, and `localhost` in `resolveUrl`, and re-validate on each redirect by using `redirect: "manual"` and manually following/re-checking each `Location` header instead of relying on `fetch`'s automatic following.
Test: `resolveUrl("http://169.254.169.254/", base)` returns `undefined`; a mocked multi-hop redirect chain where the 2nd hop targets a private IP is rejected even though the 1st hop was a public host.

---

## Phase 2 — Supply-chain & CI hardening (small effort, no code logic changes)

**2a. Enable Dependabot alerts** — currently disabled repo-wide (confirmed via `gh api repos/sairam0424/daily-dose/vulnerability-alerts` → 404 "disabled"). This is why the path-to-regexp ReDoS (2b) went unnoticed. Fix: `gh api -X PUT repos/sairam0424/daily-dose/vulnerability-alerts` (a real, low-risk repo-settings change — not a code change, do this directly, not as a PR).

**2b. `path-to-regexp` ReDoS (3 HIGH findings, 1 underlying issue) has a real fix today** — confirmed `npm ls path-to-regexp` shows it nested 3 levels deep (`@astrojs/vercel` → `@vercel/routing-utils@6.5.0` → `path-to-regexp@6.1.0`), and no direct upstream release fixes it. Add to `package.json`:
```json
"overrides": {
  "path-to-regexp": "^6.3.0"
}
```
`^6.3.0` stays within the same major `@vercel/routing-utils@6.5.0` already expects, so it's very likely compatible without needing npm audit's own suggested breaking downgrade to `@astrojs/vercel@8.0.4` (which would reopen the critical AVIF RCE closed in PR #112). Run `npm install`, then `npm audit` (expect 0 findings), then the full build+test suite to confirm no breakage from the forced version.

**2c. Both credentialed workflows use `npm install` instead of `npm ci`** — swap in `.github/workflows/ci.yml` and `.github/workflows/daily-pipeline.yml`. `npm ci` enforces the exact locked tree instead of allowing silent re-resolution.

**2d. GitHub Actions pinned to mutable tags, not SHA** — `ci.yml`/`daily-pipeline.yml` use `actions/checkout@v4`, `actions/setup-node@v4`, `actions/github-script@v7` while `git-auto-commit-action` is already SHA-pinned with a comment explaining exactly why. SHA-pin the remaining 3, each with a version comment matching the existing pattern (resolve each tag's current commit SHA via `gh api repos/<owner>/<action-repo>/git/refs/tags/<tag>`).

**2e. `daily-pipeline.yml`'s checkout persists the elevated token through `npm install`** — add `persist-credentials: false` to its checkout step; `git-auto-commit-action`'s own token input already handles the later push.

**2f. `daily-pipeline.yml` has no concurrency guard** — a manual `workflow_dispatch` overlapping the real schedule double-bills the paid Bedrock call and races on the git push (already hit once per the workflow's own comments). Add:
```yaml
concurrency:
  group: daily-pipeline
  cancel-in-progress: false
```

---

## Phase 3 — Publish-path reliability (touches the CLAUDE.md-gated files this plan's approval covers)

**3a. Bedrock fallback catch is too narrow** — `llmCuration.ts`'s retry condition only checks `NotFoundError || BadRequestError || SyntaxError`. This account's Bedrock role is already known to hard-deny Opus (`PermissionDeniedError`, a 403) — not caught, so it aborts the whole run instead of falling through to Haiku. Broaden to also catch `PermissionDeniedError`, `RateLimitError`, and `InternalServerError` (all real `@anthropic-ai/sdk` error classes for retryable/skippable conditions), matching ADR 0005's own stated "never hard-fails on a single model" intent.
Test: mock a `PermissionDeniedError` from the first model, assert the chain advances to the next model instead of throwing (mirrors the existing `NotFoundError` fallback test).

**3b. `scoreItemsWithLLM` is called unguarded in `main()` — total LLM failure aborts the whole day's digest, even though real HN/arXiv/GitHub/Dev.to data already fetched successfully.** Wrap the call site in `scripts/pipeline.ts` in a try/catch; on failure, `console.error` loudly and fall back to the existing per-item placeholder scorers (`scoreStoryPlaceholder` etc. — already imported, already used for the "LLM omitted this one item" case) applied to the whole batch, rather than aborting. This is a real fallback that already exists in the codebase for the partial case — extending it to the total-failure case, not inventing a new fabricated path.
Test: mock `scoreItemsWithLLM` to reject; assert `main()` still writes real digest files using placeholder scores, with a loud console error logged.

**3c. Retry loop silently discards billed token usage from failed attempts** — on a `SyntaxError`-triggered retry, that attempt's real `message.usage` is discarded; only the final successful attempt's tokens reach `stats.jsonl`, undercounting real spend. Accumulate `inputTokens`/`outputTokens` across every attempt (success or fail) in `scoreItemsWithLLM`, summing before returning.
Test: mock 2 failed attempts (each with real, distinct usage figures) followed by 1 success; assert the returned `inputTokens`/`outputTokens` sum all 3, not just the last.

**3d. The 4 source fetches have no timeout, unlike `imageResolution.ts`'s existing `AbortController` pattern** — add the same `FETCH_TIMEOUT_MS` + `AbortController` pattern (reuse the exact shape already in `imageResolution.ts`) to `fetchHnFrontPage`, `fetchArxivPapers`, `fetchGithubTrendingRepos`, and each of `fetchDevtoArticles`'s calls. Also add `timeout-minutes: 15` to `daily-pipeline.yml`'s job as a second, workflow-level backstop.
Test: mock a `fetch` that never resolves; assert the function rejects within the timeout window (use fake timers).

**3e. `fetchWithRetry` amplifies rather than absorbs failures for GitHub and Dev.to** — `fetchGithubTrendingRepos` never reads GitHub's rate-limit headers before a retry could re-trigger the same limit; `fetchDevtoArticles` retries its whole list+N-detail-fetch batch as one unit on any single article's failure. Fix: (a) have `fetchGithubTrendingRepos` throw a distinguishable error when `response.status === 403` with `x-ratelimit-remaining: 0`, and have `fetchWithRetry` skip retrying (not amplifying) that specific case; (b) refactor `fetchDevtoArticles` to retry each per-article detail fetch independently (wrap just the per-article `fetch` in its own `fetchWithRetry` call, not the whole batch function).
Test: a rate-limited GitHub response is not retried 3x; a single failing Dev.to detail fetch (out of N) doesn't re-issue the other N-1 successful requests.

**3f. `digestGrouping.ts`'s sort has no tiebreaker** — real committed data already has ties (3 of 4 checked dates), making the "led by {title}" claim on archive pages a file-order artifact on tied days. Add a deterministic secondary key: `(a, b) => b.data.interest_score - a.data.interest_score || a.id.localeCompare(b.id)`.
Test: two fixture entries with identical `interest_score` sort in a stable, deterministic order across repeated calls.

**3g. `quoteLeadTitle` truncates via UTF-16 code-unit `.slice()`, risking a lone surrogate** — not yet triggered on real data, but a real, waiting-to-happen correctness bug. Use `Array.from(stripped)` (iterates by code point) before slicing, or a simple grapheme-safe truncation helper.
Test: a title containing an astral-plane emoji positioned exactly at the 48-character boundary truncates without producing a lone surrogate (assert the result round-trips through `JSON.stringify`/`encodeURIComponent` without a replacement character).

**3h. arXiv's ar5iv figure-fallback is dead** — live-confirmed 307 redirect to the plain abstract page for current 2026 arXiv IDs. Point `AR5IV_BASE_URL` at `https://arxiv.org/html/` instead (arXiv's own native HTML rendering, which has superseded ar5iv and has the same figure markup `extractFirstFigureImage` looks for).
Test: update the existing ar5iv-fetch test's mocked URL assertion to the new host; add a live-shaped fixture (real HTML structure from `arxiv.org/html/`) confirming `extractFirstFigureImage` still matches it.

**3i. Cost-anomaly flag has no delivery path** — `recordAndCheckCost`'s `flaggedAnomalous: true` only produces a `console.warn`; the workflow's only alert step is `if: failure()`, which never fires on a successful-but-anomalous run. Extend `daily-pipeline.yml` with a step after the pipeline run that greps the just-appended `stats.jsonl` line for `"flaggedAnomalous":true` and, if found, reuses the existing GH-issue-filing step's dedup-by-label pattern (or simply sets a job output consumed by an `if:` condition on that same step, changing its trigger from `if: failure()` to `if: failure() || steps.<id>.outputs.anomalous == 'true'`).
Test: not unit-testable (workflow YAML) — verify via a real `workflow_dispatch` manual trigger after merging, checking the Issue gets filed/commented when a synthetic anomalous cost is injected (or defer to a live check post-merge, documented in the verification section).

**3j. `us.` regional model prefix pays a documented ~9% pricing premium over `global.`** — already quantified in ADR 0005 as a known, evaluated-but-unapplied option, not an oversight — but still a real, actionable line-item now that this plan is doing a cost pass. Switch `MODEL_CHAIN`'s 4 entries from `us.` to `global.` prefix. **Requires a quick manual check first**: confirm the AWS Bedrock IAM role's cross-region inference profile permissions cover `global.*` model IDs before merging (the ADR notes this needs the same kind of permission this account already had issues with for Opus) — do this check before writing the code change, not after.
Test: existing `MODEL_CHAIN`-referencing tests only need their literal string assertions updated to the new prefix; no logic changes.

---

## Phase 4 — Content correctness & SEO (medium effort)

**4a. Archive date page's `<title>` stays generic despite a real per-date topical string already computed in the same file** — `leadTitleQuoted` is already used in the `description` prop and visible tagline but never the `<title>` prop. Fold it in: `title={\`The Daily Dose — ${date} — led by ${leadTitleQuoted}\`}` (respect Task 9's earlier 60-char SERP-safe ceiling from the prior SEO-fixes plan — may need `leadTitleQuoted`'s own length re-checked against the shorter title budget, not just the longer description budget).
Test: update/extend `tests/titleLength.test.ts`'s pattern to also cover this dynamic per-date title, asserting it stays ≤60 chars for a real long lead title.

**4b. The content-moderation `exclude` flag's actual enforcement has zero test coverage** — only the LLM-response-parsing layer is tested (`tests/llmCuration.test.ts`), never the `continue` in `pipeline.ts`'s per-source loops that actually skips a flagged item before writing. Add a test that imports and exercises the real skip logic — either by extracting the per-source loop's exclude-check into a small testable pure function, or (matching this file's existing "main() isn't otherwise unit-tested" convention) adding one more source-text regression check confirming the exact `if (fromLlm?.exclude) { ... continue; }` pattern still appears once per source loop, mirroring the existing `analysis` source-text tests.

**4c. RSS feeds are missing `atom:link rel="self"`** (the `<description>` half of this finding was checked and found already present — no fix needed there). Add a `customData` field to both `src/pages/rss.xml.ts`'s and `src/lib/perSourceRss.ts`'s `rss()` calls:
```ts
customData: `<atom:link href="${new URL(context.request.url).href}" rel="self" type="application/rss+xml" />`,
```
(per-source routes need their own correct self-URL, not the combined feed's).
Test: assert the built feed's XML contains `rel="self"` pointing at its own correct URL, for both the combined and one per-source feed.

**4d. The 4 per-source RSS test files lack the entity-expansion-ceiling regression test the combined feed already has** — same underlying `renderDayContent()`/`rss()` machinery is shared via `perSourceRss.ts`, confirmed. Copy `tests/rss-feed.test.ts`'s `RSS_PARSER_OPTIONS`/entity-count test pattern into the 4 per-source test files (test-only change, no source fix needed since the shared code is already the same).

**4e. `llms.txt` calls `/stats` "public" while it's genuinely Basic-Auth-gated** — drop that line from `public/llms.txt`, matching the same deliberate exclusion `/stats` already has from the sitemap and robots.txt.
Test: extend `tests/llmsTxt.test.ts` with a regression assertion that `/stats` is never mentioned, mirroring the existing `/methodology` exclusion test.

**4f. `methodology.astro` publicly discloses exact cost-anomaly-evasion thresholds — explicitly excluded, by decision.** `MAX_REASONABLE_ITEMS`, `ANOMALY_MULTIPLIER`, `SEED_BASELINE_USD`, `MIN_HISTORY_FOR_ANOMALY_CHECK` are rendered as live numbers on an unauthenticated (if unlinked) page. Confirmed with the user: leave as-is. The whole point of `/methodology` is radical transparency about the real rubric, and the risk (slow-drip cost inflation past a detection threshold) is a minor nuisance, not severe exposure. No fix in this plan.

---

## Phase 5 — Performance (medium effort)

**5a. Sharp's ~18MB native binary is bundled into the deployed function despite zero `astro:assets`/`<Image>` usage anywhere** — measured exactly: `libvips-cpp.8.18.6.dylib` = 18,164,536 bytes, 86% of the whole function bundle. Add a noop image service to `astro.config.mjs`:
```js
image: { service: { entrypoint: 'astro/assets/services/noop' } },
```
Test: rebuild and re-measure `.vercel/output/functions/_render.func`'s size — confirm the `@img`/sharp binaries are gone and total size drops accordingly. Not a unit test — a real build-and-measure verification step.

**5b. Lead-story hero image is unconditionally `loading="lazy"`, delaying the page's own LCP element** — `StoryCard.astro` already computes `index` and uses it for the `lead-story` class; extend it: `loading={index === 0 ? "eager" : "lazy"}` plus `fetchpriority={index === 0 ? "high" : undefined}` on the `.story-image` tag only (leave the small decorative favicon untouched).
Test: static-source regex test (matching this file's existing test convention) asserting the lead-story branch renders `loading="eager"` and non-lead renders `loading="lazy"`.

**5c. Self-hosted font files serve `max-age=0`** — `vercel.json`'s immutable-cache rule only matches `/_astro/(.*)`, never the 10 committed, unhashed `/fonts/*.woff2` files. Add a second rule:
```json
{ "source": "/fonts/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] }
```
Test: extend `tests/securityHeaders.test.ts`'s pattern (parses `vercel.json` directly) to assert this new rule exists.

**Deferred, not in this plan: moving `/stats`'s Basic Auth to real Vercel Edge Middleware** (`middlewareMode: 'edge'`). Confirmed real and currently unused (`vercel()` is called with no options today, resolving to "classic" mode), but switching runtime modes is a bigger change with its own testing burden (edge runtime has a different, more restricted API surface than Node — needs re-verification that `node:crypto`'s `timingSafeEqual`/`createHash` from Phase 1b still work there, or a Web-Crypto-API rewrite). Worth a dedicated follow-up, not bundled into this pass.

---

## Phase 6 — Accessibility (medium effort)

**6a. No automated accessibility CI gate** — add `axe-core` as a devDependency and a CI step that runs it against the real built HTML (`dist/client/*.html` or a subset of representative pages: homepage, an archive date page, methodology, privacy) after `npm run build`, failing the build on any new violation.

**6b. `--ink-faint` fails WCAG AA contrast in all 3 checked theme/skin combinations** — measured: light Newspaper 3.72:1, dark Newspaper 2.93:1, dev skin 3.69:1, all against the 4.5:1 normal-text minimum (all 3 real usages — `.masthead-utility`, `.site-footer-links`, `.site-footer-copyright` — are small text, so 4.5:1 applies, not the relaxed 3:1 large-text bar). Darken/lighten each `--ink-faint` value in `Layout.astro` per theme until each pairing clears 4.5:1 against its actual background (`--bg-surface` for Newspaper light/dark, `--bg-page` for dev skin), preserving each skin's existing hue.

**6c. No skip-to-main-content link anywhere** — add a visually-hidden-until-focused skip link as the first focusable element in `Layout.astro`, targeting `<main>` (verify every page template has a literal `<main>` landmark — confirmed true for the ones read this session).

**6d. `#theme-toggle` never sets `aria-pressed`, unlike its sibling skin-toggle buttons in the same component** — `PreferenceControls.astro`'s `syncControls()` already sets `aria-pressed` on `#skin-toggle-dev`/`#skin-toggle-newspaper` dynamically; extend the same function to also set it on `#theme-toggle` based on the current theme state, plus a static default in the markup matching the other two buttons' pattern.
Test: extend the existing `PreferenceControls` test/regex pattern to assert `#theme-toggle` sets `aria-pressed` both in initial markup and via `syncControls()`, mirroring the assertions that already exist for the skin-toggle buttons.

---

## Verification (end-to-end, per phase and overall)

- After each phase: `npm test` (full suite) + `npm run build`, exactly as every prior fix this session has done — no phase merges without both green.
- Phase 1 (security): after implementing, re-run the same PoC technique used for the earlier JSON-LD XSS fix (a temporary fixture item with a malicious title, real build, confirm the payload renders inert) — applies to 1d and 1e specifically.
- Phase 3 (publish-path): a real, disclosed live `npm run pipeline --output /tmp/... --limit 3` dry run after all of Phase 3 lands, discarding output and reverting `stats.jsonl`'s appended line afterward — matching this session's established convention for verifying publish-path changes against real data, not just mocks.
- Phase 5a (Sharp removal): requires an actual before/after build-size measurement, not just a passing test — do this as a real verification step, documented with the real byte counts.
- Phase 2a (Dependabot) and 3j's IAM permission check: both are real, live checks outside the git diff — do these directly (gh api / a manual Bedrock permission check) rather than through a PR.
- Before promoting any phase to `main`: same adversarial-audit pattern already used for PR #111/#112/#113 — a dedicated re-verification pass (worktree diff review + a security-focused re-check) before merge, given Phase 1 and Phase 3 in particular touch security- and cost-sensitive code.
