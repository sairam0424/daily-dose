import type { CollectionEntry } from "astro:content";
import { describe, expect, it } from "vitest";
import { groupEntriesByDate } from "../src/lib/digestGrouping.js";

// Minimal fixture builder — groupEntriesByDate only ever reads `id` and
// `data.date`/`data.interest_score`, so a full DigestItem shape isn't
// needed to exercise the sort/group logic under test.
function makeEntry(
  id: string,
  date: string,
  interestScore: number,
): CollectionEntry<"digest"> {
  return {
    id,
    data: { date, interest_score: interestScore },
  } as unknown as CollectionEntry<"digest">;
}

describe("groupEntriesByDate", () => {
  it("sorts each date's entries by interest_score descending", () => {
    const entries = [
      makeEntry("hn-1", "2026-09-10", 5),
      makeEntry("hn-2", "2026-09-10", 9),
      makeEntry("hn-3", "2026-09-10", 7),
    ];

    const [group] = groupEntriesByDate(entries);

    expect(group.entries.map((e) => e.id)).toEqual(["hn-2", "hn-3", "hn-1"]);
  });

  it("groups distinct dates and sorts the dates descending", () => {
    const entries = [
      makeEntry("hn-1", "2026-09-08", 5),
      makeEntry("hn-2", "2026-09-10", 5),
      makeEntry("hn-3", "2026-09-09", 5),
    ];

    const groups = groupEntriesByDate(entries);

    expect(groups.map((g) => g.date)).toEqual([
      "2026-09-10",
      "2026-09-09",
      "2026-09-08",
    ]);
  });

  it("(regression) breaks a tie in interest_score deterministically by id, instead of leaving it as a file-order artifact", () => {
    // Two entries with an identical score, deliberately inserted in an
    // order that would expose an unstable/file-order-dependent sort if the
    // secondary key were missing.
    const entries = [
      makeEntry("arxiv-2000.99999", "2026-09-10", 8),
      makeEntry("hn-1000", "2026-09-10", 8),
      makeEntry("devto-500", "2026-09-10", 8),
    ];

    const [group] = groupEntriesByDate(entries);

    expect(group.entries.map((e) => e.id)).toEqual([
      "arxiv-2000.99999",
      "devto-500",
      "hn-1000",
    ]);
  });

  it("(regression) produces the same order across repeated calls regardless of input order, for tied scores", () => {
    const a = makeEntry("hn-1", "2026-09-10", 8);
    const b = makeEntry("hn-2", "2026-09-10", 8);
    const c = makeEntry("hn-3", "2026-09-10", 8);

    const forward = groupEntriesByDate([a, b, c])[0].entries.map((e) => e.id);
    const reversed = groupEntriesByDate([c, b, a])[0].entries.map((e) => e.id);

    expect(forward).toEqual(["hn-1", "hn-2", "hn-3"]);
    expect(reversed).toEqual(forward);
  });
});
