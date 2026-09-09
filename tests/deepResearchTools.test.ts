import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchHnThread,
  fetchArxivFulltext,
} from "../src/lib/deepResearchTools.js";

describe("fetchHnThread", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the story title, url, and top comments on success", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 49541888,
        title: "A real story",
        url: "https://example.com/article",
        points: 120,
        children: [
          { author: "alice", text: "A real <b>comment</b> with markup." },
          { author: "bob", text: "" },
        ],
      }),
    });

    const result = await fetchHnThread(49541888);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content).toContain("A real story");
      expect(result.content).toContain("https://example.com/article");
      expect(result.content).toContain("alice: A real comment with markup.");
    }
  });

  it("returns ok: false, not a throw, on a non-OK response", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });
    const result = await fetchHnThread(1);
    expect(result.ok).toBe(false);
  });

  it("returns ok: false, not a throw, when fetch rejects", async () => {
    (fetch as any).mockRejectedValueOnce(new Error("network down"));
    const result = await fetchHnThread(1);
    expect(result.ok).toBe(false);
  });
});

describe("fetchArxivFulltext", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches ar5iv and extracts plain text from the body", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      text: async () =>
        `<html><body><h1>Title</h1><p>Real paper text.</p><script>ignored()</script></body></html>`,
    });

    const result = await fetchArxivFulltext("2609.04190");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content).toContain("Real paper text.");
      expect(result.content).not.toContain("ignored()");
    }
    expect(fetch).toHaveBeenCalledWith(
      "https://ar5iv.labs.arxiv.org/html/2609.04190",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("returns ok: false on a non-OK response", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });
    const result = await fetchArxivFulltext("2609.04190");
    expect(result.ok).toBe(false);
  });

  it("returns ok: false when fetch rejects", async () => {
    (fetch as any).mockRejectedValueOnce(new Error("network down"));
    const result = await fetchArxivFulltext("2609.04190");
    expect(result.ok).toBe(false);
  });
});

import {
  fetchGithubRepoFile,
  fetchDevtoFulltext,
  extractArxivId,
  extractGithubOwnerRepo,
  dispatchTool,
} from "../src/lib/deepResearchTools.js";
import type { DigestItem } from "../src/lib/digestSchema.js";

describe("fetchGithubRepoFile", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("decodes base64 file content", async () => {
    const encoded = Buffer.from("# Real README\n").toString("base64");
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        type: "file",
        encoding: "base64",
        content: encoded,
        name: "README.md",
      }),
    });
    const result = await fetchGithubRepoFile("owner", "repo", "README.md");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.content).toBe("# Real README\n");
  });

  it("lists directory contents when given a directory path", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { name: "src", type: "dir", path: "src" },
        { name: "README.md", type: "file", path: "README.md" },
      ],
    });
    const result = await fetchGithubRepoFile("owner", "repo", "");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content).toContain("[dir] src");
      expect(result.content).toContain("README.md");
    }
  });

  it("returns ok: false on a non-OK response", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });
    const result = await fetchGithubRepoFile("owner", "repo", "missing.md");
    expect(result.ok).toBe(false);
  });

  it("rejects a path-traversal path that would escape the item's own repo, without making a network request", async () => {
    const result = await fetchGithubRepoFile(
      "owner",
      "repo",
      "../../../other-owner/other-repo/contents/secret.txt",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("escape");
    // The security guarantee is that this never even reaches the network.
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a leading-slash absolute path the same way", async () => {
    const result = await fetchGithubRepoFile(
      "owner",
      "repo",
      "../../etc/passwd",
    );
    expect(result.ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("fetchDevtoFulltext", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the real uncapped body_markdown", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        title: "A real article",
        body_markdown: "Full real body text.",
      }),
    });
    const result = await fetchDevtoFulltext("4596945");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content).toContain("A real article");
      expect(result.content).toContain("Full real body text.");
    }
  });

  it("returns ok: false on a non-OK response", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });
    const result = await fetchDevtoFulltext("999");
    expect(result.ok).toBe(false);
  });
});

describe("extractArxivId", () => {
  it("extracts the id from a real arxiv.org/abs URL", () => {
    expect(extractArxivId("https://arxiv.org/abs/2609.05401")).toBe(
      "2609.05401",
    );
  });
  it("returns undefined for a non-matching URL", () => {
    expect(extractArxivId("https://example.com/paper")).toBeUndefined();
  });
});

describe("extractGithubOwnerRepo", () => {
  it("extracts owner and repo from a real github.com URL", () => {
    expect(
      extractGithubOwnerRepo("https://github.com/anthropics/claude-code"),
    ).toEqual({
      owner: "anthropics",
      repo: "claude-code",
    });
  });
  it("returns undefined for a non-matching URL", () => {
    expect(
      extractGithubOwnerRepo("https://example.com/foo/bar"),
    ).toBeUndefined();
  });
});

describe("dispatchTool", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const hnItem: DigestItem = {
    title: "t",
    source: "hn",
    url: "https://example.com",
    date: "2026-09-09",
    tags: [],
    interest_score: 5,
    why_read: "y",
    authors: [],
    hn_id: 49541888,
  };

  it("routes fetch_hn_thread to fetchHnThread using item.hn_id", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 49541888, title: "t", children: [] }),
    });
    const result = await dispatchTool(
      "fetch_hn_thread",
      {},
      "hn-49541888",
      hnItem,
    );
    expect(result.ok).toBe(true);
  });

  it("returns ok: false for an unknown tool name", async () => {
    const result = await dispatchTool(
      "not_a_real_tool",
      {},
      "hn-49541888",
      hnItem,
    );
    expect(result.ok).toBe(false);
  });

  it("returns ok: false for fetch_devto_fulltext when itemId has no devto- prefix", async () => {
    const result = await dispatchTool(
      "fetch_devto_fulltext",
      {},
      "hn-49541888",
      hnItem,
    );
    expect(result.ok).toBe(false);
  });
});
