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
