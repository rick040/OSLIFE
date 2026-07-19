/**
 * Shared client for the cognee worker (integrations/cognee-worker/) — a real
 * knowledge-graph backend, reached through its Caddy auth proxy with a shared
 * secret bearer token. Both functions return null on ANY failure (missing
 * config, offline worker, timeout, bad response) — same null-fallback
 * contract as askBrain()/embed()/categorizeVendor(), so nothing that calls
 * these ever needs a special case for "the worker isn't deployed yet."
 */

const TIMEOUT_MS = 15000; // entity/relationship extraction is slower than a plain completion
const DATASET_NAME = "oslife"; // one shared graph across all sources — the point is cross-source links

function workerConfig(): { url: string; secret: string } | null {
  const url = Deno.env.get("COGNEE_WORKER_URL");
  const secret = Deno.env.get("COGNEE_WORKER_SECRET");
  if (!url || !secret) return null;
  return { url: url.replace(/\/$/, ""), secret };
}

async function callCognee(path: string, body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const cfg = workerConfig();
  if (!cfg) return null;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.url}${path}`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.secret}` },
      body: JSON.stringify({ ...body, dataset_name: DATASET_NAME }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Feed one note's text into the knowledge graph. Fire-and-forget by callers — never throws. */
export async function cogneeRemember(text: string): Promise<boolean> {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const result = await callCognee("/api/v1/remember", { text: trimmed });
  return result !== null;
}

/** Query the knowledge graph. Returns the raw recall payload, or null if unavailable. */
export async function cogneeRecall(query: string): Promise<Record<string, unknown> | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  return await callCognee("/api/v1/recall", { query_text: trimmed });
}
