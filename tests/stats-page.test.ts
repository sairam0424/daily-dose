// /stats became on-demand-rendered in Phase 5 (export const prerender =
// false, to gate it behind HTTP Basic Auth) - astro build no longer emits
// any static dist/stats/index.html to read, so this file can no longer be
// an e2e-style "read the built output" test the way every other page's
// test file still is. Two replacement strategies, matching this repo's
// existing conventions:
// 1. Pure logic (parsing/aggregation/formatting) moved to
//    src/lib/statsAggregation.ts and is unit-tested directly here, with
//    no file I/O or build step needed.
// 2. Structural/positional invariants in stats.astro's own template
//    (e.g. "this heading renders outside the totalRuns===0 ternary") are
//    checked by reading stats.astro's source text directly and asserting
//    on substring position - the same technique this file's own
//    pre-existing "Page views" test already used before this phase.
// Real end-to-end behavior (does the live, deployed, Basic-Auth-gated
// page actually render this data correctly) is verified manually against
// a real Vercel preview deployment, matching this project's established
// convention for anything that can't be meaningfully tested without a
// real network call (see daily-pipeline.yml's cron, or
// isValidBasicAuth's own unit tests + manual curl verification).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  aggregateByDay,
  aggregateByModel,
  formatUsd,
  parseStatsJsonl,
  type StatsEntry,
} from "../src/lib/statsAggregation.js";

const STATS_ASTRO_SOURCE = join(
  import.meta.dirname,
  "..",
  "src",
  "pages",
  "stats.astro",
);
const STATS_JSONL = join(
  import.meta.dirname,
  "..",
  "src",
  "data",
  "stats.jsonl",
);

function fixtureEntry(overrides: Partial<StatsEntry> = {}): StatsEntry {
  return {
    date: "2026-09-01",
    model: "us.anthropic.claude-sonnet-5",
    inputTokens: 1000,
    outputTokens: 200,
    costUsd: 0.01,
    itemCount: 5,
    flaggedAnomalous: false,
    ...overrides,
  };
}

describe("parseStatsJsonl", () => {
  it("parses one JSON object per non-blank line", () => {
    const raw = `${JSON.stringify(fixtureEntry())}\n\n${JSON.stringify(fixtureEntry({ date: "2026-09-02" }))}\n`;
    const parsed = parseStatsJsonl(raw);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].date).toBe("2026-09-01");
    expect(parsed[1].date).toBe("2026-09-02");
  });

  it("returns an empty array for empty input", () => {
    expect(parseStatsJsonl("")).toEqual([]);
  });
});

describe("aggregateByModel", () => {
  it("sums costs/tokens/items across multiple entries for the same model", () => {
    const entries = [
      fixtureEntry({ model: "model-a", costUsd: 0.01, inputTokens: 100 }),
      fixtureEntry({ model: "model-a", costUsd: 0.02, inputTokens: 200 }),
    ];
    const [[model, agg]] = aggregateByModel(entries);
    expect(model).toBe("model-a");
    expect(agg.costUsd).toBeCloseTo(0.03);
    expect(agg.inputTokens).toBe(300);
    expect(agg.runs).toBe(2);
  });

  it("sorts rows by cost descending", () => {
    const entries = [
      fixtureEntry({ model: "cheap", costUsd: 0.01 }),
      fixtureEntry({ model: "expensive", costUsd: 0.5 }),
    ];
    const rows = aggregateByModel(entries);
    expect(rows[0][0]).toBe("expensive");
    expect(rows[1][0]).toBe("cheap");
  });
});

describe("aggregateByDay", () => {
  it("sums per-day and OR-combines flaggedAnomalous", () => {
    const entries = [
      fixtureEntry({
        date: "2026-09-01",
        costUsd: 0.01,
        flaggedAnomalous: false,
      }),
      fixtureEntry({
        date: "2026-09-01",
        costUsd: 0.02,
        flaggedAnomalous: true,
      }),
    ];
    const [[date, agg]] = aggregateByDay(entries);
    expect(date).toBe("2026-09-01");
    expect(agg.costUsd).toBeCloseTo(0.03);
    expect(agg.flaggedAnomalous).toBe(true);
  });

  it("sorts rows by date descending (most recent first)", () => {
    const entries = [
      fixtureEntry({ date: "2026-09-01" }),
      fixtureEntry({ date: "2026-09-03" }),
    ];
    const rows = aggregateByDay(entries);
    expect(rows[0][0]).toBe("2026-09-03");
    expect(rows[1][0]).toBe("2026-09-01");
  });
});

describe("formatUsd", () => {
  it("formats to exactly 4 decimal places with a $ prefix", () => {
    expect(formatUsd(0.1)).toBe("$0.1000");
    expect(formatUsd(1.23456)).toBe("$1.2346");
  });
});

describe("real committed stats.jsonl history", () => {
  it("parses and aggregates to a positive total cost, matching the real committed data", () => {
    const raw = readFileSync(STATS_JSONL, "utf-8");
    const entries = parseStatsJsonl(raw);
    expect(entries.length).toBeGreaterThan(0);
    const totalCostUsd = entries.reduce((sum, e) => sum + e.costUsd, 0);
    expect(totalCostUsd).toBeGreaterThan(0);
  });
});

describe("stats.astro source structure", () => {
  const source = readFileSync(STATS_ASTRO_SOURCE, "utf-8");

  it("never hardcodes a 'per-story cost:' label (explicitly out of scope)", () => {
    expect(source.toLowerCase()).not.toContain("per-story cost:");
  });

  it("(backlog fix) gives the model-ID cells the spec's medium font weight", () => {
    expect(source).toMatch(/\.model-cell\s*\{[^}]*font-weight:\s*500/);
  });

  it("renders the Page views section regardless of totalRuns (structural regression guard)", () => {
    // A post-redesign audit flagged this as verified-but-untested: the
    // "Page views" heading+paragraph must render even when totalRuns is
    // 0 (the {totalRuns === 0 ? (...) : (...)} ternary's OTHER branch).
    // Guard the actual invariant directly against the source: the
    // Page-views block's raw text must appear strictly AFTER the
    // ternary's closing `)}`, which is what makes it unconditional.
    const ternaryClose = source.indexOf("totalRuns === 0");
    expect(
      ternaryClose,
      "expected the totalRuns===0 ternary to exist",
    ).toBeGreaterThan(-1);

    const ternaryCloseEnd = source.indexOf(")}\n", ternaryClose);
    const pageViewsHeading = source.indexOf("Page views");
    expect(
      ternaryCloseEnd,
      "expected to find the ternary's closing )}",
    ).toBeGreaterThan(-1);
    expect(pageViewsHeading, "expected a Page views heading").toBeGreaterThan(
      -1,
    );
    expect(
      pageViewsHeading,
      "expected the Page views heading to appear after the totalRuns===0 ternary closes, not inside either of its branches",
    ).toBeGreaterThan(ternaryCloseEnd);
  });

  it("(backlog) renders the interest-score chart outside the cost-data ternary, not nested inside it", () => {
    // Phase 5's own explicit correction: the chart shows digest/score
    // data, a different dataset than the totalRuns===0 ternary gates
    // (real LLM cost data) - it must sit at the same unconditional
    // nesting level as "Page views", not inside the ternary's <>...</>
    // fragment. Same technique as the Page-views guard above.
    const ternaryClose = source.indexOf("totalRuns === 0");
    const ternaryCloseEnd = source.indexOf(")}\n", ternaryClose);
    const chartGate = source.indexOf("chartLabels.length > 0");
    const chartHeading = source.indexOf("Interest scores");
    const pageViewsHeading = source.indexOf("Page views");

    expect(chartGate, "expected a chartLabels.length > 0 gate").toBeGreaterThan(
      -1,
    );
    expect(chartHeading, "expected an Interest scores heading").toBeGreaterThan(
      -1,
    );
    expect(
      chartGate,
      "expected the chart's own gate to start after the cost-data ternary closes",
    ).toBeGreaterThan(ternaryCloseEnd);
    expect(
      chartHeading,
      "expected the Interest scores heading to render before the Page views heading",
    ).toBeLessThan(pageViewsHeading);
  });
});
