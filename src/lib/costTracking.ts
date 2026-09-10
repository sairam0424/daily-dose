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

/** Global cross-Region inference-profile tier, per-million-token USD -
 * MODEL_CHAIN (llmCuration.ts) switched from "us."-prefixed regional
 * profiles to "global."-prefixed ones (see that file's own comment: a
 * real, disclosed Bedrock call confirmed the IAM role permits it for
 * Sonnet 5/Sonnet 4.6/Haiku 4.5 - Opus remains explicitly IAM-denied
 * either way, unrelated to this prefix). Confirmed directly against
 * Anthropic's own pricing page (platform.claude.com/docs/en/about-claude/
 * pricing, fetched 2026-09-10): "Regional and multi-region endpoints
 * include a 10% premium over global endpoints" - i.e. the table below is
 * each model's real, standard/global rate, and the old "us."-prefixed
 * keys' dollar figures already matched this exactly for all 3 non-Sonnet-5
 * models; only Sonnet 5's old entry ($2.20/$11.00) was the 1.1x-premium
 * regional rate and has been corrected to its real global rate here. */
export const PRICING_PER_MILLION_TOKENS: Record<
  string,
  { input: number; output: number }
> = {
  "global.anthropic.claude-sonnet-5": { input: 2.0, output: 10.0 },
  "global.anthropic.claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "global.anthropic.claude-opus-4-6-v1": { input: 5.0, output: 25.0 },
  "global.anthropic.claude-haiku-4-5-20251001-v1:0": {
    input: 1.0,
    output: 5.0,
  },
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
export const ANOMALY_MULTIPLIER = 5;

/** Used only when there is no history yet (first few real runs) - a rough
 * seed so the very first run cannot itself be flagged as "anomalous"
 * against an empty baseline. Deliberately generous (well above the actual
 * expected mid-case of a few cents) since under-flagging on day one is far
 * less costly than a false-positive alarm with zero history to judge it against. */
export const SEED_BASELINE_USD = 0.05;

/** Minimum history length before the anomaly check activates at all - below
 * this, "average" is too noisy to be meaningful and the check is skipped
 * entirely (real cost is still recorded either way). */
export const MIN_HISTORY_FOR_ANOMALY_CHECK = 3;

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
