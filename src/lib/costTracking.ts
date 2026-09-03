/**
 * src/lib/costTracking.ts
 *
 * Tracks real LLM token usage and dollar cost per pipeline run, and
 * implements a DYNAMIC budget check - explicitly not a fixed dollar
 * ceiling. At this project's real volume (~10 items/day), a guessed fixed
 * number is either too loose to mean anything or too tight to survive
 * normal variance (a longer arXiv abstract day, one extra item). Instead,
 * a run is flagged only if its cost is anomalously high relative to the
 * trailing 7-day average, so the threshold adapts to real observed usage
 * rather than a guess made before any real data existed.
 *
 * Pricing table verified against real AWS Bedrock documentation during this
 * project's Bedrock research pass - see docs/adr/0003-wire-real-bedrock-curation.md.
 */

import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";

/** us-east-1, on-demand, Standard tier, per-million-token USD. Haiku's
 * figure is Anthropic's long-standing published Haiku-tier price point;
 * Sonnet 4.6 and Opus were confirmed directly from AWS's own blog posts
 * during research - see docs/adr/0003-wire-real-bedrock-curation.md for
 * the exact citations.
 *
 * Claude Sonnet 5's figure is confirmed as of 2026-09-03 - see
 * docs/adr/0005-add-sonnet-5-as-first-choice-model.md's Update section for
 * the full research. Two independent real sources: Anthropic's own pricing
 * page (platform.claude.com/docs/en/about-claude/pricing) states the
 * standard direct-API rate is $2/$10 per million input/output tokens; AWS's
 * own public Price List Bulk API (pricing.us-east-1.amazonaws.com/offers/
 * v1.0/aws/AmazonBedrockFoundationModels/.../us-east-1/index.json, no auth
 * required) lists "Claude Sonnet 5 (Amazon Bedrock Edition)" at $2.20/$11.00
 * per million tokens for the In-Region/Geo (Standard) tier - the tier that
 * applies to this project's exact model ID, "us.anthropic.claude-sonnet-5"
 * (a US-region-prefixed cross-region profile, not "global.anthropic.claude-
 * sonnet-5", which bills at the cheaper $2.00/$10.00 Global cross-Region
 * tier instead). */
const PRICING_PER_MILLION_TOKENS: Record<
  string,
  { input: number; output: number }
> = {
  "us.anthropic.claude-sonnet-5": { input: 2.2, output: 11.0 },
  "us.anthropic.claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "us.anthropic.claude-opus-4-6-v1": { input: 5.0, output: 25.0 },
  "us.anthropic.claude-haiku-4-5-20251001-v1:0": { input: 1.0, output: 5.0 },
};

export function calculateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = PRICING_PER_MILLION_TOKENS[model];
  if (!pricing) {
    throw new Error(
      `No pricing entry for model "${model}" - add one to PRICING_PER_MILLION_TOKENS in costTracking.ts before using it for real scoring.`,
    );
  }
  return (
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output
  );
}

export interface StatsEntry {
  date: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  itemCount: number;
  flaggedAnomalous: boolean;
}

const STATS_FILE_RELATIVE = "src/data/stats.jsonl";

function statsFilePath(): string {
  return resolve(process.cwd(), STATS_FILE_RELATIVE);
}

async function readHistoricalCosts(excludeDate: string): Promise<number[]> {
  try {
    const content = await readFile(statsFilePath(), "utf-8");
    return content
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as StatsEntry)
      .filter((entry) => entry.date !== excludeDate)
      .slice(-7)
      .map((entry) => entry.costUsd);
  } catch {
    return []; // no history file yet - first real run
  }
}

/** How many times the trailing average a day's cost must exceed to be
 * flagged. Chosen to catch a genuine bug (e.g. 5x more items than normal,
 * or a runaway max_tokens) while tolerating ordinary day-to-day variance in
 * abstract/title length. */
const ANOMALY_MULTIPLIER = 5;

/** Used only when there is no history yet (first few real runs) - a rough
 * seed so the very first run cannot itself be flagged as "anomalous"
 * against an empty baseline. Deliberately generous (well above the actual
 * expected mid-case of a few cents) since under-flagging on day one is far
 * less costly than a false-positive alarm with zero history to judge it against. */
const SEED_BASELINE_USD = 0.05;

/** Minimum history length before the anomaly check activates at all - below
 * this, "average" is too noisy to be meaningful and the check is skipped
 * entirely (real cost is still recorded either way). */
const MIN_HISTORY_FOR_ANOMALY_CHECK = 3;

/**
 * Records today's real LLM cost to src/data/stats.jsonl (committed, not
 * gitignored - this is real historical data, same treatment as the digest
 * content itself) and returns the entry, including whether it was flagged
 * as anomalous relative to the trailing 7-day average. This is a WARNING
 * mechanism (the single batched call has already completed by the time
 * cost is known - there is no way to abort a call already in flight), not
 * a preventive block. The real preventive safeguard is llmCuration.ts's
 * MAX_REASONABLE_ITEMS pre-flight check, which runs before any call is made.
 */
export async function recordAndCheckCost(
  date: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  itemCount: number,
): Promise<StatsEntry> {
  const costUsd = calculateCostUsd(model, inputTokens, outputTokens);
  const history = await readHistoricalCosts(date);

  const baseline =
    history.length > 0
      ? history.reduce((sum, c) => sum + c, 0) / history.length
      : SEED_BASELINE_USD;

  const flaggedAnomalous =
    history.length >= MIN_HISTORY_FOR_ANOMALY_CHECK &&
    costUsd > baseline * ANOMALY_MULTIPLIER;

  const entry: StatsEntry = {
    date,
    model,
    inputTokens,
    outputTokens,
    costUsd: Math.round(costUsd * 1_000_000) / 1_000_000,
    itemCount,
    flaggedAnomalous,
  };

  await appendFile(statsFilePath(), JSON.stringify(entry) + "\n", "utf-8");

  if (flaggedAnomalous) {
    console.warn(
      `[cost-anomaly] Today's LLM cost ($${entry.costUsd.toFixed(4)}) is more than ${ANOMALY_MULTIPLIER}x the trailing ${history.length}-day average ($${baseline.toFixed(4)}). This may indicate a bug (more items than expected, an unusually large prompt, or a retry loop) rather than a real problem - review before the next run.`,
    );
  }

  return entry;
}
