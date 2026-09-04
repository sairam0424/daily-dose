import { describe, expect, it } from "vitest";
import { DigestItemSchema } from "../src/lib/digestSchema.js";

const validItem = {
  title: "Show HN: A new way to curate arXiv papers",
  source: "hn",
  url: "https://news.ycombinator.com/item?id=12345678",
  date: "2026-09-02",
  tags: ["ai", "curation"],
  interest_score: 7.5,
  why_read:
    "High engagement (250 points, 80 comments) suggests strong community interest.",
  authors: [],
  hn_id: 12345678,
  points: 250,
};

describe("DigestItemSchema", () => {
  it("parses a well-formed digest item successfully", () => {
    expect(() => DigestItemSchema.parse(validItem)).not.toThrow();
    const parsed = DigestItemSchema.parse(validItem);
    expect(parsed.title).toBe(validItem.title);
    expect(parsed.source).toBe("hn");
    expect(parsed.interest_score).toBe(7.5);
  });

  it("throws when a required field is missing", () => {
    const { title, ...missingTitle } = validItem;
    expect(() => DigestItemSchema.parse(missingTitle)).toThrow();
  });

  it("throws when interest_score is out of range (11 > max 10)", () => {
    const outOfRange = { ...validItem, interest_score: 11 };
    expect(() => DigestItemSchema.parse(outOfRange)).toThrow();
  });

  it("throws when date is malformed (not YYYY-MM-DD)", () => {
    const badDate = { ...validItem, date: "Sept 2, 2026" };
    expect(() => DigestItemSchema.parse(badDate)).toThrow();
  });

  it("throws when url is invalid", () => {
    const badUrl = { ...validItem, url: "not-a-valid-url" };
    expect(() => DigestItemSchema.parse(badUrl)).toThrow();
  });

  it("accepts a valid item with reading_minutes set", () => {
    const result = DigestItemSchema.safeParse({
      title: "A paper",
      source: "arxiv",
      url: "https://arxiv.org/abs/1234.5678",
      date: "2026-09-03",
      tags: [],
      interest_score: 7,
      why_read: "Solid incremental result.",
      authors: [],
      reading_minutes: 3,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid item WITHOUT reading_minutes (HN/GitHub items never have it)", () => {
    const result = DigestItemSchema.safeParse({
      title: "A story",
      source: "hn",
      url: "https://example.com",
      date: "2026-09-03",
      tags: [],
      interest_score: 7,
      why_read: "Interesting.",
      authors: [],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid item with image_url and favicon_url set", () => {
    const result = DigestItemSchema.safeParse({
      ...validItem,
      image_url: "https://example.com/cover.png",
      favicon_url: "https://example.com/favicon.ico",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid item WITHOUT image_url/favicon_url (most items won't have one)", () => {
    const result = DigestItemSchema.safeParse(validItem);
    expect(result.success).toBe(true);
    expect((result as any).data.image_url).toBeUndefined();
  });

  it("rejects a non-URL image_url", () => {
    const result = DigestItemSchema.safeParse({
      ...validItem,
      image_url: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a javascript: scheme image_url", () => {
    const result = DigestItemSchema.safeParse({
      ...validItem,
      image_url: "javascript:alert(1)",
    });
    expect(result.success).toBe(false);
  });
});
