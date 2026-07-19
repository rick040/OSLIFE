# OSLIFE · cognee worker

A real knowledge-graph backend for OSLIFE's prose ("vault") content — braindump
entries, client messages, interaction summaries, period summaries. Runs
[cognee](https://github.com/topoteretes/cognee) (open source, Apache-2.0),
which extracts entities/relationships and builds an actual queryable knowledge
graph, instead of `search_memory()`'s vector+full-text hybrid ranking or
Mindmap's client-side keyword-matched graph — a genuinely different, additive
capability, not a replacement for either.

```
braindump-ingest / createInteractionRow / createMessageRow / embed-memory-backfill
   │  (same fire-and-forget call sites already used for embed-memory + materialize-note)
   ▼
cognee-remember (edge fn)  ──POST /remember, Bearer COGNEE_WORKER_SECRET──▶  proxy:8080
                                                                                 │ reverse_proxy
                                                                                 ▼
                                                                           cognee:8000
                                                                                 │ remember() → LLM entity/relationship extraction
                                                                                 ▼
                                                                     postgres (pgvector, dedicated)

HEYRA's Zoeken skill ──POST /recall, Bearer COGNEE_WORKER_SECRET──▶ cognee-search (edge fn) ──▶ proxy ──▶ cognee
```

## Endpoints (cognee's own, via the proxy)

- `POST /api/v1/remember` — body `{ "text": "...", "dataset_name": "oslife" }`.
- `POST /api/v1/recall` — body `{ "query_text": "...", "dataset_name": "oslife" }`.

Full interactive docs at `http://<host>:8080/docs` once running (same Swagger
UI cognee ships).

## Run locally

```bash
cp .env.example .env    # fill in LLM_API_KEY + COGNEE_WORKER_SECRET
docker-compose up -d
curl -H "Authorization: Bearer <COGNEE_WORKER_SECRET>" http://localhost:8080/health
```

## Deploy

Needs a host that runs docker-compose (a small VPS, or Railway's Docker
Compose project import — Fly.io's compose support is more limited, a VPS is
the simplest path). `docker-compose up -d`, then set on the
**cognee-remember** and **cognee-search** Edge Functions:

- `COGNEE_WORKER_URL` = the `proxy` service's public base URL (e.g. `https://…`,
  port 8080 — **never** expose the `cognee` service (8000) directly, it has no
  auth of its own; the Caddy `proxy` in front of it is what checks the secret)
- `COGNEE_WORKER_SECRET` = the same value as in this worker's `.env`

Without those, `cognee-remember`/`cognee-search` are silent no-ops — braindump
ingestion, interactions, messages, and search all keep working exactly as
they do today, same "app never breaks without this" contract as
`BRAINDUMP_WORKER_URL`/`VOYAGE_API_KEY`.

If deploying on a bare VPS without a host-level TLS terminator in front, either
put one there (Caddy/nginx/Cloudflare Tunnel) or point a domain at this and
remove `auto_https off` from the `Caddyfile` so Caddy gets its own cert.

## Notes

- cognee's own Postgres (`pgvector/pgvector:pg17`, in this compose file) is
  **dedicated to cognee** — it is intentionally not OSLIFE's own Supabase
  project. Keeps a raw Postgres password out of production and keeps cognee's
  graph data physically separate from OSLIFE's app tables.
- The graph store (kuzu, cognee's default) is embedded/file-based, persisted
  in the `cognee_system` volume — no separate graph-database service needed.
- cognee needs its own LLM key (see `.env.example`) — a genuinely new,
  separate cost from OSLIFE's existing `ANTHROPIC_API_KEY`/`VOYAGE_API_KEY`,
  since cognee's documented, verified provider config is OpenAI (Anthropic
  may work too via litellm's provider routing, but that's unverified — see
  the comment in `.env.example`).
- Only `braindump_entries`/`interaction`/`summaries`/`client_messages` rows
  with `tier != 'geheim'` (or no tier concept, for messages) are ever sent
  here — same tier-gating as `materialize-note`.
