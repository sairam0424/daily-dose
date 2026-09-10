import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError } from "@anthropic-ai/sdk";

// Declares ALL of node:fs/promises's mocked functions up front, even
// mockWriteFile (not exercised until Task 7's tests) - Vitest only allows
// ONE vi.mock() factory per module path per file, so later tasks in this
// same file reuse these variables instead of calling vi.mock() again.
const mockReaddir = vi.fn();
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockMkdir = vi.fn();
vi.mock("node:fs/promises", () => ({
  readdir: (...args: unknown[]) => mockReaddir(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  mkdir: (...args: unknown[]) => mockMkdir(...args),
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
  // A plain `function` (not an arrow function) is required here so the
  // mock stays constructible - the real SDK client is instantiated via
  // `new AnthropicBedrock(...)`, and arrow functions have no
  // `[[Construct]]` slot. Vitest 4 enforces this natively (it no longer
  // papers over it the way 3.x did) - see https://vitest.dev/api/vi#vi-spyon.
  AnthropicBedrock: vi.fn().mockImplementation(function () {
    return { messages: { create: mockCreate } };
  }),
}));

const { researchItem, MAX_TURNS } =
  await import("../scripts/deepResearchItem.js");
const { MODEL_CHAIN } = await import("../src/lib/llmCuration.js");

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

  it("returns status: incomplete when model responds with text-only and no tool calls", async () => {
    mockCreate.mockResolvedValueOnce(textOnlyMessage());

    const result = await researchItem("hn-49541888");
    expect(result.status).toBe("incomplete");
    expect(result.turnsUsed).toBe(1);
    expect(result.sourcesConsulted).toEqual([]);
  });

  it("falls back to the next model in the chain on NotFoundError from the primary model", async () => {
    mockCreate
      .mockRejectedValueOnce(
        new NotFoundError(
          404,
          {},
          "model not found",
          new Headers(),
          "not_found_error",
        ),
      )
      .mockResolvedValueOnce(
        toolUseMessage(
          "submit_findings",
          {
            deepAnalysis: "A real, fallback-model finding.",
            sourcesConsulted: [],
            confidence: "medium",
          },
          "tool_1",
        ),
      );

    const result = await researchItem("hn-49541888");

    expect(result.status).toBe("complete");
    expect(result.deepAnalysis).toBe("A real, fallback-model finding.");
    // Only one turn of the outer loop ran - the retry within
    // callWithModelFallback happened inside that single turn, not as a
    // second pass through the turn loop.
    expect(result.turnsUsed).toBe(1);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("throws (does not silently swallow) an error class that is not NotFoundError/BadRequestError", async () => {
    mockCreate.mockRejectedValueOnce(
      new Error("some unexpected network failure"),
    );

    await expect(researchItem("hn-49541888")).rejects.toThrow(
      /unexpected network failure/,
    );
    // Did not try further models for a non-fallback-eligible error.
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("throws a clear error when every model in MODEL_CHAIN fails with NotFoundError", async () => {
    mockCreate.mockRejectedValue(
      new NotFoundError(
        404,
        {},
        "model not found",
        new Headers(),
        "not_found_error",
      ),
    );

    await expect(researchItem("hn-49541888")).rejects.toThrow();
    // Every model in the chain got a chance, not just the first.
    expect(mockCreate).toHaveBeenCalledTimes(MODEL_CHAIN.length);
  });

  it("throws the exact last SyntaxError (strict identity) when every model in MODEL_CHAIN fails with malformed JSON", async () => {
    // Permanent regression test for a scenario an adversarial audit verified
    // empirically but did not leave behind: an all-SyntaxError run across
    // the full chain must still call every model exactly once, then throw
    // the LAST model's actual error object - not a generic wrapper, and not
    // an early bail-out after the first failure.
    const errors = MODEL_CHAIN.map(
      (_, i) => new SyntaxError(`Unexpected end of JSON input (model ${i})`),
    );
    for (const err of errors) {
      mockCreate.mockRejectedValueOnce(err);
    }

    await expect(researchItem("hn-49541888")).rejects.toBe(
      errors[errors.length - 1],
    );
    expect(mockCreate).toHaveBeenCalledTimes(MODEL_CHAIN.length);
  });

  it("falls back to the next model in the chain on a SyntaxError (malformed JSON) from the primary model", async () => {
    // Matches llmCuration.ts's own documented Bedrock quirk (a malformed/
    // truncated response can surface as a SyntaxError) - this loop must
    // retry the next model exactly like scoreItemsWithLLM does, not treat
    // it as a fatal, non-retryable error.
    mockCreate
      .mockRejectedValueOnce(new SyntaxError("Unexpected end of JSON input"))
      .mockResolvedValueOnce(
        toolUseMessage(
          "submit_findings",
          {
            deepAnalysis:
              "A real, fallback-model finding after malformed JSON.",
            sourcesConsulted: [],
            confidence: "medium",
          },
          "tool_1",
        ),
      );

    const result = await researchItem("hn-49541888");

    expect(result.status).toBe("complete");
    expect(result.deepAnalysis).toBe(
      "A real, fallback-model finding after malformed JSON.",
    );
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("records the model actually used on the final turn, not always MODEL_CHAIN[0], when incomplete", async () => {
    // Turn 1 succeeds on the primary model, turn 2 (the last, since we
    // fill every turn with a tool call and never submit_findings) falls
    // back to the SECOND model in the chain - the persisted "incomplete"
    // result's model field must reflect that fallback model, not silently
    // default back to MODEL_CHAIN[0].
    for (let i = 0; i < MAX_TURNS - 1; i++) {
      mockCreate.mockResolvedValueOnce(
        toolUseMessage("fetch_hn_thread", {}, `tool_${i}`),
      );
    }
    mockCreate.mockResolvedValueOnce(
      (() => {
        const msg = toolUseMessage("fetch_hn_thread", {}, "tool_last");
        msg.model = MODEL_CHAIN[1];
        return msg;
      })(),
    );

    const result = await researchItem("hn-49541888");

    expect(result.status).toBe("incomplete");
    expect(result.model).toBe(MODEL_CHAIN[1]);
  });
});

vi.mock("node:fs", () => ({ existsSync: vi.fn() }));

const { main } = await import("../scripts/deepResearchItem.js");
const { existsSync } = await import("node:fs");

describe("main (CLI)", () => {
  const ORIGINAL_ARGV = [...process.argv];
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env.BEDROCK_ACCESS_KEY_ID = "test";
    process.env.BEDROCK_SECRET_ACCESS_KEY = "test";
    mockReaddir.mockResolvedValue(["2026-09-06"]);
    mockReadFile.mockResolvedValue(validDigestItemJson());
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    (existsSync as any).mockReturnValue(false);
    vi.stubGlobal("fetch", vi.fn());
    mockCreate.mockReset();
  });

  afterEach(() => {
    process.argv = [...ORIGINAL_ARGV];
    process.env = { ...ORIGINAL_ENV };
    mockWriteFile.mockReset();
    mockMkdir.mockReset();
    vi.unstubAllGlobals();
  });

  it("throws a usage error when --id is missing", async () => {
    process.argv = ["node", "deepResearchItem.ts"];
    await expect(main()).rejects.toThrow(/Usage: deepResearchItem/);
  });

  it("refuses to publish when the item id does not exist", async () => {
    process.argv = [
      "node",
      "deepResearchItem.ts",
      "--id=hn-does-not-exist",
      "--publish",
    ];
    mockReadFile.mockRejectedValue(new Error("ENOENT"));
    await expect(main()).rejects.toThrow(/No committed digest item found/);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("refuses to overwrite an existing result without --force", async () => {
    (existsSync as any).mockReturnValue(true);
    process.argv = [
      "node",
      "deepResearchItem.ts",
      "--id=hn-49541888",
      "--publish",
    ];
    await expect(main()).rejects.toThrow(/already exists.*--force/);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("writes the result file when --publish is passed and no conflict exists", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 49541888, title: "t", children: [] }),
    });
    mockCreate.mockResolvedValueOnce(
      toolUseMessage(
        "submit_findings",
        {
          deepAnalysis: "Real finding.",
          sourcesConsulted: ["fetch_hn_thread"],
          confidence: "high",
        },
        "tool_1",
      ),
    );
    process.argv = [
      "node",
      "deepResearchItem.ts",
      "--id=hn-49541888",
      "--publish",
    ];

    await main();

    // Regression test for a real bug found during a live end-to-end audit:
    // writeFile crashed with ENOENT because src/data/deep-research/ is never
    // created on a fresh checkout (unlike src/data/digest/, which is always
    // committed). mkdir(..., {recursive: true}) must run before writeFile.
    expect(mockMkdir).toHaveBeenCalledWith("src/data/deep-research", {
      recursive: true,
    });
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const [path, contents] = mockWriteFile.mock.calls[0];
    expect(path).toContain("src/data/deep-research/hn-49541888.json");
    expect(JSON.parse(contents as string).deepAnalysis).toBe("Real finding.");
  });

  it("does not write anything when --publish is not passed", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 49541888, title: "t", children: [] }),
    });
    mockCreate.mockResolvedValueOnce(
      toolUseMessage(
        "submit_findings",
        {
          deepAnalysis: "Real finding.",
          sourcesConsulted: ["fetch_hn_thread"],
          confidence: "high",
        },
        "tool_1",
      ),
    );
    process.argv = ["node", "deepResearchItem.ts", "--id=hn-49541888"];

    await main();

    expect(mockWriteFile).not.toHaveBeenCalled();
  });
});
