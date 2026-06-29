/**
 * Notion HQ — reads live callout blocks from the 3 master project pages.
 *
 * Buurtkaart : 268ddc8e920880a987a0ff40d2c19a7c
 * The Eyes   : 386ddc8e920880538271f85f881577ac
 * Dakmeester : 386ddc8e920880cf8cc7d39b4cd07e7a
 *
 * Server-side only — consumed by supabase/functions/notion-hq/
 */

import { getBlocks, type NotionBlock } from "./client";

export const HQ_PAGE_IDS = {
  buurtkaart: "268ddc8e920880a987a0ff40d2c19a7c",
  eyes:       "386ddc8e920880538271f85f881577ac",
  dakmeester: "386ddc8e920880cf8cc7d39b4cd07e7a",
} as const;

export const HQ_NOTION_URLS = {
  buurtkaart: "https://app.notion.com/p/Geldrop-Buurtkaart-268ddc8e920880a987a0ff40d2c19a7c",
  eyes:       "https://app.notion.com/p/THE-EYES-MANAGEMENT-386ddc8e920880538271f85f881577ac",
  dakmeester: "https://app.notion.com/p/Dakmeester-386ddc8e920880cf8cc7d39b4cd07e7a",
} as const;

export type ProjectKey = keyof typeof HQ_PAGE_IDS;

export interface HqProject {
  key:       ProjectKey;
  name:      string;
  emoji:     string;
  notionUrl: string;
  appUrl:    string;
  alert:     string;
  focus:     string;
  phase:     string;
}

const META: Record<ProjectKey, { name: string; emoji: string; appUrl: string }> = {
  buurtkaart: { name: "Geldrop Buurtkaart", emoji: "🗺️", appUrl: "/projects/geldrop" },
  eyes:       { name: "The Eyes",           emoji: "👁️", appUrl: "/projects/eyes" },
  dakmeester: { name: "Dakmeester",         emoji: "🏠", appUrl: "/projects/dakmeester" },
};

function blockRichText(block: NotionBlock, t: string): string {
  const c = (block as Record<string, unknown>)[t] as
    | { rich_text: Array<{ plain_text: string }> }
    | undefined;
  return c?.rich_text?.map((r) => r.plain_text).join("") ?? "";
}

function extractCallouts(blocks: NotionBlock[]): string[] {
  return blocks
    .filter((b) => b.type === "callout")
    .map((b) => blockRichText(b, "callout"))
    .filter(Boolean);
}

async function fetchOne(key: ProjectKey): Promise<HqProject> {
  const blocks = await getBlocks(HQ_PAGE_IDS[key]);
  const callouts = extractCallouts(blocks);

  const alert = callouts[0] ?? "";
  const focus = callouts[1] ?? callouts[0] ?? "";
  const phase = alert.split("|")[0]?.replace(/[*\s]+/g, " ").trim() ?? "";

  return {
    key,
    ...META[key],
    notionUrl: HQ_NOTION_URLS[key],
    alert,
    focus,
    phase,
  };
}

export async function fetchHqProjects(): Promise<HqProject[]> {
  const [buurtkaart, eyes, dakmeester] = await Promise.all([
    fetchOne("buurtkaart"),
    fetchOne("eyes"),
    fetchOne("dakmeester"),
  ]);
  return [buurtkaart, eyes, dakmeester];
}
