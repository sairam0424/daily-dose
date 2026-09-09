import { describe, expect, it } from "vitest";
import {
  DeepResearchResultSchema,
  SubmitFindingsInputSchema,
} from "../src/lib/deepResearchSchema.js";

function validResult() {
  return {
    itemId: "hn-49541888",
    generatedAt: "2026-09-09T12:00:00.000Z",
    model: "us.anthropic.claude-sonnet-5",
    turnsUsed: 3,
    status: "complete" as const,
    sourcesConsulted: ["fetch_hn_thread"],
    deepAnalysis: "A real multi-sentence analysis.",
    confidence: "high" as const,
  };
}

describe("DeepResearchResultSchema", () => {
  it("accepts a valid complete result", () => {
    expect(() => DeepResearchResultSchema.parse(validResult())).not.toThrow();
  });

  it("accepts status: incomplete", () => {
    expect(() =>
      DeepResearchResultSchema.parse({
        ...validResult(),
        status: "incomplete",
      }),
    ).not.toThrow();
  });

  it("rejects a missing deepAnalysis", () => {
    const { deepAnalysis, ...rest } = validResult();
    expect(() => DeepResearchResultSchema.parse(rest)).toThrow();
  });

  it("rejects an invalid status value", () => {
    expect(() =>
      DeepResearchResultSchema.parse({ ...validResult(), status: "done" }),
    ).toThrow();
  });

  it("rejects an invalid confidence value", () => {
    expect(() =>
      DeepResearchResultSchema.parse({
        ...validResult(),
        confidence: "certain",
      }),
    ).toThrow();
  });
});

describe("SubmitFindingsInputSchema", () => {
  it("accepts a valid submission", () => {
    expect(() =>
      SubmitFindingsInputSchema.parse({
        deepAnalysis: "Findings here.",
        sourcesConsulted: ["fetch_arxiv_fulltext"],
        confidence: "medium",
      }),
    ).not.toThrow();
  });

  it("rejects an empty deepAnalysis", () => {
    expect(() =>
      SubmitFindingsInputSchema.parse({
        deepAnalysis: "",
        sourcesConsulted: [],
        confidence: "low",
      }),
    ).toThrow();
  });
});
