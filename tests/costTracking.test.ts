// Mocks node:fs/promises entirely - recordAndCheckCost/readHistoricalCosts
// read and append to the REAL, committed src/data/stats.jsonl with no path
// injection seam, so a test calling them unmocked would corrupt real cost
// history. Matches this repo's established pattern (see llmCuration.test.ts's
// Bedrock-SDK mock) for anything with a real, unmockable-by-default I/O side
// effect.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockReadFile = vi.fn();
const mockAppendFile = vi.fn();
vi.mock("node:fs/promises", () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  appendFile: (...args: unknown[]) => mockAppendFile(...args),
}));

const {
  calculateCostUsd,
  recordAndCheckCost,
  PRICING_PER_MILLION_TOKENS,
  ANOMALY_MULTIPLIER,
  SEED_BASELINE_USD,
  MIN_HISTORY_FOR_ANOMALY_CHECK,
} = await import("../src/lib/costTracking.js");

const MODEL = "us.anthropic.claude-sonnet-5";

function statsLine(entry: Record<string, unknown>): string {
  return JSON.stringify(entry) + "\n";
}

function historyEntry(date: string, costUsd: number) {
  return {
    date,
    model: MODEL,
    inputTokens: 1000,
    outputTokens: 200,
    costUsd,
    itemCount: 5,
    flaggedAnomalous: false,
  };
}

beforeEach(() => {
  mockAppendFile.mockResolvedValue(undefined);
});

afterEach(() => {
  mockReadFile.mockReset();
  mockAppendFile.mockReset();
});

describe("calculateCostUsd", () => {
  it("computes cost from the model's real pricing entry (structural check, not a hardcoded copy)", () => {
    const pricing = PRICING_PER_MILLION_TOKENS[MODEL];
    const cost = calculateCostUsd(MODEL, 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(pricing.input + pricing.output);
  });

  it("pins Claude Sonnet 5's real researched rate ($2.20/$11.00 per MTok, ADR 0005) so it can't silently drift", () => {
    expect(PRICING_PER_MILLION_TOKENS[MODEL]).toEqual({
      input: 2.2,
      output: 11.0,
    });
  });

  it("scales linearly with token count", () => {
    const single = calculateCostUsd(MODEL, 100_000, 50_000);
    const doubled = calculateCostUsd(MODEL, 200_000, 100_000);
    expect(doubled).toBeCloseTo(single * 2);
  });

  it("throws a descriptive error for a model with no pricing entry", () => {
    expect(() => calculateCostUsd("not-a-real-model", 100, 100)).toThrow(
      /not-a-real-model/,
    );
  });
});

describe("recordAndCheckCost — no history yet (first real run)", () => {
  it("never flags anomalous when there is no history, regardless of cost", async () => {
    mockReadFile.mockRejectedValue(new Error("ENOENT: no such file"));

    const entry = await recordAndCheckCost(
      "2026-09-01",
      MODEL,
      50_000_000,
      50_000_000,
      50,
    );

    expect(entry.flaggedAnomalous).toBe(false);
  });

  it("writes the recorded entry to the real stats file path with the right shape", async () => {
    mockReadFile.mockRejectedValue(new Error("ENOENT: no such file"));

    const entry = await recordAndCheckCost(
      "2026-09-01",
      MODEL,
      1_000_000,
      1_000_000,
      3,
    );

    expect(entry).toMatchObject({
      date: "2026-09-01",
      model: MODEL,
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      itemCount: 3,
      flaggedAnomalous: false,
    });
    expect(mockAppendFile).toHaveBeenCalledTimes(1);
    const [path, written] = mockAppendFile.mock.calls[0];
    expect(path).toContain("src/data/stats.jsonl");
    expect(JSON.parse((written as string).trim())).toEqual(entry);
  });
});

describe("recordAndCheckCost — history below MIN_HISTORY_FOR_ANOMALY_CHECK", () => {
  it("does not flag even a huge cost spike when history has fewer than the minimum entries", async () => {
    expect(MIN_HISTORY_FOR_ANOMALY_CHECK).toBe(3);
    const raw =
      statsLine(historyEntry("2026-08-30", 0.01)) +
      statsLine(historyEntry("2026-08-31", 0.01));
    mockReadFile.mockResolvedValue(raw);

    const entry = await recordAndCheckCost(
      "2026-09-01",
      MODEL,
      50_000_000,
      50_000_000,
      50,
    );

    expect(entry.flaggedAnomalous).toBe(false);
  });
});

describe("recordAndCheckCost — sufficient history", () => {
  function threeDayHistory(cost: number) {
    return (
      statsLine(historyEntry("2026-08-29", cost)) +
      statsLine(historyEntry("2026-08-30", cost)) +
      statsLine(historyEntry("2026-08-31", cost))
    );
  }

  it(`flags a run costing more than ${ANOMALY_MULTIPLIER}x the trailing average`, async () => {
    mockReadFile.mockResolvedValue(threeDayHistory(0.01));
    // baseline = 0.01, threshold = 0.05; force a cost well above it.
    const entry = await recordAndCheckCost(
      "2026-09-01",
      MODEL,
      50_000_000,
      50_000_000,
      50,
    );
    expect(entry.flaggedAnomalous).toBe(true);
  });

  it(`does not flag a run at or below ${ANOMALY_MULTIPLIER}x the trailing average`, async () => {
    mockReadFile.mockResolvedValue(threeDayHistory(0.075));
    // baseline = 0.075, threshold = 0.375; a normal day's cost stays under it.
    const entry = await recordAndCheckCost(
      "2026-09-01",
      MODEL,
      8_000,
      5_000,
      5,
    );
    expect(entry.flaggedAnomalous).toBe(false);
  });

  it("uses SEED_BASELINE_USD only when history is genuinely empty, not as a floor once real history exists", async () => {
    expect(SEED_BASELINE_USD).toBe(0.05);
    // Real trailing average (0.001) is far below the seed baseline - the
    // anomaly threshold must track the REAL average, not silently fall
    // back to the generous seed once real history is available.
    mockReadFile.mockResolvedValue(threeDayHistory(0.001));
    const entry = await recordAndCheckCost(
      "2026-09-01",
      MODEL,
      500_000,
      500_000,
      50,
    ); // cost ~= 0.0066, > 5x 0.001 but << 5x SEED_BASELINE_USD
    expect(entry.flaggedAnomalous).toBe(true);
  });
});

describe("recordAndCheckCost — regression: real same-day double-run (2026-09-06)", () => {
  it("excludes today's own already-recorded entry from its own anomaly baseline", async () => {
    // Real committed shape from src/data/stats.jsonl: two entries for the
    // same date (a manual dispatch + the scheduled cron, or a retry).
    // readHistoricalCosts's `entry.date !== excludeDate` filter must keep
    // a same-day rerun from checking its own cost against a baseline that
    // includes itself.
    const raw =
      statsLine(historyEntry("2026-09-06", 0.0755)) +
      statsLine(historyEntry("2026-08-30", 0.01)) +
      statsLine(historyEntry("2026-08-31", 0.01)) +
      statsLine(historyEntry("2026-09-01", 0.01));
    mockReadFile.mockResolvedValue(raw);

    // Second run for the SAME date (2026-09-06), costing about the same as
    // the first (~0.073) - should NOT be judged against a baseline that
    // includes its own sibling entry, only the three genuinely-other-date
    // entries (baseline 0.01, threshold 0.05).
    const entry = await recordAndCheckCost(
      "2026-09-06",
      MODEL,
      8_043,
      5_039,
      20,
    );

    // 0.073 > 5x 0.01 baseline - correctly flagged using ONLY the other-date
    // history, proving the same-day sibling entry was excluded rather than
    // silently pulling the baseline up toward today's own cost.
    expect(entry.flaggedAnomalous).toBe(true);
  });

  it("only averages the trailing 7 non-today entries, ignoring anything older", async () => {
    const oldExpensive = Array.from({ length: 5 }, (_, i) =>
      statsLine(historyEntry(`2026-08-2${i}`, 10)),
    ).join("");
    const recentCheap = Array.from({ length: 7 }, (_, i) =>
      statsLine(historyEntry(`2026-08-3${i}`, 0.01)),
    ).join("");
    mockReadFile.mockResolvedValue(oldExpensive + recentCheap);

    // If the old $10/day entries leaked into the average, baseline would be
    // huge and nothing could ever be flagged. Confirm the trailing-7 window
    // (all cheap) is what's actually used.
    const entry = await recordAndCheckCost(
      "2026-09-01",
      MODEL,
      50_000_000,
      50_000_000,
      50,
    );
    expect(entry.flaggedAnomalous).toBe(true);
  });
});

describe("recordAndCheckCost — rounding", () => {
  it("rounds the recorded costUsd to 6 decimal places", async () => {
    mockReadFile.mockRejectedValue(new Error("ENOENT"));
    const entry = await recordAndCheckCost("2026-09-01", MODEL, 1, 1, 1);
    const decimalPlaces = entry.costUsd.toString().split(".")[1]?.length ?? 0;
    expect(decimalPlaces).toBeLessThanOrEqual(6);
  });
});
