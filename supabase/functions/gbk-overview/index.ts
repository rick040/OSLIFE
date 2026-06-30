/**
 * Supabase Edge Function: gbk-overview
 * ------------------------------------
 * Proxies the Geldrop Buurtkaart WordPress plugin API so the OSLIFE frontend
 * can read live Buurtkaart data without ever exposing the API key in the
 * browser bundle. The key lives only as a Supabase secret.
 *
 * Upstream:  GET https://www.geldropbuurtkaart.nl/wp-json/gbk/v1/overview
 *            header  X-GBK-Key: <GBK_API_KEY>
 *
 * Deploy:
 *   supabase functions deploy gbk-overview --project-ref nhyunnnmdcmojvkxrbpl
 * Secrets:
 *   supabase secrets set GBK_API_KEY=<key from geldropbuurtkaart.nl admin> \
 *     GBK_BASE_URL=https://www.geldropbuurtkaart.nl --project-ref nhyunnnmdcmojvkxrbpl
 *   (GBK_BASE_URL is optional; it defaults to the production site.)
 */

const GBK_API_KEY = Deno.env.get("GBK_API_KEY") ?? "";
const GBK_BASE_URL = (Deno.env.get("GBK_BASE_URL") ?? "https://www.geldropbuurtkaart.nl").replace(/\/$/, "");

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  if (!GBK_API_KEY) {
    return json({ ok: false, error: "GBK_API_KEY secret is not set" }, 500);
  }

  // Allow ?path=overview (default) or other read-only gbk/v1 endpoints later.
  const url = new URL(req.url);
  const path = (url.searchParams.get("path") ?? "overview").replace(/[^a-z0-9/_-]/gi, "");
  const upstream = `${GBK_BASE_URL}/wp-json/gbk/v1/${path}`;

  try {
    const res = await fetch(upstream, {
      headers: { "X-GBK-Key": GBK_API_KEY, Accept: "application/json" },
    });
    const text = await res.text();
    if (!res.ok) {
      return json({ ok: false, status: res.status, error: text.slice(0, 500) }, 502);
    }
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return json({ ok: false, error: "Upstream did not return JSON" }, 502);
    }
    return json({ ok: true, data });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 502);
  }
});
