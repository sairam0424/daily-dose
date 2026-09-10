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
import type { ScoreResult } from "../src/lib/llmCuration.js";

// Mocks below back 3b's and 4b's main()-level tests further down this file -
// declared once, at module scope (Vitest hoists every vi.mock() call above
// ALL imports in this file regardless of physical position, per Vitest's
// documented hoisting behavior, so this is safe even though scripts/
// pipeline.js is statically imported above and below this block).
const mockWriteFile = vi.fn();
const mockMkdir = vi.fn();
const mockReaddir = vi.fn();
const mockUnlink = vi.fn();
vi.mock("node:fs/promises", () => ({
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  readdir: (...args: unknown[]) => mockReaddir(...args),
  unlink: (...args: unknown[]) => mockUnlink(...args),
}));

const mockScoreItemsWithLLM = vi.fn();
const mockIsLlmConfigured = vi.fn();
vi.mock("../src/lib/llmCuration.js", () => ({
  isLlmConfigured: () => mockIsLlmConfigured(),
  scoreItemsWithLLM: (...args: unknown[]) => mockScoreItemsWithLLM(...args),
}));

// Decorative-only image enrichment (see imageResolution.ts) - mocked to a
// real no-op resolution so 3b's main()-level test isn't also exercising
// (or needing to mock fetch for) a second, unrelated real network call.
vi.mock("../src/lib/imageResolution.js", () => ({
  resolveItemImage: async () => ({}),
}));

import {
  computeReadingMinutes,
  buildImageableItems,
  mapWithConcurrency,
  fetchWithRetry,
  fetchHnFrontPage,
  fetchArxivPapers,
  fetchGithubTrendingRepos,
  fetchDevtoArticles,
  FETCH_TIMEOUT_MS,
  GithubRateLimitError,
  filterExcludedItems,
  main,
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

describe("fetch timeouts via AbortController (3d)", () => {
  // A fetch mock that never resolves on its own - it only ever settles by
  // rejecting with an AbortError once the AbortSignal passed in `options`
  // actually fires, exactly matching real fetch()'s behavior when its own
  // signal aborts. Proves each fetch* function's own AbortController +
  // setTimeout actually bounds a hung request, not merely that a `signal`
  // option happens to be present (see src/lib/imageResolution.ts, whose
  // exact FETCH_TIMEOUT_MS/AbortController shape this reuses).
  function hangingFetch() {
    return vi.fn((_url: string, options?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fetchHnFrontPage rejects once FETCH_TIMEOUT_MS elapses on a hanging request", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const assertion = expect(fetchHnFrontPage(5)).rejects.toThrow(/aborted/i);
    await vi.runAllTimersAsync();
    await assertion;
  });

  it("fetchArxivPapers rejects once FETCH_TIMEOUT_MS elapses on a hanging request", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const assertion = expect(fetchArxivPapers(5)).rejects.toThrow(/aborted/i);
    await vi.runAllTimersAsync();
    await assertion;
  });

  it("fetchGithubTrendingRepos rejects once FETCH_TIMEOUT_MS elapses on a hanging request", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const assertion = expect(fetchGithubTrendingRepos(5)).rejects.toThrow(
      /aborted/i,
    );
    await vi.runAllTimersAsync();
    await assertion;
  });

  it("fetchDevtoArticles rejects once FETCH_TIMEOUT_MS elapses on a hanging LIST request", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const assertion = expect(fetchDevtoArticles(5)).rejects.toThrow(/aborted/i);
    await vi.runAllTimersAsync();
    await assertion;
  });

  it("fetchDevtoArticles also bounds each per-article DETAIL request independently of the list request", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const listItem = {
      id: 99,
      title: "A real article",
      url: "https://dev.to/x/99",
      comments_count: 0,
      public_reactions_count: 0,
      tag_list: [],
      published_timestamp: "2026-09-01T00:00:00Z",
      cover_image: null,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, options?: RequestInit) => {
        if (url.includes("?")) {
          // the list request - resolves immediately with one real item
          return Promise.resolve({
            ok: true,
            json: async () => [listItem],
          } as Response);
        }
        // the per-article detail request - hangs until aborted
        return new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => {
            reject(
              new DOMException("The operation was aborted.", "AbortError"),
            );
          });
        });
      }),
    );

    const promise = fetchDevtoArticles(1);
    const assertion = expect(promise).rejects.toThrow();
    await vi.runAllTimersAsync();
    await assertion;
  });
});

describe("GitHub rate-limit handling (3e)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fetchGithubTrendingRepos throws a distinguishable GithubRateLimitError on a 403 with x-ratelimit-remaining: 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        headers: new Headers({ "x-ratelimit-remaining": "0" }),
      } as unknown as Response),
    );

    await expect(fetchGithubTrendingRepos(5)).rejects.toThrow(
      GithubRateLimitError,
    );
  });

  it("fetchGithubTrendingRepos throws a plain Error (not GithubRateLimitError) for a 403 that is NOT a confirmed-exhausted rate limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        headers: new Headers(), // no x-ratelimit-remaining header at all
      } as unknown as Response),
    );

    let caught: unknown;
    try {
      await fetchGithubTrendingRepos(5);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(GithubRateLimitError);
    expect((caught as Error).message).toContain(
      "GitHub Search API request failed",
    );
  });

  it("(regression) a rate-limited GitHub response is not retried 3x - fetchWithRetry fails fast on the first attempt instead of amplifying the outage", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fn = vi
      .fn()
      .mockRejectedValue(new GithubRateLimitError("rate limited"));

    const assertion = expect(fetchWithRetry("GitHub", fn)).rejects.toThrow(
      GithubRateLimitError,
    );
    await vi.runAllTimersAsync();
    await assertion;
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe("fetchDevtoArticles per-article retry isolation (3e)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("retries only the single failing article's detail fetch - never re-issuing the other N-1 already-successful requests", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const listItems = [1, 2, 3].map((id) => ({
      id,
      title: `Article ${id}`,
      url: `https://dev.to/x/${id}`,
      comments_count: 0,
      public_reactions_count: 0,
      tag_list: [],
      published_timestamp: "2026-09-01T00:00:00Z",
      cover_image: null,
    }));

    const detailCallCounts = new Map<number, number>();

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("?")) {
          return Promise.resolve({
            ok: true,
            json: async () => listItems,
          } as Response);
        }

        const id = Number(url.match(/\/articles\/(\d+)$/)?.[1]);
        const count = (detailCallCounts.get(id) ?? 0) + 1;
        detailCallCounts.set(id, count);

        // Article 2's detail fetch fails once, then succeeds on retry -
        // articles 1 and 3 succeed immediately, every single time.
        if (id === 2 && count === 1) {
          return Promise.reject(new Error("transient failure for article 2"));
        }

        return Promise.resolve({
          ok: true,
          json: async () => ({ body_markdown: `Body for article ${id}` }),
        } as Response);
      }),
    );

    const promise = fetchDevtoArticles(3);
    await vi.runAllTimersAsync();
    const articles = await promise;

    expect(articles).toHaveLength(3);
    expect(detailCallCounts.get(1)).toBe(1);
    expect(detailCallCounts.get(2)).toBe(2); // failed once, retried once, succeeded
    expect(detailCallCounts.get(3)).toBe(1);
  });
});

describe("main() falls back to placeholder scoring on a total LLM failure, instead of aborting the whole digest (3b)", () => {
  const ORIGINAL_ARGV = [...process.argv];
  const ORIGINAL_ENV = { ...process.env };

  const fixtureHit = {
    title: "A real HN story for the 3b fallback test",
    url: "https://example.com/3b-fallback-story",
    points: 321,
    num_comments: 45,
    objectID: "6000001",
    author: "someauthor",
  };

  beforeEach(() => {
    process.env.BEDROCK_ACCESS_KEY_ID = "test";
    process.env.BEDROCK_SECRET_ACCESS_KEY = "test";
    // Only "hn" so this test doesn't also need to mock arXiv/GitHub/Dev.to's
    // own fetches - 3b's fix is identical for every source (it's keyed off
    // llmScores staying undefined), so one source is enough to prove it.
    process.argv = [
      "node",
      "pipeline.ts",
      "--sources",
      "hn",
      "--limit",
      "1",
      "--output",
      "test-output-3b",
    ];

    mockIsLlmConfigured.mockReturnValue(true);
    mockScoreItemsWithLLM.mockRejectedValue(
      new Error("every model in the fallback chain rejected"),
    );
    mockMkdir.mockResolvedValue(undefined);
    mockReaddir.mockResolvedValue([]);
    mockUnlink.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);

    vi.stubGlobal("fetch", vi.fn());
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ hits: [fixtureHit] }),
    });
  });

  afterEach(() => {
    process.argv = [...ORIGINAL_ARGV];
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    mockScoreItemsWithLLM.mockReset();
    mockIsLlmConfigured.mockReset();
    mockWriteFile.mockReset();
    mockMkdir.mockReset();
    mockReaddir.mockReset();
    mockUnlink.mockReset();
  });

  it("still writes a real digest file using placeholder scores, without throwing, and logs a loud console.error naming the real failure", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(main()).resolves.toBeUndefined();

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const [, writtenJson] = mockWriteFile.mock.calls[0];
    const writtenItem = JSON.parse(writtenJson as string);

    const expectedPlaceholder = scoreStoryPlaceholder({
      title: fixtureHit.title,
      url: fixtureHit.url,
      points: fixtureHit.points,
      num_comments: fixtureHit.num_comments,
      hn_id: Number(fixtureHit.objectID),
      author: fixtureHit.author,
    });

    // Real data (HN fetch succeeded) + real placeholder fallback (not a
    // fabricated substitute) - never aborted.
    expect(writtenItem.why_read).toBe(expectedPlaceholder.why_read);
    expect(writtenItem.interest_score).toBe(expectedPlaceholder.interest_score);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Real Bedrock LLM call failed entirely"),
    );
  });
});

describe("filterExcludedItems (4b — exclude-flag enforcement, real behavior)", () => {
  function makeScore(exclude: boolean): ScoreResult {
    return { interest_score: 5, why_read: "x", analysis: "y", exclude };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("filters out an item the real LLM flagged exclude: true, logging a warning naming its real id", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const llmScores = new Map<string, ScoreResult>([
      ["hn-1", makeScore(true)],
      ["hn-2", makeScore(false)],
    ]);

    const result = filterExcludedItems(
      [{ id: 1 }, { id: 2 }],
      (item) => `hn-${item.id}`,
      llmScores,
    );

    expect(result).toEqual([{ id: 2 }]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain("hn-1");
  });

  it("keeps every item unchanged when llmScores is undefined (no LLM configured, or 3b's total-failure fallback)", () => {
    const result = filterExcludedItems(
      [{ id: 1 }, { id: 2 }],
      (item) => `hn-${item.id}`,
      undefined,
    );
    expect(result).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("keeps an item whose id has no LLM score at all - a per-item gap is not the same as exclude", () => {
    const llmScores = new Map<string, ScoreResult>([
      ["hn-1", makeScore(false)],
    ]);
    const result = filterExcludedItems(
      [{ id: 1 }, { id: 2 }],
      (item) => `hn-${item.id}`,
      llmScores,
    );
    expect(result).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("excludes multiple flagged items across a larger list, preserving the relative order of the ones kept", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const llmScores = new Map<string, ScoreResult>([
      ["hn-1", makeScore(false)],
      ["hn-2", makeScore(true)],
      ["hn-3", makeScore(false)],
      ["hn-4", makeScore(true)],
    ]);

    const result = filterExcludedItems(
      [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
      (item) => `hn-${item.id}`,
      llmScores,
    );
    expect(result).toEqual([{ id: 1 }, { id: 3 }]);
  });
});

describe("pipeline.ts exclude-flag enforcement wiring (source-text check - main()'s per-source loops make real network calls and are not otherwise unit-tested, per this file's existing convention; see AGENTS.md; 4b)", () => {
  const pipelineSource = readFileSync(
    new URL("../scripts/pipeline.ts", import.meta.url),
    "utf-8",
  );

  it("calls filterExcludedItems once per source loop (hn, arxiv, github, devto) before scoring/building each candidate", () => {
    const matches = pipelineSource.match(/filterExcludedItems\(/g) ?? [];
    expect(matches.length).toBe(4);
  });
});
