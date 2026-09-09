/**
 * src/lib/deepResearchSchema.ts
 *
 * Deliberately separate from src/lib/digestSchema.ts - the on-demand
 * deep-research tool must never share a schema (or storage location) with
 * the core digest pipeline. See docs/superpowers/specs/
 * 2026-09-09-deep-research-item-design.md's isolation decision.
 */
import { z } from "zod";

export const DeepResearchResultSchema = z.object({
  itemId: z.string().min(1),
  generatedAt: z.string().min(1),
  model: z.string().min(1),
  turnsUsed: z.number().int().min(1),
  status: z.enum(["complete", "incomplete"]),
  sourcesConsulted: z.array(z.string()),
  deepAnalysis: z.string().min(1),
  confidence: z.enum(["high", "medium", "low"]),
});

export type DeepResearchResult = z.infer<typeof DeepResearchResultSchema>;

/** What the model itself supplies via the submit_findings tool call - the
 * engine fills in itemId/generatedAt/model/turnsUsed/status itself. */
export const SubmitFindingsInputSchema = z.object({
  deepAnalysis: z.string().min(1),
  sourcesConsulted: z.array(z.string()),
  confidence: z.enum(["high", "medium", "low"]),
});

export type SubmitFindingsInput = z.infer<typeof SubmitFindingsInputSchema>;
