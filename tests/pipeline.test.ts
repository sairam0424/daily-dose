import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  scoreStoryPlaceholder,
  scoreGithubPlaceholder,
  scoreDevtoPlaceholder,
  type RawHnStory,
  type RawGithubRepo,
  type RawDevtoArticle,
} from "../src/lib/curation.js";
import type { RawArxivPaper } from "../scripts/pipeline.js";
import {
  computeReadingMinutes,
  buildImageableItems,
  mapWithConcurrency,
  fetchWithRetry,
} from "../scripts/pipeline.js";

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

describe("computeReadingMinutes", () => {
  it("computes ~200 words per minute, rounded, minimum 1", () => {
    const twoHundredWords = Array.from({ length: 200 }, () => "word").join(" ");
    expect(computeReadingMinutes(twoHundredWords)).toBe(1);

    const sixHundredWords = Array.from({ length: 600 }, () => "word").join(" ");
    expect(computeReadingMinutes(sixHundredWords)).toBe(3);
  });

  it("never returns less than 1, even for very short text", () => {
    expect(computeReadingMinutes("one two three")).toBe(1);
  });

  it("returns 1 for empty text (defensive floor, not expected in real data)", () => {
    expect(computeReadingMinutes("")).toBe(1);
  });
});

const lowEngagementArticle: RawDevtoArticle = {
  id: 2000001,
  title: "Setting up a personal blog with a static site generator",
  url: "https://dev.to/someuser/setting-up-a-personal-blog-1a2b",
  bodyText: "A short walkthrough of a basic static blog setup.",
  reactions: 4,
  comments: 1,
  tags: ["beginners", "webdev"],
  publishedAt: "2026-09-01T12:00:00Z",
};

const highEngagementArticle: RawDevtoArticle = {
  id: 2000002,
  title: "How we cut our API's p99 latency by 80%",
  url: "https://dev.to/anotheruser/how-we-cut-our-apis-p99-latency-3c4d",
  bodyText:
    "A detailed retrospective on a real production latency investigation, including profiling data and the specific fixes that worked.",
  reactions: 650,
  comments: 210,
  tags: ["performance", "backend"],
  publishedAt: "2026-09-01T12:00:00Z",
};

describe("scoreDevtoPlaceholder", () => {
  it("returns an interest_score within [0, 10]", () => {
    const { interest_score } = scoreDevtoPlaceholder(lowEngagementArticle);
    expect(interest_score).toBeGreaterThanOrEqual(0);
    expect(interest_score).toBeLessThanOrEqual(10);
  });

  it("returns a non-empty why_read string derived from real input fields", () => {
    const { why_read } = scoreDevtoPlaceholder(highEngagementArticle);
    expect(why_read.length).toBeGreaterThan(0);
    // Proves the string is derived from the actual input rather than hardcoded:
    // it must reference the real reaction count somewhere in the text.
    expect(why_read).toContain(String(highEngagementArticle.reactions));
  });

  it("scores an article with dramatically higher reactions/comments higher-or-equal to a lower one", () => {
    const low = scoreDevtoPlaceholder(lowEngagementArticle);
    const high = scoreDevtoPlaceholder(highEngagementArticle);

    expect(high.interest_score).toBeGreaterThanOrEqual(low.interest_score);
    expect(high.interest_score).toBeGreaterThanOrEqual(0);
    expect(high.interest_score).toBeLessThanOrEqual(10);
    expect(low.interest_score).toBeGreaterThanOrEqual(0);
    expect(low.interest_score).toBeLessThanOrEqual(10);
  });
});

describe("buildImageableItems", () => {
  it("excludes devto articles that already have a native coverImage", () => {
    const withCover: RawDevtoArticle = {
      ...lowEngagementArticle,
      id: 3000001,
      coverImage: "https://dev.to/cover.png",
    };
    const withoutCover: RawDevtoArticle = {
      ...lowEngagementArticle,
      id: 3000002,
    };

    const items = buildImageableItems([], [], [], [withCover, withoutCover]);
    expect(items).toEqual([{ id: "devto-3000002", url: withoutCover.url }]);
  });

  it("includes every hn/arxiv/github item unconditionally (they have no native image field)", () => {
    const items = buildImageableItems([lowEngagementStory], [], [], []);
    expect(items).toEqual([
      { id: `hn-${lowEngagementStory.hn_id}`, url: lowEngagementStory.url },
    ]);
  });

  it("includes arxivId only for arxiv entries, using the real (unsanitized) arXiv id", () => {
    const paper: RawArxivPaper = {
      title: "A real paper",
      url: "https://arxiv.org/abs/2609.04190",
      arxivId: "2609.04190",
      publishedDate: "2026-09-01T00:00:00Z",
      authors: ["Someone"],
      categories: ["cs.AI"],
      summary: "An abstract.",
    };

    const items = buildImageableItems([lowEngagementStory], [paper], [], []);
    const arxivItem = items.find((item) => item.id.startsWith("arxiv-"));
    const hnItem = items.find((item) => item.id.startsWith("hn-"));

    expect(arxivItem?.arxivId).toBe("2609.04190");
    expect(hnItem?.arxivId).toBeUndefined();
  });

  it("keeps arxivId as the real id even when it needs sanitizing for the item's own id/filename (old-style id with a slash)", () => {
    const oldStylePaper: RawArxivPaper = {
      title: "An old-style-id paper",
      url: "https://arxiv.org/abs/cs.AI/0601001",
      arxivId: "cs.AI/0601001",
      publishedDate: "2006-01-01T00:00:00Z",
      authors: ["Someone"],
      categories: ["cs.AI"],
      summary: "An abstract.",
    };

    const items = buildImageableItems([], [oldStylePaper], [], []);
    const arxivItem = items.find((item) => item.id.startsWith("arxiv-"));

    expect(arxivItem?.id).toBe("arxiv-cs.AI-0601001");
    expect(arxivItem?.arxivId).toBe("cs.AI/0601001");
  });
});

describe("mapWithConcurrency", () => {
  it("preserves input order regardless of completion order", async () => {
    const delays = [30, 10, 20];
    const result = await mapWithConcurrency(delays, 2, async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return ms;
    });
    expect(result).toEqual([30, 10, 20]);
  });

  it("never runs more than `limit` items concurrently", async () => {
    let active = 0;
    let maxActive = 0;
    await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return n;
    });
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("processes every item exactly once", async () => {
    const result = await mapWithConcurrency([1, 2, 3], 10, async (n) => n * 2);
    expect(result).toEqual([2, 4, 6]);
  });
});

describe("pipeline.ts analysis wiring (source-text check - main()'s per-source loops make real network calls and are not otherwise unit-tested, per this file's existing convention; see AGENTS.md)", () => {
  const pipelineSource = readFileSync(
    new URL("../scripts/pipeline.ts", import.meta.url),
    "utf-8",
  );

  it("reads fromLlm?.analysis once per source loop (hn, arxiv, github, devto)", () => {
    const matches =
      pipelineSource.match(/const analysis = fromLlm\?\.analysis;/g) ?? [];
    expect(matches.length).toBe(4);
  });

  it("includes analysis in the candidate object right after why_read, once per source loop", () => {
    const matches = pipelineSource.match(/why_read,\n\s+analysis,/g) ?? [];
    expect(matches.length).toBe(4);
  });
});

describe("fetchWithRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("succeeds on the first attempt with no retry", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const promise = fetchWithRetry("HN", fn);
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("succeeds on the 2nd attempt after 1 failure, logging a warning", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient failure"))
      .mockResolvedValueOnce("ok");

    const promise = fetchWithRetry("arXiv", fn);
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain("arXiv");
  });

  it("(regression) exhausts all 3 attempts and rethrows the exact last error, not a generic wrapper", async () => {
    const errors = [
      new Error("failure 1"),
      new Error("failure 2"),
      new Error("failure 3"),
    ];
    const fn = vi
      .fn()
      .mockRejectedValueOnce(errors[0])
      .mockRejectedValueOnce(errors[1])
      .mockRejectedValueOnce(errors[2]);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    // Attach the rejection expectation before advancing timers, so the
    // handler is registered before fetchWithRetry's internal promise
    // actually rejects - otherwise Node briefly flags it as an unhandled
    // rejection even though the test itself passes.
    const assertion = expect(fetchWithRetry("GitHub", fn)).rejects.toBe(
      errors[2],
    );
    await vi.runAllTimersAsync();
    await assertion;
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("uses exponential backoff (500ms, then 1000ms) between attempts", async () => {
    const setTimeoutSpy = vi.spyOn(global, "setTimeout");
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("failure 1"))
      .mockRejectedValueOnce(new Error("failure 2"))
      .mockResolvedValueOnce("ok");
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const promise = fetchWithRetry("Dev.to", fn);
    await vi.runAllTimersAsync();
    await promise;

    const delays = setTimeoutSpy.mock.calls.map((call) => call[1]);
    expect(delays).toEqual([500, 1000]);
  });
});
