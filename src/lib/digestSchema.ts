import { z } from "zod";

export const DigestItemSchema = z.object({
  title: z.string().min(1),
  source: z.enum(["hn", "arxiv", "github"]),
  url: z.string().url(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tags: z.array(z.string()).default([]),
  interest_score: z.number().min(0).max(10),
  why_read: z.string().min(1),
  authors: z.array(z.string()).default([]),
  hn_id: z.number().optional(),
  points: z.number().optional(),
});

export type DigestItem = z.infer<typeof DigestItemSchema>;
