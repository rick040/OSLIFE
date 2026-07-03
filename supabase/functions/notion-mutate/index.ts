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

import { getPage, updatePage, type NotionPage } from "../_shared/notion.ts";
import { CORS, bearerToken, corsPreflight, jsonResponder } from "../_shared/http.ts";

const SYNC_SECRET = Deno.env.get("SYNC_SECRET") ?? "";

// Reverse of the read-side STATUS_MAP in notion-sync: app status → Notion name.
const PROJECT_STATUS_TO_NOTION: Record<string, string> = {
  active:  "In uitvoering",
  lead:    "Gepland",
  blocked: "Gepauzeerd",
  done:    "Opgeleverd",
  review:  "In uitvoering",
};

const json = jsonResponder(CORS);

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
  if (req.method === "OPTIONS") return corsPreflight(CORS);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // verify_jwt is enabled at the gateway, so the caller already holds a valid
  // project JWT (the app forwards the session token via functions.invoke). We
  // additionally accept SYNC_SECRET for trusted server-side callers.
  const auth = bearerToken(req);
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
