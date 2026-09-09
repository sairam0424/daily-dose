import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Declares ALL of node:fs/promises's mocked functions up front, even
// mockWriteFile (not exercised until Task 7's tests) - Vitest only allows
// ONE vi.mock() factory per module path per file, so later tasks in this
// same file reuse these variables instead of calling vi.mock() again.
const mockReaddir = vi.fn();
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
vi.mock("node:fs/promises", () => ({
  readdir: (...args: unknown[]) => mockReaddir(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
}));

const { findDigestItem } = await import("../scripts/deepResearchItem.js");

function validDigestItemJson() {
  return JSON.stringify({
    title: "A real story",
    source: "hn",
    url: "https://example.com",
    date: "2026-09-06",
    tags: [],
    interest_score: 7,
    why_read: "y",
    authors: [],
    hn_id: 49541888,
  });
}

describe("findDigestItem", () => {
  afterEach(() => {
    mockReaddir.mockReset();
    mockReadFile.mockReset();
  });

  it("finds and parses a matching item in the second date folder checked", async () => {
    mockReaddir.mockResolvedValue(["2026-09-05", "2026-09-06"]);
    mockReadFile
      .mockRejectedValueOnce(new Error("ENOENT"))
      .mockResolvedValueOnce(validDigestItemJson());

    const { item, filePath } = await findDigestItem("hn-49541888");
    expect(item.title).toBe("A real story");
    expect(filePath).toContain("2026-09-06");
  });

  it("throws a clear error when no date folder has a matching file", async () => {
    mockReaddir.mockResolvedValue(["2026-09-05", "2026-09-06"]);
    mockReadFile.mockRejectedValue(new Error("ENOENT"));

    await expect(findDigestItem("hn-does-not-exist")).rejects.toThrow(
      /No committed digest item found with id "hn-does-not-exist"/,
    );
  });

  it("throws (does not swallow) when a found file fails schema validation", async () => {
    mockReaddir.mockResolvedValue(["2026-09-06"]);
    mockReadFile.mockResolvedValueOnce(
      JSON.stringify({ title: "missing required fields" }),
    );

    await expect(findDigestItem("hn-49541888")).rejects.toThrow();
  });
});
