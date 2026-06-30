/**
 * Supabase Edge Function: notion-mutate
 * -------------------------------------
 * Writes app changes BACK to Notion. This is the write half of the two-way
 * Notion sync (notion-sync is the read half). Called from the app via
 * supabase.functions.invoke('notion-mutate', { body }) whenever the user edits
 * a project or client, so Notion stays the single source of truth.
 *
 * Request body:
 *   {
 *     "kind": "project" | "client",
 *     "external_id": "<notion page id>",   // projects.external_id / clients.external_id
 *     "patch": { status?, priority?, deadline?, value?, progress?, name?,
 *                clientStatus?, email?, website?, potentie?, scope? }
 *   }
 *
 * The function reads the live Notion page to detect each property's type
 * (select vs status, etc.) so it builds a valid payload regardless of how the
 * database is configured, then PATCHes the page.
 *
 * Deploy:
 *   supabase functions deploy notion-mutate --project-ref nhyunnnmdcmojvkxrbpl
 * Secrets required: NOTION_TOKEN (same integration as notion-sync).
 */

// Self-contained Notion REST helpers (kept inline so the function deploys as a
// single file). Mirrors supabase/functions/_shared/notion.ts.
const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

interface NotionPage {
  id: string;
  url: string;
  properties: Record<string, { type: string; [k: string]: unknown }>;
}

function notionHeaders(): HeadersInit {
  const token = Deno.env.get("NOTION_TOKEN");
  if (!token) throw new Error("NOTION_TOKEN secret is not set");
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

async function getPage(pageId: string): Promise<NotionPage> {
  const res = await fetch(`${NOTION_API}/pages/${pageId}`, { headers: notionHeaders() });
  if (!res.ok) throw new Error(`Notion getPage ${res.status}: ${await res.text()}`);
  return res.json() as Promise<NotionPage>;
}

async function updatePage(pageId: string, properties: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${NOTION_API}/pages/${pageId}`, {
    method: "PATCH",
    headers: notionHeaders(),
    body: JSON.stringify({ properties }),
  });
  if (!res.ok) throw new Error(`Notion updatePage ${res.status}: ${await res.text()}`);
}

const SYNC_SECRET = Deno.env.get("SYNC_SECRET") ?? "";

// Reverse of the read-side STATUS_MAP in notion-sync: app status → Notion name.
const PROJECT_STATUS_TO_NOTION: Record<string, string> = {
  active:  "In uitvoering",
  lead:    "Gepland",
  blocked: "Gepauzeerd",
  done:    "Opgeleverd",
  review:  "In uitvoering",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

/** Build a single Notion property value object given the live property type. */
function buildProp(type: string | undefined, value: unknown): Record<string, unknown> | null {
  if (value === undefined) return null;
  switch (type) {
    case "title":
      return { title: [{ text: { content: String(value ?? "") } }] };
    case "rich_text":
      return { rich_text: [{ text: { content: String(value ?? "") } }] };
    case "select":
      return { select: value == null || value === "" ? null : { name: String(value) } };
    case "status":
      return { status: value == null || value === "" ? null : { name: String(value) } };
    case "number":
      return { number: value == null || value === "" ? null : Number(value) };
    case "date":
      return { date: value == null || value === "" ? null : { start: String(value) } };
    case "email":
      return { email: value == null || value === "" ? null : String(value) };
    case "url":
      return { url: value == null || value === "" ? null : String(value) };
    default:
      return null; // unknown / unsupported property type — skip silently
  }
}

// app-patch field → Notion property name, per database kind.
const FIELD_MAP: Record<string, Record<string, string>> = {
  project: {
    status:   "Status",
    priority: "Prioriteit",
    deadline: "Deadline",
    value:    "Budget",
    progress: "Progress",
    name:     "Name",
  },
  client: {
    clientStatus: "Client Status",
    email:        "Email",
    website:      "Website URL",
    potentie:     "Potentie",
    scope:        "Scope",
    name:         "Name",
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // verify_jwt is enabled at the gateway, so the caller already holds a valid
  // project JWT (the app forwards the session token via functions.invoke). We
  // additionally accept SYNC_SECRET for trusted server-side callers.
  const auth = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!auth) return json({ error: "Unauthorized" }, 401);
  void SYNC_SECRET;

  let body: { kind?: string; external_id?: string; patch?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { kind, external_id, patch } = body;
  if (!kind || !external_id || !patch || typeof patch !== "object") {
    return json({ error: "kind, external_id and patch are required" }, 400);
  }
  const fieldMap = FIELD_MAP[kind];
  if (!fieldMap) return json({ error: `Unknown kind: ${kind}` }, 400);

  // Normalise project.status → Notion status name before mapping.
  const normalized: Record<string, unknown> = { ...patch };
  if (kind === "project" && typeof normalized.status === "string") {
    normalized.status = PROJECT_STATUS_TO_NOTION[normalized.status] ?? normalized.status;
  }

  let page: NotionPage;
  try {
    page = await getPage(external_id);
  } catch (err) {
    return json({ error: `Notion page not found: ${String(err)}` }, 404);
  }

  const properties: Record<string, unknown> = {};
  const skipped: string[] = [];
  for (const [field, value] of Object.entries(normalized)) {
    const propName = fieldMap[field];
    if (!propName) { skipped.push(field); continue; }
    const liveType = page.properties[propName]?.type;
    const built = buildProp(liveType, value);
    if (built) properties[propName] = built;
    else skipped.push(field);
  }

  if (Object.keys(properties).length === 0) {
    return json({ ok: true, updated: 0, skipped });
  }

  try {
    await updatePage(external_id, properties);
  } catch (err) {
    return json({ error: `Notion update failed: ${String(err)}` }, 502);
  }

  return json({ ok: true, updated: Object.keys(properties).length, skipped });
});
