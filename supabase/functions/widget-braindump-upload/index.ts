/**
 * Supabase Edge Function: widget-braindump-upload
 * -----------------------------------------------------
 * Feeds the "Brain-dump" home-screen widget's third shortcut ("upload file"):
 * accepts a file straight from the Android widget's system file picker,
 * stores it in the same private `braindump` Storage bucket the web app's
 * drag-drop uploader uses (see src/lib/supabase.ts::uploadBraindumpFile),
 * inserts a `pending` braindump_entries row, and kicks off the same
 * braindump-ingest pipeline as every other capture path. Shared-secret
 * gated, service-role — same convention as widget-braindump-add.
 *
 *   request:  POST multipart/form-data, field "file"
 *   response: { ok: true, entryId } | { ok: false, error: "..." }
 *
 * Deploy:
 *   supabase functions deploy widget-braindump-upload --project-ref nhyunnnmdcmojvkxrbpl
 *   (uses WIDGET_SUMMARY_SECRET, same as widget-summary — no new secret needed)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SUPABASE_SERVICE_KEY, SUPABASE_URL, USER_ID, jsonResponder } from '../_shared/http.ts'

const WEBHOOK_SECRET = Deno.env.get('WIDGET_SUMMARY_SECRET') ?? Deno.env.get('WALLET_WEBHOOK_SECRET') ?? ''
const MAX_FILE_BYTES = 25 * 1024 * 1024 // 25 MB — generous for a phone upload, cheap to raise later

const json = jsonResponder()

function checkSecret(req: Request): boolean {
  const url = new URL(req.url)
  const secret = req.headers.get('x-widget-secret') ?? url.searchParams.get('secret') ?? ''
  return !!WEBHOOK_SECRET && secret === WEBHOOK_SECRET
}

/** Mirrors src/lib/braindump.ts::detectFileKind — must stay in sync. */
function detectFileKind(mime: string): string {
  if (mime === 'application/pdf') return 'pdf'
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return 'file'
}

function triggerBraindumpIngest(entryId: string): void {
  fetch(`${SUPABASE_URL}/functions/v1/braindump-ingest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    body: JSON.stringify({ entryId }),
  }).catch(() => {})
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405)
  }
  if (!checkSecret(req)) return json({ ok: false, error: 'Unauthorized' }, 401)

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return json({ ok: false, error: 'Expected multipart/form-data' }, 400)
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return json({ ok: false, error: 'Missing "file" field' }, 400)
  }
  if (file.size === 0) {
    return json({ ok: false, error: 'Empty file' }, 400)
  }
  if (file.size > MAX_FILE_BYTES) {
    return json({ ok: false, error: `File too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB)` }, 400)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const mime = file.type || 'application/octet-stream'
  const safeName = (file.name || 'file').replace(/[^\w.\-]+/g, '_').slice(-80) || 'file'
  const path = `${USER_ID}/${Date.now()}_${safeName}`

  const { error: uploadError } = await supabase.storage.from('braindump').upload(path, file, {
    contentType: mime,
    upsert: false,
  })
  if (uploadError) {
    console.error('widget-braindump-upload storage error:', uploadError)
    return json({ ok: false, error: uploadError.message }, 500)
  }

  const { data, error: insertError } = await supabase
    .from('braindump_entries')
    .insert({
      user_id: USER_ID,
      source_kind: detectFileKind(mime),
      status: 'pending',
      title: safeName,
      source_url: path,
    })
    .select('id')
    .single()
  if (insertError || !data) {
    console.error('widget-braindump-upload insert error:', insertError)
    return json({ ok: false, error: insertError?.message ?? 'Insert failed' }, 500)
  }

  triggerBraindumpIngest(data.id)
  return json({ ok: true, entryId: data.id })
})
