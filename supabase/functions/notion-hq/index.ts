/**
 * Supabase Edge Function: notion-hq
 * -----------------------------------
 * Returns live callout data from the 3 master HQ project pages in Notion.
 * Called directly from StrategieHQ.tsx via supabase.functions.invoke().
 *
 * Deploy:
 *   supabase functions deploy notion-hq --project-ref nhyunnnmdcmojvkxrbpl
 *
 * Secrets required:
 *   NOTION_TOKEN (same as notion-sync)
 */

import { getBlocks, type NotionBlock } from "../_shared/notion.ts";

const HQ_PAGES = [
  {
    key:       "buurtkaart",
    id:        "268ddc8e920880a987a0ff40d2c19a7c",
    name:      "Geldrop Buurtkaart",
    emoji:     "🗺️",
    notionUrl: "https://app.notion.com/p/Geldrop-Buurtkaart-268ddc8e920880a987a0ff40d2c19a7c",
    appUrl:    "/projects/geldrop",
  },
  {
    key:       "eyes",
    id:        "386ddc8e920880538271f85f881577ac",
    name:      "The Eyes",
    emoji:     "👁️",
    notionUrl: "https://app.notion.com/p/THE-EYES-MANAGEMENT-386ddc8e920880538271f85f881577ac",
    appUrl:    "/projects/eyes",
  },
  {
    key:       "dakmeester",
    id:        "386ddc8e920880cf8cc7d39b4cd07e7a",
    name:      "Dakmeester",
    emoji:     "🏠",
    notionUrl: "https://app.notion.com/p/Dakmeester-386ddc8e920880cf8cc7d39b4cd07e7a",
    appUrl:    "/projects/dakmeester",
  },
] as const;

function blockRichText(block: NotionBlock, t: string): string {
  const c = (block as Record<string, unknown>)[t] as
    | { rich_text: Array<{ plain_text: string }> }
    | undefined;
  return c?.rich_text?.map((r) => r.plain_text).join("") ?? "";
}

async function fetchOne(page: typeof HQ_PAGES[number]) {
  const blocks   = await getBlocks(page.id);
  const callouts = blocks
    .filter((b) => b.type === "callout")
    .map((b) => blockRichText(b, "callout"))
    .filter(Boolean);

  const alert = callouts[0] ?? "";
  const focus = callouts[1] ?? callouts[0] ?? "";
  const phase = alert.split("|")[0]?.replace(/[*\s]+/g, " ").trim() ?? "";

  return {
    key:       page.key,
    name:      page.name,
    emoji:     page.emoji,
    notionUrl: page.notionUrl,
    appUrl:    page.appUrl,
    alert,
    focus,
    phase,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  try {
    const projects = await Promise.all(HQ_PAGES.map(fetchOne));
    return new Response(JSON.stringify({ projects }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
});
