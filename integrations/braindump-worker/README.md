# OSLIFE · Braindump media worker

The small service that turns shared **video/audio** (Instagram reels, shared
media files, and YouTube videos with no captions) into a Markdown note. It
does the one thing a Supabase Edge Function can't: reliably **download media
(yt-dlp)** and **run ffmpeg**.

Most YouTube videos never reach this worker at all: `braindump-ingest` fetches
title/channel/thumbnail via oEmbed and the transcript via YouTube's own
caption tracks directly (`supabase/functions/_shared/youtube.ts`) — free, no
API key, no yt-dlp, no cookies. Only a video with **no captions whatsoever**
falls through to this worker's audio+Whisper path below.

```
braindump-ingest (edge fn)  ──POST /transcribe──▶  this worker
                                                     │ yt-dlp / storage download
                                                     │ ffmpeg → 16k mono opus
                                                     │ Groq Whisper (whisper-large-v3-turbo)
                                                     │ Claude Haiku → Markdown note
                                                     ▼
                                       updates braindump_entries (service role) → status=ready
                                                     │
                                                     ├─▶ embed-memory        (searchable via HEYRA)
                                                     ├─▶ materialize-note    (.md mirror in the `vault` bucket)
                                                     └─▶ cognee-remember     (knowledge graph)
```

## Endpoints

- `POST /transcribe` — body `{ entryId, sourceUrl?, storagePath?, sourceKind? }`,
  header `Authorization: Bearer <WORKER_SECRET>`. Responds `202 { accepted: true }`
  immediately, then finishes the row asynchronously.
- `GET /health` — liveness probe.

## Run locally

```bash
cp .env.example .env    # fill in the secrets
npm install
# needs ffmpeg + yt-dlp on PATH (or just use Docker below)
node --env-file=.env server.mjs
```

## Deploy (Docker)

```bash
docker build -t oslife-braindump-worker .
docker run -p 8080:8080 --env-file .env oslife-braindump-worker
```

Any container host works (Fly.io / Railway / Render / a small VPS). After it's up,
set these on the **braindump-ingest** edge function so it delegates media to the
worker:

- `BRAINDUMP_WORKER_URL` = the worker's public base URL (e.g. `https://…`)
- `WORKER_SECRET` = the same value as here

Without those, `braindump-ingest` falls back to metadata-only for media (YouTube
oEmbed / OpenGraph), so the app still works before the worker is deployed.

## YouTube cookies (optional — works around "Sign in to confirm you're not a bot")

yt-dlp running from any cloud host's IP routinely gets blocked by YouTube's
bot-check, independent of the video itself. Fix: give yt-dlp a real browser's
session cookies.

1. While logged into YouTube in your own browser, export cookies in Netscape
   format — e.g. the "Get cookies.txt LOCALLY" extension (Chrome/Firefox).
   Must be the `cookies.txt` format (`# Netscape HTTP Cookie File` header),
   not raw JSON.
2. Upload that file as a **Secret File** on your host (Render: service →
   Environment → Secret Files → filename `youtube-cookies.txt`, content =
   the file). It's mounted at `/etc/secrets/youtube-cookies.txt`.
3. That's it — every yt-dlp call in `server.mjs` checks for that path and adds
   `--cookies` automatically when it exists (`YT_COOKIES_PATH` env var to
   override the path). No cookies file present → falls back to today's
   unauthenticated behaviour, so this is entirely opt-in.

The cookies are your real YouTube session — treat the file like a password
(don't commit it) and expect to re-export occasionally as sessions expire.
This is inherent to using a browser session at all (not a config mistake to
fix once and forget) — Google's own fraud detection watches for a session
being used from a different location than normal, which a cloud host's IP
always is.

To find out the moment that happens instead of only noticing when a video's
note looks worse than expected: set `TELEGRAM_BOT_TOKEN` (same value as the
Supabase secret notify-tick already uses) and this worker sends one Telegram
alert — throttled to once per process lifetime — the first time yt-dlp's
"Sign in to confirm you're not a bot" shows up. Boot logs also print
`YouTube cookies file FOUND/NOT FOUND at <path>` on every start, which tells
a missing/misconfigured Secret File (fixable in your host's dashboard) apart
from a present-but-rejected one (needs a fresh cookies.txt export).

## Instagram cookies (optional — works around Instagram's login wall)

Same problem as YouTube above, different platform: an unauthenticated request
(yt-dlp's video-download attempt, or the plain fetch `noteFromImagePost()`
falls back to for photo posts) increasingly gets redirected to Instagram's
login wall instead of the real post — a page with no `og:image` tag at all,
which surfaces as a bare `no og:image found` error indistinguishable from a
genuinely deleted/private post. Fix: the same cookie approach as YouTube.

1. While logged into Instagram in your own browser, export cookies in
   Netscape format (e.g. "Get cookies.txt LOCALLY").
2. Upload it as a **Secret File** named `instagram-cookies.txt` (Render:
   service → Environment → Secret Files). Mounted at
   `/etc/secrets/instagram-cookies.txt` (override via `IG_COOKIES_PATH`).
3. That's it — every yt-dlp call against an instagram.com URL adds
   `--cookies` automatically, and `noteFromImagePost()`'s plain fetch sends
   the same cookies as a `Cookie` header. No file present → falls back to
   today's unauthenticated behaviour.

Same caveats as the YouTube cookies: treat the file like a password, expect
to re-export occasionally as the session expires, and a `TELEGRAM_BOT_TOKEN`
alert fires (once per process lifetime) the first time the login wall shows
up so a stale export gets noticed instead of every capture quietly degrading
to a title-only note.

## Notes

- Audio is transcoded to 16 kHz mono opus, which keeps most content under Groq's
  25 MB request cap. Anything larger is auto-split into 10-minute chunks.
- No full-size originals are kept: a shared media file is deleted from Storage
  once transcribed (only the derived Markdown + remote thumbnail remain).
- `yt-dlp` breaks when platforms change — keep the image updated (`pip install -U
  yt-dlp`, i.e. rebuild). A download failure sets the row to `failed` with an
  error; the grid offers a retry.
- Sharing the same URL twice is deduped (30-day lookback, same content-hash
  convention as `braindump-ingest`): the second entry is marked `duplicate`
  instead of `ready` and never re-embedded/re-materialised.
- A `geheim`-tier entry is transcribed and stored like any other, but never
  reaches `materialize-note` or `cognee-remember` (same gate `braindump-ingest`
  applies).
