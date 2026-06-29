/**
 * Notion REST client for Deno / Supabase Edge Functions.
 * Mirrors src/lib/notion/client.ts but uses Deno.env instead of process.env
 * and omits Next.js-specific `next` fetch options.
 */

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

function getToken(): string {
  const token = Deno.env.get("NOTION_TOKEN");
  if (!token) throw new Error("NOTION_TOKEN secret is not set");
  return token;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NotionPage {
  id: string;
  url: string;
  properties: Record<string, NotionProperty>;
}

export type NotionProperty =
  | { type: "title"; title: Array<{ plain_text: string }> }
  | { type: "rich_text"; rich_text: Array<{ plain_text: string }> }
  | { type: "select"; select: { name: string } | null }
  | { type: "multi_select"; multi_select: Array<{ name: string }> }
  | { type: "status"; status: { name: string } | null }
  | { type: "number"; number: number | null }
  | { type: "date"; date: { start: string; end?: string | null } | null }
  | { type: "email"; email: string | null }
  | { type: "url"; url: string | null }
  | { type: "relation"; relation: Array<{ id: string }> }
  | { type: "checkbox"; checkbox: boolean }
  | { type: "files"; files: Array<unknown> }
  | { type: string; [key: string]: unknown };

export interface NotionBlock {
  id: string;
  type: string;
  has_children: boolean;
  [key: string]: unknown;
}

// ─── Property helpers ─────────────────────────────────────────────────────────

export function getText(prop?: NotionProperty): string {
  if (!prop) return "";
  if (prop.type === "title") return (prop as { type: "title"; title: Array<{ plain_text: string }> }).title.map((t) => t.plain_text).join("");
  if (prop.type === "rich_text") return (prop as { type: "rich_text"; rich_text: Array<{ plain_text: string }> }).rich_text.map((t) => t.plain_text).join("");
  return "";
}

export function getSelect(prop?: NotionProperty): string | null {
  if (!prop) return null;
  if (prop.type === "select") return (prop as { type: "select"; select: { name: string } | null }).select?.name ?? null;
  if (prop.type === "status") return (prop as { type: "status"; status: { name: string } | null }).status?.name ?? null;
  return null;
}

export function getMultiSelect(prop?: NotionProperty): string[] {
  if (!prop || prop.type !== "multi_select") return [];
  return (prop as { type: "multi_select"; multi_select: Array<{ name: string }> }).multi_select.map((o) => o.name);
}

export function getNumber(prop?: NotionProperty): number | null {
  if (!prop || prop.type !== "number") return null;
  return (prop as { type: "number"; number: number | null }).number;
}

export function getDate(prop?: NotionProperty): string | null {
  if (!prop || prop.type !== "date") return null;
  return (prop as { type: "date"; date: { start: string } | null }).date?.start ?? null;
}

export function getEmail(prop?: NotionProperty): string | null {
  if (!prop || prop.type !== "email") return null;
  return (prop as { type: "email"; email: string | null }).email;
}

export function getUrl(prop?: NotionProperty): string | null {
  if (!prop || prop.type !== "url") return null;
  return (prop as { type: "url"; url: string | null }).url;
}

export function getRelation(prop?: NotionProperty): string[] {
  if (!prop || prop.type !== "relation") return [];
  return (prop as { type: "relation"; relation: Array<{ id: string }> }).relation.map((r) => r.id);
}

export function getCheckbox(prop?: NotionProperty): boolean {
  if (!prop || prop.type !== "checkbox") return false;
  return (prop as { type: "checkbox"; checkbox: boolean }).checkbox;
}

// ─── API calls ────────────────────────────────────────────────────────────────

export async function queryDatabase(
  databaseId: string,
  filter?: Record<string, unknown>,
  sorts?: Array<{ property: string; direction: "ascending" | "descending" }>
): Promise<NotionPage[]> {
  const token = getToken();
  const pages: NotionPage[] = [];
  let cursor: string | undefined;

  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    if (filter) body.filter = filter;
    if (sorts) body.sorts = sorts;

    const res = await fetch(`${NOTION_API}/databases/${databaseId}/query`, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Notion queryDatabase ${res.status}: ${await res.text()}`);

    const data = await res.json() as {
      results: NotionPage[];
      next_cursor: string | null;
      has_more: boolean;
    };
    pages.push(...data.results);
    cursor = data.has_more && data.next_cursor ? data.next_cursor : undefined;
  } while (cursor);

  return pages;
}

export async function getBlocks(blockId: string): Promise<NotionBlock[]> {
  const token = getToken();
  const blocks: NotionBlock[] = [];
  let cursor: string | undefined;

  do {
    const url = new URL(`${NOTION_API}/blocks/${blockId}/children`);
    url.searchParams.set("page_size", "100");
    if (cursor) url.searchParams.set("start_cursor", cursor);
    const res = await fetch(url.toString(), { headers: headers(token) });
    if (!res.ok) throw new Error(`Notion getBlocks ${res.status}: ${await res.text()}`);
    const data = await res.json() as {
      results: NotionBlock[];
      next_cursor: string | null;
      has_more: boolean;
    };
    blocks.push(...data.results);
    cursor = data.has_more && data.next_cursor ? data.next_cursor : undefined;
  } while (cursor);

  return blocks;
}
