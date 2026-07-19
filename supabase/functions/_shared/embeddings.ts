/**
 * Shared Voyage AI embeddings plumbing for Deno / Supabase Edge Functions.
 * Used by embed-memory, embed-memory-backfill and memory-search. Anthropic has
 * no embeddings endpoint of its own — Voyage AI is its recommended partner and
 * is cheap enough for this app's single-user scale.
 *
 * Mirrors the askBrain()/categorizeVendor() null-fallback contract: embed()
 * never throws, it returns null on any failure (missing key, network error,
 * bad response) so every caller can degrade to the pre-embeddings behaviour.
 */

const VOYAGE_API = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-3.5-lite"; // 1024 dimensions — matches the `vector(1024)` columns

/** Embed one piece of text. Returns null if VOYAGE_API_KEY is unset or the call fails. */
export async function embed(text: string, inputType: "document" | "query" = "document"): Promise<number[] | null> {
  const apiKey = Deno.env.get("VOYAGE_API_KEY");
  const trimmed = text.trim();
  if (!apiKey || !trimmed) return null;

  try {
    const res = await fetch(VOYAGE_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        input: [trimmed.slice(0, 8000)],
        model: VOYAGE_MODEL,
        input_type: inputType,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const vec = data?.data?.[0]?.embedding;
    return Array.isArray(vec) ? vec : null;
  } catch {
    return null;
  }
}
