# CodeCoach — Backend Deployment (hosted, multi-tenant)

The extension talks to a hosted FastAPI backend backed by Postgres. This doc covers
deploying that backend and pointing the extension at it.

> Status: the backend is mid-migration to multi-tenant. Auth (device token) and the
> schema (`user_id` columns, `user_problems`) are in place; endpoint scoping is being
> rolled out (Phase 3). You can deploy today to validate infra against the already-scoped
> routes (`/auth/*`, `/problems/{id}`, `/problems/{id}/notes`).

## Prerequisites

- A Groq API key (server-side only — never shipped in the extension).
- A Render **or** Fly.io account. Both configs are in the repo.

## Environment variables

| Var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ (prod) | Postgres URL. `postgres://` and driver-less `postgresql://` are auto-normalized. Unset → SQLite (local/dev). |
| `GROQ_API_KEY` | ✅ | Server-side LLM key. Set as a secret; never commit. |
| `GROQ_MODEL` | – | Default `openai/gpt-oss-20b`. |
| `AI_DAILY_QUOTA_LIMIT` | – | Default `50`. |
| `RUN_MIGRATIONS` | – | `1` (default) runs `alembic upgrade head` on container boot. Set `0` when a release/pre-deploy step owns migrations (recommended for >1 instance). |
| `WEB_CONCURRENCY` | – | uvicorn workers (default `2`). |
| `EXTRA_CORS_ORIGINS` | – | Comma-separated extra web origins. |
| `CHROME_EXTENSION_ID` | – | Pin CORS to your published extension id. Unset → any `chrome-extension://` origin is allowed (fine pre-launch). |

## Option A — Render (blueprint)

1. Push this repo to GitHub.
2. Render → **New + → Blueprint** → select the repo. It reads [`render.yaml`](render.yaml):
   creates `codecoach-db` (Postgres) and `codecoach-backend` (Docker web service),
   wiring `DATABASE_URL` automatically.
3. In the service's **Environment**, set `GROQ_API_KEY` (and optionally
   `EXTRA_CORS_ORIGINS` / `CHROME_EXTENSION_ID`).
4. Deploy. `preDeployCommand: alembic upgrade head` runs migrations before traffic;
   `RUN_MIGRATIONS=0` stops the entrypoint from double-running them.
5. Verify: `curl https://<service>.onrender.com/health` → `{"status":"ok"}`.

## Option B — Fly.io

```bash
fly launch --no-deploy            # uses fly.toml
fly postgres create --name codecoach-db
fly postgres attach codecoach-db  # sets DATABASE_URL
fly secrets set GROQ_API_KEY=sk-...
fly deploy                        # release_command runs `alembic upgrade head`
curl https://codecoach-backend.fly.dev/health
```

## Migrations

Alembic owns the Postgres schema (SQLite dev uses `create_all`). See
[`backend/migrations/README.md`](backend/migrations/README.md). Every deploy runs
`alembic upgrade head`; add `alembic check` to CI to catch model/migration drift.

## Point the extension at the deployed backend

Two edits once you have the HTTPS URL (e.g. `https://codecoach-backend.onrender.com`):

1. **`extension/public/manifest.json`** — add the origin to `host_permissions`
   (MV3 requires host permission for the service worker to fetch it), and drop
   `http://localhost:8000/*` for production builds:
   ```json
   "host_permissions": ["https://leetcode.com/*", "https://codecoach-backend.onrender.com/*"]
   ```
2. **`extension/public/background.js`** — set the default:
   ```js
   let DEFAULT_BACKEND_URL = "https://codecoach-backend.onrender.com";
   ```
   (Users can still override via the stored `customBackendUrl`.) Then `npm run build`.

## Scaling notes

- **DB pooling** is on (`pool_pre_ping`, size 5 + overflow 10 per worker). On small
  Postgres plans, keep `WEB_CONCURRENCY` modest so total connections stay under the cap.
- **Migrations once**: with multiple instances, keep `RUN_MIGRATIONS=0` and rely on
  the release/pre-deploy step.
- Several read endpoints still load full tables and group in Python (`/problems/solved`,
  `/journal/weekly`, `/export/solved-csv`) — fine per-user, revisit with indexed
  `WHERE user_id = …` queries as data grows (tracked for the Phase-3 scoping pass).
- **Secrets**: `GROQ_API_KEY` lives only in the host's secret store. Never place it in
  the repo, the image, or the extension.
