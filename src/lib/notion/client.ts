/**
 * Notion REST API client — server-side only (requires NOTION_TOKEN).
 * Used as a blueprint; the actual runtime code lives in
 * supabase/functions/_shared/notion.ts (Deno) and
 * integrations/apps-script/Code.gs (Google Apps Script).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const process: { env: Record<string, string | undefined> };

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

function headers() {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("NOTION_TOKEN env var is not set");
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

export async function queryDatabase(
  databaseId: string,
  filter?: Record<string, unknown>,
  sorts?: Array<{ property: string; direction: "ascending" | "descending" }>
): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | undefined;

  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    if (filter) body.filter = filter;
    if (sorts) body.sorts = sorts;

    const res = await fetch(`${NOTION_API}/databases/${databaseId}/query`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Notion API error ${res.status}: ${err}`);
    }

    const data = (await res.json()) as {
      results: NotionPage[];
      next_cursor: string | null;
      has_more: boolean;
    };
    pages.push(...data.results);
    cursor = data.has_more && data.next_cursor ? data.next_cursor : undefined;
  } while (cursor);

  return pages;
}

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
  | { type: "phone_number"; phone_number: string | null }
  | { type: "relation"; relation: Array<{ id: string }> }
  | { type: "formula"; formula: { type: string; string?: string; number?: number | null; boolean?: boolean } }
  | { type: "rollup"; rollup: unknown }
  | { type: "checkbox"; checkbox: boolean }
  | { type: "files"; files: Array<unknown> };

export function getText(prop?: NotionProperty): string {
  if (!prop) return "";
  if (prop.type === "title") return prop.title.map((t) => t.plain_text).join("");
  if (prop.type === "rich_text") return prop.rich_text.map((t) => t.plain_text).join("");
  return "";
}

export function getSelect(prop?: NotionProperty): string | null {
  if (!prop) return null;
  if (prop.type === "select") return prop.select?.name ?? null;
  if (prop.type === "status") return prop.status?.name ?? null;
  return null;
}

export function getMultiSelect(prop?: NotionProperty): string[] {
  if (!prop || prop.type !== "multi_select") return [];
  return prop.multi_select.map((o) => o.name);
}

export function getNumber(prop?: NotionProperty): number | null {
  if (!prop || prop.type !== "number") return null;
  return prop.number;
}

export function getDate(prop?: NotionProperty): string | null {
  if (!prop || prop.type !== "date") return null;
  return prop.date?.start ?? null;
}

export function getEmail(prop?: NotionProperty): string | null {
  if (!prop || prop.type !== "email") return null;
  return prop.email;
}

export function getUrl(prop?: NotionProperty): string | null {
  if (!prop || prop.type !== "url") return null;
  return prop.url;
}

export function getRelation(prop?: NotionProperty): string[] {
  if (!prop || prop.type !== "relation") return [];
  return prop.relation.map((r) => r.id);
}

export function getCheckbox(prop?: NotionProperty): boolean {
  if (!prop || prop.type !== "checkbox") return false;
  return prop.checkbox;
}

export interface NotionBlock {
  id: string;
  type: string;
  has_children: boolean;
  [key: string]: unknown;
}

export async function getPage(pageId: string): Promise<NotionPage> {
  const res = await fetch(`${NOTION_API}/pages/${pageId}`, {
    headers: headers(),
  });
  if (!res.ok) throw new Error(`Notion getPage ${res.status}: ${await res.text()}`);
  return res.json() as Promise<NotionPage>;
}

export async function getBlocks(blockId: string): Promise<NotionBlock[]> {
  const blocks: NotionBlock[] = [];
  let cursor: string | undefined;
  do {
    const url = new URL(`${NOTION_API}/blocks/${blockId}/children`);
    url.searchParams.set("page_size", "100");
    if (cursor) url.searchParams.set("start_cursor", cursor);
    const res = await fetch(url.toString(), { headers: headers() });
    if (!res.ok) throw new Error(`Notion getBlocks ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as {
      results: NotionBlock[];
      next_cursor: string | null;
      has_more: boolean;
    };
    blocks.push(...data.results);
    cursor = data.has_more && data.next_cursor ? data.next_cursor : undefined;
  } while (cursor);
  return blocks;
}

export async function updatePage(
  pageId: string,
  properties: Record<string, unknown>
): Promise<NotionPage> {
  const res = await fetch(`${NOTION_API}/pages/${pageId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ properties }),
  });
  if (!res.ok) throw new Error(`Notion updatePage ${res.status}: ${await res.text()}`);
  return res.json() as Promise<NotionPage>;
}

export async function createDatabasePage(
  databaseId: string,
  properties: Record<string, unknown>,
  children?: unknown[]
): Promise<NotionPage> {
  const body: Record<string, unknown> = {
    parent: { database_id: databaseId },
    properties,
  };
  if (children) body.children = children;
  const res = await fetch(`${NOTION_API}/pages`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Notion createDatabasePage ${res.status}: ${await res.text()}`);
  return res.json() as Promise<NotionPage>;
}

export async function archivePage(pageId: string): Promise<void> {
  const res = await fetch(`${NOTION_API}/pages/${pageId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ archived: true }),
  });
  if (!res.ok) throw new Error(`Notion archivePage ${res.status}: ${await res.text()}`);
}
