# OSLIFE · Braindump media worker

The small service that turns shared **video/audio** (YouTube, Instagram reels,
shared media files) into a Markdown note. It does the one thing a Supabase Edge
Function can't: reliably **download media (yt-dlp)** and **run ffmpeg**.

```
braindump-ingest (edge fn)  ──POST /transcribe──▶  this worker
                                                     │ yt-dlp / storage download
                                                     │ ffmpeg → 16k mono opus
                                                     │ Groq Whisper (whisper-large-v3-turbo)
                                                     │ Claude Haiku → Markdown note
                                                     ▼
                                       updates braindump_entries (service role) → status=ready
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

## Notes

- Audio is transcoded to 16 kHz mono opus, which keeps most content under Groq's
  25 MB request cap. Anything larger is auto-split into 10-minute chunks.
- No full-size originals are kept: a shared media file is deleted from Storage
  once transcribed (only the derived Markdown + remote thumbnail remain).
- `yt-dlp` breaks when platforms change — keep the image updated (`pip install -U
  yt-dlp`, i.e. rebuild). A download failure sets the row to `failed` with an
  error; the grid offers a retry.
```
