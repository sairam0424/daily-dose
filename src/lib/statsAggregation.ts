export interface StatsEntry {
  date: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  itemCount: number;
  flaggedAnomalous: boolean;
}

export interface ModelAgg {
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  itemCount: number;
  runs: number;
}

export interface DayAgg {
  costUsd: number;
  itemCount: number;
  runs: number;
  flaggedAnomalous: boolean;
}

export function parseStatsJsonl(raw: string): StatsEntry[] {
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as StatsEntry);
}

export function aggregateByModel(
  entries: StatsEntry[],
): Array<[string, ModelAgg]> {
  const byModel = new Map<string, ModelAgg>();
  for (const e of entries) {
    const existing = byModel.get(e.model) ?? {
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      itemCount: 0,
      runs: 0,
    };
    byModel.set(e.model, {
      costUsd: existing.costUsd + e.costUsd,
      inputTokens: existing.inputTokens + e.inputTokens,
      outputTokens: existing.outputTokens + e.outputTokens,
      itemCount: existing.itemCount + e.itemCount,
      runs: existing.runs + 1,
    });
  }
  return [...byModel.entries()].sort((a, b) => b[1].costUsd - a[1].costUsd);
}

export function aggregateByDay(entries: StatsEntry[]): Array<[string, DayAgg]> {
  const byDay = new Map<string, DayAgg>();
  for (const e of entries) {
    const existing = byDay.get(e.date) ?? {
      costUsd: 0,
      itemCount: 0,
      runs: 0,
      flaggedAnomalous: false,
    };
    byDay.set(e.date, {
      costUsd: existing.costUsd + e.costUsd,
      itemCount: existing.itemCount + e.itemCount,
      runs: existing.runs + 1,
      flaggedAnomalous: existing.flaggedAnomalous || e.flaggedAnomalous,
    });
  }
  return [...byDay.entries()].sort(([dateA], [dateB]) =>
    dateA < dateB ? 1 : dateA > dateB ? -1 : 0,
  );
}

export function formatUsd(amount: number): string {
  return `$${amount.toFixed(4)}`;
}
