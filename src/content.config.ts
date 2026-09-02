import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { DigestItemSchema } from "./lib/digestSchema.js";

const digest = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "./src/data/digest" }),
  schema: DigestItemSchema,
});

export const collections = { digest };
