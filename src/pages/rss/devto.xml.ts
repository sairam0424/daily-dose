import type { APIContext } from "astro";
import { buildSourceFeed } from "../../lib/perSourceRss.js";

export async function GET(context: APIContext): Promise<Response> {
  return buildSourceFeed(context, "devto");
}
