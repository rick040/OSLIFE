/**
 * Europe/Amsterdam date helpers shared by notify-tick and telegram-webhook.
 * Mirror the conventions in src/domains.ts on the frontend.
 */

/** Today's date as YYYY-MM-DD in Europe/Amsterdam. */
export function amsterdamToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" });
}

/** Days between two ISO dates (b - a). Same convention as src/domains.ts. */
export function daysBetween(a: string, b: string): number {
  const da = new Date(a.slice(0, 10) + "T00:00:00").getTime();
  const db = new Date(b.slice(0, 10) + "T00:00:00").getTime();
  return Math.round((db - da) / 86400000);
}

export function fmtDateNL(iso: string | null): string {
  if (!iso) return "geen datum";
  return new Date(iso.slice(0, 10) + "T00:00:00").toLocaleDateString("nl-NL", {
    month: "short",
    day: "numeric",
    timeZone: "Europe/Amsterdam",
  });
}

/**
 * Open-loop threads stored in brain_state.threads (same shape as src/types.ts).
 * Shared by notify-tick (reads) and telegram-webhook (reads + writes).
 */
export interface Thread {
  id: string;
  domain: string;
  title: string;
  owedTo: string;
  due: string | null;
  status: "open" | "closed";
  createdAt: string;
}
