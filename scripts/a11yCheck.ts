/**
 * scripts/a11yCheck.ts
 *
 * Accessibility CI gate (docs/superpowers/plans/2026-09-10-research-sweep-
 * fixes.md, item 6a): runs axe-core against a representative subset of the
 * real built static HTML - homepage, one archive date page, methodology,
 * privacy - after `npm run build`, failing loudly on any real violation.
 *
 * Each page is checked in its own child process (see a11yCheckWorker.ts) to
 * avoid axe-core's module-load-time binding to a single global `window`/
 * `document` leaking state between pages.
 *
 * Run directly: npx tsx scripts/a11yCheck.ts
 * (requires `npm run build` to have already produced dist/client/)
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const DIST_CLIENT = resolve(import.meta.dirname, "..", "dist", "client");
const WORKER_PATH = resolve(import.meta.dirname, "a11yCheckWorker.ts");

interface PageCheck {
  name: string;
  relPath: string;
}

interface WorkerViolationNode {
  html: string;
  failureSummary?: string;
}

interface WorkerViolation {
  id: string;
  impact: string | null;
  help: string;
  helpUrl: string;
  nodes: WorkerViolationNode[];
}

interface WorkerResult {
  violations: WorkerViolation[];
}

// Real committed digest dates change over time (the daily cron adds new
// ones, old ones may get pruned) - find whichever date is actually latest
// right now rather than hardcoding one, matching the same pattern already
// used by tests/build-output.test.ts's findLatestDateJsonFiles().
function findLatestArchiveDate(): string {
  const archiveDir = join(DIST_CLIENT, "archive");
  const dateDirs = readdirSync(archiveDir)
    .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry))
    .filter((entry) => statSync(join(archiveDir, entry)).isDirectory())
    .sort();
  const latest = dateDirs.at(-1);
  if (!latest) {
    throw new Error(
      `expected at least one committed digest date under ${archiveDir}`,
    );
  }
  return latest;
}

function representativePages(): PageCheck[] {
  const archiveDate = findLatestArchiveDate();
  return [
    { name: "homepage", relPath: "index.html" },
    {
      name: `archive date (${archiveDate})`,
      relPath: join("archive", archiveDate, "index.html"),
    },
    { name: "methodology", relPath: join("methodology", "index.html") },
    { name: "privacy", relPath: join("privacy", "index.html") },
  ];
}

function checkPage(page: PageCheck): WorkerResult {
  const fullPath = join(DIST_CLIENT, page.relPath);
  if (!existsSync(fullPath)) {
    throw new Error(
      `${fullPath} not found - run \`npm run build\` first, then re-run this check.`,
    );
  }
  const output = execFileSync(
    process.execPath,
    ["--import", "tsx", WORKER_PATH, fullPath],
    { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 },
  );
  return JSON.parse(output) as WorkerResult;
}

function reportViolations(
  page: PageCheck,
  violations: WorkerViolation[],
): void {
  for (const violation of violations) {
    console.error(
      `  [${violation.impact ?? "unknown"}] ${violation.id}: ${violation.help}`,
    );
    console.error(`    ${violation.helpUrl}`);
    for (const node of violation.nodes) {
      console.error(`    - ${node.html}`);
      if (node.failureSummary) {
        console.error(
          `      ${node.failureSummary.replace(/\n/g, "\n      ")}`,
        );
      }
    }
  }
}

function main(): void {
  const pages = representativePages();
  let totalViolations = 0;

  for (const page of pages) {
    console.log(`\nChecking ${page.name} (${page.relPath})...`);
    const result = checkPage(page);
    if (result.violations.length === 0) {
      console.log("  OK - no violations");
      continue;
    }
    totalViolations += result.violations.length;
    reportViolations(page, result.violations);
  }

  if (totalViolations > 0) {
    console.error(
      `\n${totalViolations} accessibility violation(s) found across ${pages.length} checked page(s).`,
    );
    process.exit(1);
  }

  console.log(
    `\nAll ${pages.length} checked pages passed the accessibility gate.`,
  );
}

main();
