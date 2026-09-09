/**
 * scripts/deepResearchItem.ts
 *
 * Maintainer-only CLI: runs a bounded, ReAct-shaped tool-use loop to
 * research one existing digest item more deeply than the daily batch pass.
 * Entirely isolated from scripts/pipeline.ts and src/data/digest/ - see
 * docs/superpowers/specs/2026-09-09-deep-research-item-design.md.
 *
 * Usage: npx tsx scripts/deepResearchItem.ts --id=<itemId> [--publish] [--force]
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DigestItemSchema, type DigestItem } from "../src/lib/digestSchema.js";

const DIGEST_DIR = "src/data/digest";

export async function findDigestItem(
  itemId: string,
): Promise<{ item: DigestItem; filePath: string }> {
  const dateDirs = await readdir(DIGEST_DIR);
  for (const dateDir of dateDirs) {
    const candidatePath = join(DIGEST_DIR, dateDir, `${itemId}.json`);
    let raw: string;
    try {
      raw = (await readFile(candidatePath, "utf-8")) as string;
    } catch {
      continue; // not in this date folder - try the next one
    }
    const item = DigestItemSchema.parse(JSON.parse(raw));
    return { item, filePath: candidatePath };
  }
  throw new Error(
    `No committed digest item found with id "${itemId}" under ${DIGEST_DIR}/`,
  );
}
