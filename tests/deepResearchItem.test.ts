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

const mockCreate = vi.fn();
vi.mock("@anthropic-ai/bedrock-sdk", () => ({
  AnthropicBedrock: vi
    .fn()
    .mockImplementation(() => ({ messages: { create: mockCreate } })),
}));

const { researchItem, MAX_TURNS } =
  await import("../scripts/deepResearchItem.js");

function toolUseMessage(
  name: string,
  input: Record<string, unknown>,
  id = "tool_1",
) {
  return {
    content: [{ type: "tool_use", id, name, input }],
    model: "us.anthropic.claude-sonnet-5",
    stop_reason: "tool_use",
  };
}

function textOnlyMessage() {
  return {
    content: [{ type: "text", text: "I am done thinking." }],
    model: "us.anthropic.claude-sonnet-5",
    stop_reason: "end_turn",
  };
}

describe("researchItem", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env.BEDROCK_ACCESS_KEY_ID = "test";
    process.env.BEDROCK_SECRET_ACCESS_KEY = "test";
    mockReaddir.mockResolvedValue(["2026-09-06"]);
    mockReadFile.mockResolvedValue(validDigestItemJson());
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    mockCreate.mockReset();
    vi.unstubAllGlobals();
  });

  it("runs a tool call then submit_findings, returning a validated complete result", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 49541888, title: "t", children: [] }),
    });
    mockCreate
      .mockResolvedValueOnce(toolUseMessage("fetch_hn_thread", {}))
      .mockResolvedValueOnce(
        toolUseMessage(
          "submit_findings",
          {
            deepAnalysis: "A real, thorough finding.",
            sourcesConsulted: ["fetch_hn_thread"],
            confidence: "high",
          },
          "tool_2",
        ),
      );

    const result = await researchItem("hn-49541888");
    expect(result.status).toBe("complete");
    expect(result.turnsUsed).toBe(2);
    expect(result.deepAnalysis).toBe("A real, thorough finding.");
    expect(result.itemId).toBe("hn-49541888");
  });

  it("returns status: incomplete after MAX_TURNS without a submit_findings call", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 49541888, title: "t", children: [] }),
    });
    for (let i = 0; i < MAX_TURNS; i++) {
      mockCreate.mockResolvedValueOnce(
        toolUseMessage("fetch_hn_thread", {}, `tool_${i}`),
      );
    }

    const result = await researchItem("hn-49541888");
    expect(result.status).toBe("incomplete");
    expect(result.turnsUsed).toBe(MAX_TURNS);
    expect(mockCreate).toHaveBeenCalledTimes(MAX_TURNS);
  });

  it("throws when Bedrock credentials are not configured", async () => {
    delete process.env.BEDROCK_ACCESS_KEY_ID;
    delete process.env.BEDROCK_SECRET_ACCESS_KEY;
    await expect(researchItem("hn-49541888")).rejects.toThrow(
      /BEDROCK_ACCESS_KEY_ID/,
    );
  });
});
