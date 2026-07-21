/**
 * Gmail API access for the "save as Gmail draft" reply flow (create-gmail-draft).
 * Uses a single-user OAuth client (gmail.compose scope only) whose refresh
 * token was minted once via the manual installed-app flow — never a browser
 * OAuth redirect, never a token that reaches the client bundle. This is
 * deliberately separate from the Apps Script sync (which only reads/tags
 * mail): the compose scope here is narrower than what Apps Script's GmailApp
 * access would need for writes.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRAFTS_URL = "https://gmail.googleapis.com/gmail/v1/users/me/drafts";

/** Exchange the long-lived refresh token for a short-lived access token. */
export async function getGmailAccessToken(): Promise<string> {
  const clientId = Deno.env.get("GMAIL_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GMAIL_CLIENT_SECRET")!;
  const refreshToken = Deno.env.get("GMAIL_REFRESH_TOKEN")!;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Gmail token refresh failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  if (!data.access_token) throw new Error("Gmail token refresh: no access_token in response");
  return data.access_token as string;
}

function base64url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Minimal RFC 2822 reply message, base64url-encoded for the Gmail API's `raw` field. */
function buildRawReply(opts: { to: string; subject: string; body: string }): string {
  const subject = /^\s*re\s*:/i.test(opts.subject) ? opts.subject : `Re: ${opts.subject}`;
  const message = [
    `To: ${opts.to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    opts.body,
  ].join("\r\n");
  return base64url(message);
}

/** Create a Gmail draft reply in the given thread. Returns the new draft id. */
export async function createDraftReply(opts: {
  to: string;
  subject: string;
  body: string;
  threadId: string | null;
}): Promise<string> {
  const accessToken = await getGmailAccessToken();
  const raw = buildRawReply(opts);
  const message: Record<string, unknown> = { raw };
  if (opts.threadId) message.threadId = opts.threadId;

  const res = await fetch(DRAFTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error(`Gmail draft create failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.id as string;
}
