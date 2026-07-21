/**
 * Shared client for cognee's knowledge-graph API — either the self-hosted
 * worker (integrations/cognee-worker/, behind its Caddy auth proxy) or Cognee
 * Cloud (docs.cognee.ai/cognee-cloud), both configured the same way via
 * COGNEE_WORKER_URL/COGNEE_WORKER_SECRET. Both functions return null/false on
 * ANY failure (missing config, offline worker, timeout, bad response) — same
 * null-fallback contract as askBrain()/embed()/categorizeVendor(), so nothing
 * that calls these ever needs a special case for "the worker isn't deployed
 * yet" or "cognee is down."
 *
 * Endpoint contract (verified against docs.cognee.ai — same API surface for
 * both self-hosted and Cognee Cloud):
 *   - remember: POST /api/v1/remember, multipart/form-data (`data` file +
 *     `datasetName`) — the documented Cloud shape; a plain-text note is sent
 *     as a virtual `.txt` file since text/markdown are supported input types.
 *   - search:   POST /api/v1/search, JSON body — replaces the older
 *     /api/v1/recall this file used to call against the self-hosted worker.
 *   - auth: `X-Api-Key: <key>` only. Cognee's docs list `Authorization:
 *     Bearer <JWT_TOKEN>` as an alternative, but that's for an actual JWT —
 *     sending a plain API-key string as a Bearer token gets rejected with
 *     401 "Invalid header" (confirmed against a live Cognee Cloud tenant)
 *     before X-Api-Key is even checked, so send X-Api-Key alone.
 */

const TIMEOUT_MS = 15000; // entity/relationship extraction is slower than a plain completion
const DATASET_NAME = "oslife"; // one shared graph across all sources — the point is cross-source links

function workerConfig(): { url: string; secret: string } | null {
  const url = Deno.env.get("COGNEE_WORKER_URL");
  const secret = Deno.env.get("COGNEE_WORKER_SECRET");
  if (!url || !secret) return null;
  return { url: url.replace(/\/$/, ""), secret };
}

function authHeaders(secret: string): Record<string, string> {
  return { "x-api-key": secret };
}

/** Feed one note's text into the knowledge graph. Fire-and-forget by callers — never throws. */
export async function cogneeRemember(text: string): Promise<boolean> {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const cfg = workerConfig();
  if (!cfg) return false;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const form = new FormData();
    form.set("data", new Blob([trimmed], { type: "text/plain" }), "note.txt");
    form.set("datasetName", DATASET_NAME);
    const res = await fetch(`${cfg.url}/api/v1/remember`, {
      method: "POST",
      signal: ctrl.signal,
      headers: authHeaders(cfg.secret), // no content-type: fetch sets the multipart boundary itself
      body: form,
    });
    if (!res.ok) console.error(`cogneeRemember: ${res.status} ${(await res.text()).slice(0, 300)}`);
    return res.ok;
  } catch (e) {
    console.error(`cogneeRemember: ${String(e)}`);
    return false;
  } finally {
    clearTimeout(t);
  }
}

/**
 * cognee's /api/v1/search returns an array of `{ search_result, dataset_id,
 * dataset_name }` objects (per docs.cognee.ai) rather than a single object —
 * read defensively since the exact inner shape of search_result isn't fully
 * pinned down for every search type.
 */
export function extractInsight(payload: unknown): string | null {
  if (!payload) return null;

  const fromOne = (r: Record<string, unknown>): string | null => {
    const candidate = r.search_result ?? r.answer ?? r.result ?? r.text;
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (Array.isArray(candidate) && candidate.length) return candidate.map(String).join("\n");
    return null;
  };

  if (Array.isArray(payload)) {
    const parts = payload
      .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
      .map(fromOne)
      .filter((s): s is string => !!s);
    return parts.length ? parts.join("\n\n") : null;
  }
  if (typeof payload === "object") return fromOne(payload as Record<string, unknown>);
  return null;
}

/** cogneeRecall() + extractInsight() in one call — the shape every caller actually wants. */
export async function cogneeInsight(query: string): Promise<string | null> {
  return extractInsight(await cogneeRecall(query));
}

/** Query the knowledge graph. Returns the raw search payload, or null if unavailable. */
export async function cogneeRecall(query: string): Promise<unknown | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const cfg = workerConfig();
  if (!cfg) return null;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.url}/api/v1/search`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", ...authHeaders(cfg.secret) },
      body: JSON.stringify({
        query: trimmed,
        searchType: "GRAPH_COMPLETION",
        datasets: [DATASET_NAME],
        topK: 10,
      }),
    });
    if (!res.ok) {
      console.error(`cogneeRecall: ${res.status} ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error(`cogneeRecall: ${String(e)}`);
    return null;
  } finally {
    clearTimeout(t);
  }
}
