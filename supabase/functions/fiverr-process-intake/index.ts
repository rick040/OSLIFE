/**
 * Supabase Edge Function: fiverr-process-intake
 * ------------------------------------------------
 * Step B of the Fiverr client/project intake pipeline. Invoked every 5
 * minutes by a pg_cron job via net.http_post with a bearer CRON_SECRET (same
 * pattern as notify-tick).
 *
 * fiverr-poll (step A) mirrors Fiverr gmail messages into `client_messages`.
 * Any message it couldn't tie to an active project lands with
 * project_id = NULL — that unassigned state IS the buffer this function
 * drains. For each distinct contact_key whose newest unassigned message is
 * at least DEBOUNCE_MINUTES old (no more messages likely incoming):
 *
 *   1. Concatenate all buffered messages (fullest available text, not the
 *      truncated Fiverr snippet) into one client brief.
 *   2. Ask Claude to draft: a title, deliverable packages + pricing (checking
 *      `service_packages` first, flagging anything estimated), and a
 *      ready-to-paste reply.
 *   3. Create/update the client (draft) + project (status='draft', never
 *      'active' — Rick reviews before promoting it).
 *   4. Generate the proposal/invoice Google Doc by calling the Apps Script
 *      Web App endpoint added to integrations/apps-script/Code.gs (Rick's own
 *      Google account creates the Doc — no service account). Failure here is
 *      non-fatal: the project/invoice still get created, just without a
 *      document_url, and the Telegram message says so.
 *   5. Create a draft `project_invoices` row and re-point the buffered
 *      messages at the new project.
 *   6. Send one Telegram notification with everything Rick needs to review.
 *
 * Deploy:
 *   supabase functions deploy fiverr-process-intake --project-ref nhyunnnmdcmojvkxrbpl
 * Secrets required: CRON_SECRET, ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN,
 * FIVERR_DOC_WEBHOOK_URL, FIVERR_DOC_WEBHOOK_SECRET (see README-fiverr-intake.md).
 * SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are auto-injected.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ANTHROPIC_API, MODEL, anthropicHeaders, extractText, parseJsonBlock } from "../_shared/anthropic.ts";
import { SUPABASE_SERVICE_KEY, SUPABASE_URL, USER_ID, bearerToken, jsonResponder } from "../_shared/http.ts";
import { sendMessage } from "../_shared/telegram.ts";

const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const DOC_WEBHOOK_URL = Deno.env.get("FIVERR_DOC_WEBHOOK_URL") ?? "";
const DOC_WEBHOOK_SECRET = Deno.env.get("FIVERR_DOC_WEBHOOK_SECRET") ?? "";

const DEBOUNCE_MINUTES = 30;
const BODY_TRUNCATION_THRESHOLD = 19900; // Apps Script caps gmail body sync at 20000 chars

const json = jsonResponder();

interface MessageRow {
  id: string;
  client_id: string | null;
  contact: string | null;
  contact_key: string;
  subject: string | null;
  snippet: string | null;
  body: string | null;
  ts: string;
}

interface ServicePackageRef {
  name: string;
  description: string | null;
  default_specs: string[];
  unit: string | null;
  default_unit_price: number | null;
}

interface DraftPackage {
  name: string;
  specs: string[];
  qty: number;
  unit: string;
  unitPrice: number;
}

interface DraftResult {
  title: string;
  clientDisplayName: string;
  packages: DraftPackage[];
  pricingIsEstimate: boolean;
  ambiguousNotes: string[];
  draftReply: string;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "client";
}

function fmtEUR(n: number): string {
  return `€${n.toFixed(2)}`;
}

// deno-lint-ignore no-explicit-any
async function loadServicePackages(sb: any): Promise<ServicePackageRef[]> {
  const { data } = await sb
    .from("service_packages")
    .select("name, description, default_specs, unit, default_unit_price")
    .eq("user_id", USER_ID)
    .eq("active", true);
  return (data ?? []) as ServicePackageRef[];
}

function buildSystemPrompt(pricingRef: ServicePackageRef[]): string {
  const refBlock = pricingRef.length
    ? pricingRef
        .map((p) => `- ${p.name} (${p.unit ?? "package"}, €${p.default_unit_price ?? "?"}): ${(p.default_specs ?? []).join(", ")}${p.description ? ` — ${p.description}` : ""}`)
        .join("\n")
    : "(no pricing reference configured yet — estimate reasonably and flag as an estimate)";

  return `You are the intake-drafting assistant for PRJCT Agency (Rick van Mierlo), a solo freelance design/branding/dev studio that gets most of its clients via Fiverr. You are given the full text of one or more incoming Fiverr messages from a client (concatenated in order) describing what they want.

Produce a JSON object with:
- "title": short project title (max 80 chars)
- "clientDisplayName": best-guess friendly name for the client from the message content (a first name if mentioned, otherwise fall back to whatever the Fiverr username looks like)
- "packages": array of deliverable packages. Group related items sensibly — could be 1 package or 5+, never force a fixed count. Each package: {"name": string, "specs": string[] (specific sub-items, e.g. "4 Instagram posts"), "qty": number, "unit": string (e.g. "package", "hour", "revision round"), "unitPrice": number in EUR}
- "pricingIsEstimate": true if ANY package price was not taken directly from the pricing reference below
- "ambiguousNotes": string[] — anything unclear about scope that Rick should double check (empty array if nothing)
- "draftReply": a reply to the client in the SAME language the client wrote in, professional but concise and friendly (matches how a freelance designer replies on Fiverr) — confirms understanding of scope and next steps, does not commit to a final price if pricingIsEstimate is true (say something like "I'll send over a detailed quote shortly")

Pricing reference (service_packages — check this FIRST before estimating):
${refBlock}

Business context: PRJCT Agency uses the KOR scheme (no BTW/VAT). Standard payment terms are 50% upfront, 50% on delivery — do not mention exact payment mechanics in the reply, that's handled separately.

Respond ONLY with a fenced \`\`\`json block, nothing else.`;
}

// deno-lint-ignore no-explicit-any
async function draftIntake(apiKey: string, brief: string, pricingRef: ServicePackageRef[]): Promise<DraftResult | null> {
  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: anthropicHeaders(apiKey),
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system: buildSystemPrompt(pricingRef),
      messages: [{ role: "user", content: `Client brief:\n"""\n${brief}\n"""` }],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const parsed = parseJsonBlock(extractText(data.content));
  if (!parsed) return null;

  const packages = Array.isArray(parsed.packages)
    ? (parsed.packages as unknown[]).map((p) => {
        const pp = p as Record<string, unknown>;
        return {
          name: String(pp.name ?? "Deliverable"),
          specs: Array.isArray(pp.specs) ? (pp.specs as unknown[]).map(String) : [],
          qty: Number(pp.qty) || 1,
          unit: String(pp.unit ?? "package"),
          unitPrice: Number(pp.unitPrice) || 0,
        };
      })
    : [];
  if (!packages.length) return null;

  return {
    title: String(parsed.title ?? "New Fiverr project"),
    clientDisplayName: String(parsed.clientDisplayName ?? ""),
    packages,
    pricingIsEstimate: !!parsed.pricingIsEstimate,
    ambiguousNotes: Array.isArray(parsed.ambiguousNotes) ? (parsed.ambiguousNotes as unknown[]).map(String) : [],
    draftReply: String(parsed.draftReply ?? ""),
  };
}

async function generateProposalDoc(opts: {
  clientName: string;
  projectTitle: string;
  packages: DraftPackage[];
  subtotal: number;
  total: number;
}): Promise<string | null> {
  if (!DOC_WEBHOOK_URL || !DOC_WEBHOOK_SECRET) return null;
  try {
    const res = await fetch(DOC_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: DOC_WEBHOOK_SECRET,
        clientName: opts.clientName,
        projectTitle: opts.projectTitle,
        packages: opts.packages.map((p) => ({
          name: p.name,
          specs: p.specs,
          qty: p.qty,
          unitPrice: p.unitPrice,
          total: p.qty * p.unitPrice,
        })),
        subtotal: opts.subtotal,
        total: opts.total,
        dateToday: new Date().toLocaleDateString("nl-NL"),
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.docUrl === "string" ? data.docUrl : null;
  } catch {
    return null;
  }
}

function chunkText(text: string, max = 3500): string[] {
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > max) {
    chunks.push(rest.slice(0, max));
    rest = rest.slice(max);
  }
  if (rest) chunks.push(rest);
  return chunks;
}

Deno.serve(async (req) => {
  const auth = bearerToken(req);
  if (!CRON_SECRET || auth !== CRON_SECRET) return json({ error: "Unauthorized" }, 401);

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: bufferedRows, error: bufErr } = await sb
    .from("client_messages")
    .select("id, client_id, contact, contact_key, subject, snippet, body, ts")
    .eq("user_id", USER_ID)
    .eq("channel", "fiverr")
    .eq("direction", "in")
    .is("project_id", null)
    .order("ts", { ascending: true });
  if (bufErr) return json({ error: `client_messages query failed: ${bufErr.message}` }, 500);

  const rows = (bufferedRows ?? []) as MessageRow[];
  if (!rows.length) return json({ ok: true, processed: 0 });

  const groups = new Map<string, MessageRow[]>();
  for (const r of rows) {
    const g = groups.get(r.contact_key) ?? [];
    g.push(r);
    groups.set(r.contact_key, g);
  }

  const now = Date.now();
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  const pricingRef = apiKey ? await loadServicePackages(sb) : [];

  const processed: string[] = [];
  const stillWaiting: string[] = [];
  const failed: string[] = [];

  for (const [contactKey, msgs] of groups) {
    const lastTs = new Date(msgs[msgs.length - 1].ts).getTime();
    if (now - lastTs < DEBOUNCE_MINUTES * 60000) {
      stillWaiting.push(contactKey);
      continue;
    }
    if (!apiKey) {
      failed.push(`${contactKey}: ANTHROPIC_API_KEY not set`);
      continue;
    }

    try {
      const truncated = msgs.some((m) => (m.body ?? "").length >= BODY_TRUNCATION_THRESHOLD);
      const brief = msgs
        .map((m) => `[${m.ts}] ${m.body || m.snippet || "(no content)"}`)
        .join("\n\n---\n\n");

      const draft = await draftIntake(apiKey, brief, pricingRef);
      if (!draft) {
        failed.push(`${contactKey}: drafting failed (no usable model response)`);
        continue;
      }

      const subtotal = draft.packages.reduce((sum, p) => sum + p.qty * p.unitPrice, 0);
      const total = subtotal;

      const isFallbackKey = contactKey.startsWith("fiverr-thread:");
      const username = isFallbackKey ? null : contactKey;
      let clientId = msgs.find((m) => m.client_id)?.client_id ?? null;
      let clientName = draft.clientDisplayName || msgs[0].contact || username || "New Fiverr client";

      if (!clientId) {
        const { data: newClient, error: clientErr } = await sb
          .from("clients")
          .insert({
            user_id: USER_ID,
            external_id: `local-${slugify(username ?? contactKey)}`,
            name: clientName,
            domain: "prjct",
            client_status: "Lead",
            aliases: username ? [username] : [],
            first_contact: new Date().toISOString().slice(0, 10),
          })
          .select("id, name")
          .single();
        if (clientErr) throw new Error(`client insert failed: ${clientErr.message}`);
        clientId = newClient.id as string;
        clientName = (newClient.name as string) ?? clientName;
      } else {
        const { data: existingClient } = await sb.from("clients").select("name").eq("id", clientId).maybeSingle();
        if (existingClient?.name) clientName = existingClient.name as string;
      }

      const deliverables = draft.packages.map((p) => `${p.name}${p.specs.length ? ` — ${p.specs.join("; ")}` : ""}`);

      const { data: newProject, error: projErr } = await sb
        .from("projects")
        .insert({
          user_id: USER_ID,
          external_id: `local-${slugify(username ?? contactKey)}-${slugify(draft.title)}`,
          name: draft.title,
          client_id: clientId,
          domain: "prjct",
          status: "draft",
          source: "fiverr",
          deliverables,
          scope_text: brief,
          value: total,
        })
        .select("id")
        .single();
      if (projErr) throw new Error(`project insert failed: ${projErr.message}`);
      const projectId = newProject.id as string;

      const docUrl = await generateProposalDoc({
        clientName,
        projectTitle: draft.title,
        packages: draft.packages,
        subtotal,
        total,
      });

      const proposalNote = [
        `# Project Proposal: ${draft.title}`,
        "",
        "## Deliverables",
        ...draft.packages.map((p) => `- ${p.name}: ${p.specs.join(", ")} (${p.qty} ${p.unit} × ${fmtEUR(p.unitPrice)})`),
        "",
        `## Total: ${fmtEUR(total)}${draft.pricingIsEstimate ? " (estimate — review before sending)" : ""}`,
      ].join("\n");

      const { error: invErr } = await sb.from("project_invoices").insert({
        user_id: USER_ID,
        project_id: projectId,
        number: "",
        amount: total,
        status: "draft",
        note: proposalNote,
        document_url: docUrl,
      });
      if (invErr) throw new Error(`invoice insert failed: ${invErr.message}`);

      const { error: repointErr } = await sb
        .from("client_messages")
        .update({ project_id: projectId, client_id: clientId })
        .in("id", msgs.map((m) => m.id));
      if (repointErr) throw new Error(`message repoint failed: ${repointErr.message}`);

      if (BOT_TOKEN) {
        const { data: prefs } = await sb.from("notification_prefs").select("telegram_chat_id").eq("user_id", USER_ID).maybeSingle();
        const chatId = prefs?.telegram_chat_id as number | undefined;
        if (chatId) {
          const lines: string[] = [];
          lines.push(`🆕 New Fiverr client: ${clientName}${username ? ` (@${username})` : ""}`);
          lines.push(`Project: ${draft.title}`);
          lines.push("");
          lines.push("— Full original message(s) —");
          for (const m of msgs) lines.push(`[${m.ts}] ${m.body || m.snippet || "(no content)"}`);
          lines.push("");
          lines.push("— Drafted deliverables & pricing —");
          for (const p of draft.packages) {
            lines.push(`• ${p.name} — ${p.qty} ${p.unit} × ${fmtEUR(p.unitPrice)} = ${fmtEUR(p.qty * p.unitPrice)}`);
            for (const s of p.specs) lines.push(`   - ${s}`);
          }
          lines.push(`Total: ${fmtEUR(total)}`);
          lines.push("");
          lines.push(docUrl ? `📄 Proposal doc: ${docUrl}` : "⚠️ Proposal doc was NOT generated — check the Apps Script Web App deployment/secrets.");
          lines.push("");
          lines.push("— Drafted reply (copy/paste into Fiverr) —");
          lines.push(draft.draftReply);

          const notes: string[] = [];
          if (draft.pricingIsEstimate) notes.push("Pricing is an ESTIMATE — no matching service_packages entry, please review.");
          if (truncated) notes.push("At least one message body looked truncated at the Gmail-sync cap (20000 chars) — double check the original in Fiverr/Gmail.");
          if (draft.ambiguousNotes.length) notes.push(...draft.ambiguousNotes);
          if (notes.length) {
            lines.push("");
            lines.push("⚠️ Double check:");
            for (const n of notes) lines.push(`- ${n}`);
          }

          for (const chunk of chunkText(lines.join("\n"))) {
            await sendMessage(BOT_TOKEN, chatId, chunk);
          }
        }
      }

      processed.push(contactKey);
    } catch (err) {
      failed.push(`${contactKey}: ${String(err)}`);
    }
  }

  return json({ ok: true, processed, stillWaiting, failed: failed.length ? failed : undefined });
});
