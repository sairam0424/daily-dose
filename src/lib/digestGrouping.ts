import type { CollectionEntry } from "astro:content";

/**
 * One distinct digest date, with that date's entries already sorted by
 * interest_score descending (matching the sort index.astro has always used
 * for the latest date's story list).
 */
export interface DigestDateGroup {
  date: string;
  entries: CollectionEntry<"digest">[];
}

/**
 * Groups digest entries by their data.date field and returns the distinct
 * dates sorted descending (most recent first), each paired with that date's
 * entries sorted by interest_score descending.
 *
 * Reused by src/pages/index.astro (latest date only), src/pages/archive/
 * index.astro and src/pages/archive/[date].astro (every date), and a
 * follow-up RSS feature — keep this shape stable.
 */
export function groupEntriesByDate(
  entries: CollectionEntry<"digest">[],
): DigestDateGroup[] {
  const entriesByDate = new Map<string, CollectionEntry<"digest">[]>();

  for (const entry of entries) {
    const existingEntries = entriesByDate.get(entry.data.date) ?? [];
    entriesByDate.set(entry.data.date, [...existingEntries, entry]);
  }

  return [...entriesByDate.entries()]
    .sort(([dateA], [dateB]) => (dateA < dateB ? 1 : dateA > dateB ? -1 : 0))
    .map(([date, dateEntries]) => ({
      date,
      entries: [...dateEntries].sort(
        (a, b) => b.data.interest_score - a.data.interest_score,
      ),
    }));
}
