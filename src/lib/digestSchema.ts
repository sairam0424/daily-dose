import { z } from "zod";

const httpUrlSchema = z.string().refine(
  (value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  },
  { message: "must be an http(s) URL" },
);

export const DigestItemSchema = z.object({
  title: z.string().min(1),
  source: z.enum(["hn", "arxiv", "github", "devto"]),
  url: httpUrlSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tags: z.array(z.string()).default([]),
  interest_score: z.number().min(0).max(10),
  why_read: z.string().min(1),
  analysis: z.string().min(1).optional(),
  authors: z.array(z.string()).default([]),
  hn_id: z.number().optional(),
  points: z.number().optional(),
  stars: z.number().optional(),
  reactions: z.number().optional(),
  reading_minutes: z.number().optional(),
  image_url: httpUrlSchema.optional(),
  favicon_url: httpUrlSchema.optional(),
});

export type DigestItem = z.infer<typeof DigestItemSchema>;
