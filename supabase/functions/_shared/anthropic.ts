/**
 * Shared Anthropic Messages API plumbing for Deno / Supabase Edge Functions.
 * Used by braindump-ingest, categorize-vendor and heyra-brain — the endpoint /
 * version / model constants plus the two response-parsing helpers they all
 * duplicated. No business logic lives here.
 */

export const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";
export const MODEL = "claude-haiku-4-5-20251001";

/** Request headers for a Messages API call. */
export function anthropicHeaders(apiKey: string): Record<string, string> {
  return {
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
    "content-type": "application/json",
  };
}

/** Concatenate the text blocks of a Messages API response `content` array. */
export function extractText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((b): b is { type: string; text?: string } => !!b && (b as { type: string }).type === "text")
    .map((b) => b.text ?? "")
    .join("\n")
    .trim();
}

/** Parse a fenced ```json block (or the first {...} blob) out of model text. Null on failure. */
export function parseJsonBlock(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  // Fall back to the first {...} block if there's no fence.
  const braced = candidate.match(/\{[\s\S]*\}/);
  try {
    const parsed = JSON.parse((braced ? braced[0] : candidate).trim());
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
