import type { APIContext } from "astro";
import { getCollection } from "astro:content";
import { groupEntriesByDate } from "../lib/digestGrouping.js";

export async function GET(_context: APIContext): Promise<Response> {
  const allEntries = await getCollection("digest");
  const dateGroups = groupEntriesByDate(allEntries);
  const latestGroup = dateGroups.length > 0 ? dateGroups[0] : null;
  const items = latestGroup
    ? latestGroup.entries.map((entry) => entry.data)
    : [];

  return new Response(JSON.stringify(items, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
