import { describe, expect, it } from "vitest";
import {
  scoreStoryPlaceholder,
  scoreGithubPlaceholder,
  type RawHnStory,
  type RawGithubRepo,
} from "../src/lib/curation.js";

// Fixed, hand-constructed RawHnStory fixtures (the shape fetchHnFrontPage
// produces). No network calls — scoreStoryPlaceholder must be a pure,
// deterministic function of these fields.
const lowEngagementStory: RawHnStory = {
  title: "A modest weekend project",
  url: "https://example.com/modest-weekend-project",
  points: 12,
  num_comments: 3,
  hn_id: 1000001,
  author: "someuser",
};

const highEngagementStory: RawHnStory = {
  title: "Show HN: We rebuilt our database from scratch",
  url: "https://example.com/rebuilt-database",
  points: 890,
  num_comments: 412,
  hn_id: 1000002,
  author: "anotheruser",
};

describe("scoreStoryPlaceholder", () => {
  it("returns an interest_score within [0, 10]", () => {
    const { interest_score } = scoreStoryPlaceholder(lowEngagementStory);
    expect(interest_score).toBeGreaterThanOrEqual(0);
    expect(interest_score).toBeLessThanOrEqual(10);
  });

  it("returns a non-empty why_read string derived from real input fields", () => {
    const { why_read } = scoreStoryPlaceholder(highEngagementStory);
    expect(why_read.length).toBeGreaterThan(0);
    // Proves the string is derived from the actual input rather than hardcoded:
    // it must reference the real points count somewhere in the text.
    expect(why_read).toContain(String(highEngagementStory.points));
  });

  it("scores a story with dramatically higher points/comments higher-or-equal to a lower one", () => {
    const low = scoreStoryPlaceholder(lowEngagementStory);
    const high = scoreStoryPlaceholder(highEngagementStory);

    expect(high.interest_score).toBeGreaterThanOrEqual(low.interest_score);
    expect(high.interest_score).toBeGreaterThanOrEqual(0);
    expect(high.interest_score).toBeLessThanOrEqual(10);
    expect(low.interest_score).toBeGreaterThanOrEqual(0);
    expect(low.interest_score).toBeLessThanOrEqual(10);
  });
});

const lowEngagementRepo: RawGithubRepo = {
  fullName: "someuser/small-utility",
  url: "https://github.com/someuser/small-utility",
  description: "A tiny utility library.",
  stars: 5,
  forks: 1,
  language: "TypeScript",
  createdAt: "2026-08-28T00:00:00Z",
};

const highEngagementRepo: RawGithubRepo = {
  fullName: "bigorg/breakout-project",
  url: "https://github.com/bigorg/breakout-project",
  description: "A genuinely popular new project.",
  stars: 4000,
  forks: 500,
  language: "Rust",
  createdAt: "2026-08-28T00:00:00Z",
};

describe("scoreGithubPlaceholder", () => {
  it("returns an interest_score within [0, 10]", () => {
    const { interest_score } = scoreGithubPlaceholder(lowEngagementRepo);
    expect(interest_score).toBeGreaterThanOrEqual(0);
    expect(interest_score).toBeLessThanOrEqual(10);
  });

  it("returns a non-empty why_read string derived from real input fields", () => {
    const { why_read } = scoreGithubPlaceholder(highEngagementRepo);
    expect(why_read.length).toBeGreaterThan(0);
    // Proves the string is derived from the actual input rather than hardcoded:
    // it must reference the real star count somewhere in the text.
    expect(why_read).toContain(String(highEngagementRepo.stars));
  });

  it("scores a repo with dramatically higher stars/forks higher-or-equal to a lower one", () => {
    const low = scoreGithubPlaceholder(lowEngagementRepo);
    const high = scoreGithubPlaceholder(highEngagementRepo);

    expect(high.interest_score).toBeGreaterThanOrEqual(low.interest_score);
    expect(high.interest_score).toBeGreaterThanOrEqual(0);
    expect(high.interest_score).toBeLessThanOrEqual(10);
    expect(low.interest_score).toBeGreaterThanOrEqual(0);
    expect(low.interest_score).toBeLessThanOrEqual(10);
  });
});
