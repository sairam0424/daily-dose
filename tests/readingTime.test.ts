import { describe, expect, it } from "vitest";
import { formatReadingBadge } from "../src/lib/readingTime.js";
import type { DigestItem } from "../src/lib/digestSchema.js";

function baseItem(overrides: Partial<DigestItem>): DigestItem {
  return {
    title: "Test item",
    source: "hn",
    url: "https://example.com",
    date: "2026-09-03",
    tags: [],
    interest_score: 5,
    why_read: "Test.",
    authors: [],
    ...overrides,
  };
}

describe("formatReadingBadge", () => {
  it('returns "Discussion" for HN items, never a fabricated time', () => {
    expect(formatReadingBadge(baseItem({ source: "hn" }))).toBe("Discussion");
  });

  it('returns "Repo" for GitHub items, never a fabricated time', () => {
    expect(formatReadingBadge(baseItem({ source: "github" }))).toBe("Repo");
  });

  it('returns "~X min read" for arXiv items with reading_minutes set', () => {
    expect(
      formatReadingBadge(baseItem({ source: "arxiv", reading_minutes: 3 })),
    ).toBe("~3 min read");
  });

  it('returns "Paper" for an arXiv item missing reading_minutes (old record)', () => {
    expect(formatReadingBadge(baseItem({ source: "arxiv" }))).toBe("Paper");
  });

  it('returns "~X min excerpt" for Dev.to items with reading_minutes set', () => {
    expect(
      formatReadingBadge(baseItem({ source: "devto", reading_minutes: 5 })),
    ).toBe("~5 min excerpt");
  });

  it('returns "Article" for a Dev.to item missing reading_minutes (old record)', () => {
    expect(formatReadingBadge(baseItem({ source: "devto" }))).toBe("Article");
  });
});
